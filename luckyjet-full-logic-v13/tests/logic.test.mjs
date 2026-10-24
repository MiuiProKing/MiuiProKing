import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker from '../worker/index.js';

const html = await (await worker.fetch(new Request('https://unit.test/'), {})).text();
const context = vm.createContext({});
vm.runInContext(html.match(/<script id="analysis-core">([\s\S]*?)<\/script>/)[1], context);
const C = context.LuckyJetCore;
const NOW = Date.parse('2026-10-24T13:00:00Z');
const MINUTE = 60000;
function history(values, end = NOW) {
  return values.map((coefficient, i) => ({id: 'r-' + i, coefficient, timestamp: end - (values.length - 1 - i) * 20000, order: i + 1, estimated: false})).reverse();
}
const hot = () => history([...Array(74).fill(2), 20, 25, 30, 50, 60, 70]);

test('six 20×+ including three 50×+ announce 120× at +3 min for six minutes', () => {
  const candidate = C.bigOpportunity(hot(), NOW);
  assert.equal(candidate.rule, 'big-cluster');
  assert.equal(candidate.estimatedCoef, 120);
  assert.equal(candidate.expectedAt, NOW + 3 * MINUTE);
  assert.equal(candidate.windowMs, 6 * MINUTE);
  assert.equal(candidate.confidence, 76);
});

test('a missing qualifying high round does not invent a 120× candidate', () => {
  assert.equal(C.bigOpportunity(history([...Array(74).fill(2), 20, 25, 30, 49.99, 60, 70]), NOW), null);
  assert.equal(C.bigOpportunity(history([...Array(75).fill(2), 20, 25, 50, 60, 70]), NOW), null);
});

test('large values outside the most recent 80 rounds cannot trigger this rule', () => {
  const rows = history([...Array(8).fill(70), ...Array(80).fill(2)]);
  assert.equal(C.bigOpportunity(rows, NOW), null);
});

test('fresh big candidate is found while a normal window remains pinned', () => {
  const ordinary = C.predict(history(Array(80).fill(2)), null, NOW, 'UTC');
  const nextTime = NOW + 20000;
  const pinned = C.predict(hot(), ordinary, nextTime, 'UTC');
  assert.equal(pinned, ordinary);
  assert.equal(pinned.estimatedAt, ordinary.estimatedAt);
  const big = C.pinBigOpportunity(hot(), null, nextTime);
  assert.equal(big.estimatedCoef, 120);
  assert.equal(big.generatedAt, nextTime);
  assert.equal(big.expectedAt, nextTime + 3 * MINUTE);
});

test('new rounds never move the already announced big window', () => {
  const pinned = C.pinBigOpportunity(hot(), null, NOW);
  const changed = history(Array(80).fill(1.01), NOW + MINUTE);
  assert.equal(C.pinBigOpportunity(changed, pinned, NOW + MINUTE), pinned);
  assert.equal(C.pinBigOpportunity(changed, pinned, pinned.expectedAt + pinned.windowMs), null);
});

test('normalization retains equal coefficients of distinct IDs and exact source time', () => {
  const at = new Date(NOW).toISOString();
  const result = C.normalizeRows({rounds: [{id: 'one', coefficient: 1, round_timestamp: at, estimated: false, feed_order: 1000000000001}, {id: 'two', coefficient: 1, round_timestamp: at, estimated: true, feed_order: 1000000000002}]}, {requireId: true});
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].id, 'two');
  assert.equal(result.rows[0].timestamp, NOW);
  assert.equal(result.rows[0].coefficient, 1);
  assert.equal(result.rows[0].estimated, true);
  assert.equal(C.mergeRows(result.rows, result.rows).length, 2);
});

test('conflicting result for an existing round stops merging', () => {
  assert.throws(() => C.mergeRows([{id: 'same', coefficient: 10}], [{id: 'same', coefficient: 11}]), /ID/);
});

test('a big-window hit records the actual coefficient, ID and source time', () => {
  const big = C.pinBigOpportunity(hot(), null, NOW);
  const entry = {target: big.estimatedCoef, start: big.expectedAt, end: big.expectedAt + big.windowMs, createdAt: big.generatedAt, status: 'pending'};
  const at = entry.start + 1000;
  const result = C.evaluateEntry(entry, [{id: 'actual-hit', coefficient: 131.7, timestamp: at, estimated: false}], at + 1000);
  assert.equal(result.status, 'hit');
  assert.equal(result.result, 131.7);
  assert.equal(result.resultAt, at);
  assert.equal(result.roundId, 'actual-hit');
  assert.equal(C.evaluateEntry(entry, [{id: 'old-hit', coefficient: 200, timestamp: entry.createdAt - 1, estimated: false}], entry.end + 1).status, 'unknown');
});
