// Node VM integration of the served scripts and visible DOM outputs.
// This deliberately does not claim browser layout, accessibility or network QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker from '../worker/index.js';

const SITE = 'https://panel.example';
const PREFIX = 'luckyjet-full-logic-v1:';
const BASE_TIME = Date.parse('2026-10-24T13:00:00.000Z');
const ENV = Object.freeze({
  SUPABASE_URL: 'https://fake-live.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_FAKE_TEST_KEY_ONLY',
  LUCKYJET_CUSTOMER_ID: 'SERVER_ONLY_CUSTOMER',
  LUCKYJET_SESSION_ID: 'SERVER_ONLY_SESSION',
});

class FakeElement {
  constructor(tag, attrs, document) {
    Object.assign(this, {tagName: tag.toUpperCase(), attrs, document,
      id: attrs.id || '', value: attrs.value || '', hidden: 'hidden' in attrs,
      checked: 'checked' in attrs, disabled: 'disabled' in attrs,
      textContent: '', innerHTML: '', className: attrs.class || '', listeners: new Map()});
    this.dataset = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-'))
      .map(([k, value]) => [k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value]));
    this.style = {setProperty(name, value) {this[name] = value;}};
    this.classList = {
      toggle: (name, force) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        const next = force ?? !classes.has(name);
        next ? classes.add(name) : classes.delete(name);
        this.className = [...classes].join(' ');
        return next;
      },
      contains: name => this.className.split(/\s+/).includes(name),
    };
  }
  addEventListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(fn);
  }
  emit(name, event = {}) {for (const fn of this.listeners.get(name) || []) fn({target: this, ...event});}
  focus() {this.document.activeElement = this;}
  closest() {return this;}
  getClientRects() {return this.hidden ? [] : [{}];}
  querySelectorAll() {return [];}
}

function parseAttributes(text) {
  return Object.fromEntries([...text.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
    .map(match => [match[1], match[2] ?? match[3] ?? match[4] ?? '']));
}

function fakeDocument(html) {
  const nodes = [], ids = new Map(), listeners = new Map();
  const document = {
    hidden: false, activeElement: null,
    getElementById: id => ids.get(id) || null,
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },
    emit(name, event) {for (const fn of listeners.get(name) || []) fn(event);},
    querySelectorAll(selector) {
      if (selector === '[data-zone]') return nodes.filter(node => 'zone' in node.dataset);
      if (selector === '.view') return nodes.filter(node => node.classList.contains('view'));
      if (selector === '.nav-item[data-tab]') return nodes.filter(node => node.classList.contains('nav-item') && 'tab' in node.dataset);
      throw Error('Unexpected fake DOM selector: ' + selector);
    },
  };
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  for (const match of markup.matchAll(/<([a-z][\w:-]*)\b([^<>]*?)\/?\s*>/gi)) {
    const node = new FakeElement(match[1], parseAttributes(match[2]), document);
    nodes.push(node);
    if (node.id) ids.set(node.id, node);
    if (node.tagName === 'BODY') document.body = node;
  }
  // Selected option defaults are meaningful inputs to the chart/gap renderers.
  for (const select of markup.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const node = ids.get(parseAttributes(select[1]).id);
    const options = [...select[2].matchAll(/<option\b([^>]*)>/gi)].map(match => parseAttributes(match[1]));
    if (node) node.value = (options.find(option => 'selected' in option) || options[0] || {}).value || '';
  }
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = parseAttributes(script[1]);
    if (attrs.id) {
      const node = new FakeElement('script', attrs, document);
      node.textContent = script[2];
      ids.set(attrs.id, node);
    }
  }
  return {document, nodes, ids};
}

function historyRows(count = 24) {
  return Array.from({length: count}, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(1000 - index).padStart(12, '0')}`,
    coefficient: [11.66, 2.01, 1.35, 25.63, 2.15, 1.02][index % 6],
    round_timestamp: new Date(BASE_TIME - 1000 - index * 20000).toISOString(),
    estimated: false,
    feed_order: 1000000001000 - index,
  }));
}

const payload = rounds => ({source: 'supabase', rounds, servedAt: new Date(BASE_TIME).toISOString(), gameOrderVerified: false});
const flush = async () => {for (let i = 0; i < 24; i++) await Promise.resolve();};

async function boot(responses, saved = {}) {
  const response = await worker.fetch(new Request(SITE + '/'), ENV);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(!html.includes(ENV.SUPABASE_ANON_KEY));
  assert.ok(!html.includes(ENV.LUCKYJET_CUSTOMER_ID));
  assert.ok(!html.includes(ENV.LUCKYJET_SESSION_ID));
  const dom = fakeDocument(html), timers = new Map(), calls = [], storage = new Map(Object.entries(saved));
  let now = BASE_TIME, timerId = 0;
  class ClockDate extends Date {
    constructor(...args) {super(...(args.length ? args : [now]));}
    static now() {return now;}
  }
  const setTimer = (fn, delay, interval = false) => {
    const id = ++timerId;
    timers.set(id, {fn, at: now + Number(delay), delay: Number(delay), interval});
    return id;
  };
  const windowListeners = new Map();
  const location = new URL(SITE + '/');
  const context = vm.createContext({
    document: dom.document, location, Date: ClockDate, Intl,
    URL, URLSearchParams, AbortController, Blob, console,
    history: {replaceState(_state, _title, hash) {location.hash = hash;}},
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    setTimeout: (fn, delay) => setTimer(fn, delay),
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => setTimer(fn, delay, true),
    clearInterval: id => timers.delete(id),
    addEventListener(name, fn) {
      if (!windowListeners.has(name)) windowListeners.set(name, []);
      windowListeners.get(name).push(fn);
    },
    scrollTo() {},
    fetch: async (input, init) => {
      const url = new URL(String(input), SITE);
      calls.push({url, init});
      assert.equal(url.origin, SITE, 'browser must request only its own proxy');
      assert.equal(url.pathname, '/api/rounds');
      const next = responses.shift();
      assert.notEqual(next, undefined, 'unexpected extra request');
      if (next instanceof Error) throw next;
      return {ok: true, status: 200, json: async () => structuredClone(next)};
    },
  });
  context.window = context;
  for (const id of ['analysis-core', 'application']) {
    const code = dom.ids.get(id)?.textContent;
    assert.ok(code, 'served inline script missing: ' + id);
    vm.runInContext(code, context, {filename: id + '.served.js', timeout: 1000});
  }
  await flush();
  async function advance(milliseconds) {
    const target = now + milliseconds;
    for (let i = 0; i < 100; i++) {
      const next = [...timers].filter(([, item]) => item.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) {now = target; await flush(); return;}
      const [id, item] = next;
      now = item.at;
      item.interval ? item.at += item.delay : timers.delete(id);
      await item.fn();
      await flush();
    }
    throw Error('Fake timer did not settle');
  }
  const action = name => dom.document.emit('click', {target: {dataset: {action: name}, closest() {return this;}}});
  return {...dom, html, calls, storage, advance, action,
    cached: () => JSON.parse(storage.get(PREFIX + 'cache'))};
}

test('served application auto-starts our proxy and immediately displays real-schema coefficients', async () => {
  const rows = historyRows();
  const app = await boot([payload(rows)], {
    [PREFIX + 'settings']: JSON.stringify({source: 'supabase', connectionVersion: 4, remember: true}),
    [PREFIX + 'api-key']: JSON.stringify('OLD_BROWSER_KEY_MUST_NOT_BE_SENT'),
  });
  assert.equal(app.calls.length, 1, 'no connection button or credential entry required');
  const {url, init} = app.calls[0];
  assert.equal(url.searchParams.get('limit'), '2000');
  assert.equal(url.searchParams.get('after'), null);
  assert.equal(init.credentials, 'same-origin');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.equal(init.cache, 'no-store');
  assert.deepEqual(Object.keys(init.headers), ['Accept']);
  assert.equal(app.ids.get('live-coefficient-value').textContent, '11.66×');
  assert.match(app.ids.get('live-coefficients-status').textContent, /API ПОДКЛЮЧЁН/);
  assert.equal(app.ids.get('live-connection-error').hidden, true);
  assert.equal(app.ids.get('onboarding').hidden, true);
  assert.equal(app.cached().rows.length, 24);
  assert.equal(app.cached().rows[0].id, rows[0].id);
  assert.equal(app.cached().rows[0].timestamp, Date.parse(rows[0].round_timestamp));
  assert.equal(app.cached().rows[0].order, rows[0].feed_order);
  assert.match(app.ids.get('history-table').innerHTML, new RegExp(rows[0].id));
  assert.doesNotMatch(app.ids.get('prediction-rule').textContent, /Нужно 20 раундов/);
});

test('empty delta retains history, then a new round with the same coefficient is appended exactly once', async () => {
  const rows = historyRows();
  const next = {...rows[0], id: '00000000-0000-4000-8000-000000001001',
    round_timestamp: new Date(BASE_TIME + 4000).toISOString(), feed_order: rows[0].feed_order + 1};
  const app = await boot([payload(rows), payload([]), payload([next]), payload([next])]);
  const before = app.ids.get('live-coefficients-list').innerHTML;
  await app.advance(2500);
  assert.equal(app.calls[1].url.searchParams.get('after'), String(rows[0].feed_order));
  assert.equal(app.cached().rows.length, 24);
  assert.equal(app.ids.get('live-coefficients-list').innerHTML, before);
  assert.equal(app.ids.get('live-connection-error').hidden, true);
  assert.match(app.ids.get('live-coefficients-status').textContent, /API ПОДКЛЮЧЁН/);
  await app.advance(2500);
  assert.equal(app.cached().rows.length, 25);
  assert.equal(app.cached().rows[0].id, next.id);
  assert.equal(app.cached().rows[1].id, rows[0].id);
  assert.equal(app.cached().rows[0].coefficient, app.cached().rows[1].coefficient);
  assert.match(app.ids.get('history-table').innerHTML, new RegExp(next.id));
  await app.advance(2500);
  assert.equal(app.calls[3].url.searchParams.get('after'), String(next.feed_order));
  assert.equal(app.cached().rows.length, 25, 'repeated delivery of an ID must not duplicate it');
  assert.equal(app.ids.get('live-connection-error').hidden, true);
});

test('history filters and pause/reconnect work against the real served scripts', async () => {
  const rows = historyRows();
  const app = await boot([payload(rows), payload(rows)]);
  const historyTab = app.nodes.find(node => node.dataset.tab === 'history');
  assert.ok(historyTab);
  app.document.emit('click', {target: historyTab});
  assert.equal(app.ids.get('view-history').classList.contains('active'), true);
  app.ids.get('history-search').value = rows[0].id;
  app.ids.get('history-search').emit('input');
  assert.match(app.ids.get('history-summary').textContent, /Показано 1 из 1/);
  app.action('toggle-run');
  await app.advance(5000);
  assert.equal(app.calls.length, 1, 'paused polling must not make another request');
  app.action('reconnect');
  await flush();
  assert.equal(app.calls.length, 2);
  assert.equal(app.calls[1].url.searchParams.get('after'), null, 'reconnect reloads a full initial snapshot');
  assert.equal(app.cached().rows.length, 24);
  assert.equal(app.ids.get('live-connection-error').hidden, true);
});
