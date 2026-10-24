import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const SITE = 'https://panel.example';
const SUPABASE = 'https://unit-test.supabase.co';
const ANON_KEY = 'sb_publishable_UNIT_TEST_ONLY_DO_NOT_USE';
const ENV = Object.freeze({
  SUPABASE_URL: SUPABASE,
  SUPABASE_ANON_KEY: ANON_KEY,
  LUCKYJET_CUSTOMER_ID: 'private-customer-must-not-reach-html',
  LUCKYJET_SESSION_ID: 'private-session-must-not-reach-html',
});
const SELECT = 'id,coefficient,round_timestamp,estimated,feed_order';

test('history works on Workers runtimes without the Request cache option', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    if ('cache' in init) throw new Error("The 'cache' field on 'RequestInitializerDict' is not implemented.");
    assert.equal(init.headers['Cache-Control'], 'no-cache');
    assert.equal(init.headers.Pragma, 'no-cache');
    return json(rows(1));
  };
  try {
    const response = await invoke('/api/rounds?limit=20');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*', 'The public read-only feed must also work from the standalone HTML');
    assert.equal((await response.json()).rounds.length, 1);
  } finally {globalThis.fetch = original;}
});

function invoke(path = '/', env = ENV, method = 'GET') {
  return worker.fetch(new Request(SITE + path, {method}), env, {waitUntil() {}});
}

async function withFetch(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : null;
    const call = {
      url: new URL(request ? request.url : String(input)),
      method: init.method ?? request?.method ?? 'GET',
      headers: new Headers(init.headers ?? request?.headers),
      signal: init.signal ?? request?.signal,
    };
    calls.push(call);
    return handler(call, calls.length - 1);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: {'Content-Type': 'application/json'},
});

function rows(count, offset = 0) {
  return Array.from({length: count}, (_, index) => ({
    id: `real-round-${offset + index}`,
    coefficient: 11.25,
    round_timestamp: '2026-10-24T09:00:00.000Z',
    estimated: false,
    feed_order: 5000 - offset - index,
  }));
}

function assertFixedUpstream(call) {
  assert.equal(call.url.origin, SUPABASE);
  assert.equal(call.url.pathname, '/rest/v1/luckyjet_classic_history');
  assert.equal(call.url.searchParams.get('select'), SELECT);
  assert.equal(call.method, 'GET');
  assert.equal(call.headers.get('apikey'), ANON_KEY);
  assert.ok(call.signal instanceof AbortSignal, 'Upstream fetch must have a timeout/abort signal');
}

function assertNoPrivateValues(body) {
  for (const value of [ANON_KEY, ENV.LUCKYJET_CUSTOMER_ID, ENV.LUCKYJET_SESSION_ID]) {
    assert.ok(!body.includes(value), 'Private configuration must not be returned to the browser');
  }
}

test('GET / returns the app without exposing worker credentials or requesting upstream', async () => {
  await withFetch(() => {throw new Error('Unexpected upstream request');}, async calls => {
    const response = await invoke('/');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/i);
    const body = await response.text();
    assert.match(body, /<!doctype html>/i);
    assertNoPrivateValues(body);
    assert.equal(calls.length, 0);
  });
});

test('HEAD / and /index.html return HTML headers and no body', async () => {
  await withFetch(() => {throw new Error('Unexpected upstream request');}, async calls => {
    for (const path of ['/', '/index.html']) {
      const response = await invoke(path, ENV, 'HEAD');
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', /text\/html/i);
      assert.equal(await response.text(), '');
    }
    assert.equal(calls.length, 0);
  });
});

test('a 2000-round snapshot is paginated and equal coefficients with different IDs survive', async () => {
  const first = rows(1000);
  const second = rows(1000, 1000);
  await withFetch((_call, index) => {
    assert.ok(index < 2, 'A 2000-round snapshot must not request a third page');
    return json(index === 0 ? first : second);
  }, async calls => {
    const response = await invoke('/api/rounds?limit=2000');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/i);
    const body = await response.json();
    assert.equal(body.source, 'supabase');
    assert.deepEqual(body.rounds, [...first, ...second]);
    assert.equal(new Set(body.rounds.map(row => row.id)).size, 2000);
    assert.ok(Number.isFinite(Date.parse(body.servedAt)), 'servedAt must be an ISO timestamp');
    assert.equal(calls.length, 2);
    for (const [index, call] of calls.entries()) {
      assertFixedUpstream(call);
      assert.equal(call.url.searchParams.get('order'), 'feed_order.desc');
      assert.equal(Number(call.url.searchParams.get('limit')), 1000);
      assert.equal(Number(call.url.searchParams.get('offset') ?? 0), 0);
      if (index === 0) assert.equal(call.url.searchParams.has('feed_order'), false);
      else assert.equal(call.url.searchParams.get('feed_order'), `lt.${first.at(-1).feed_order}`);
    }
    for (let index = 1; index < body.rounds.length; index++) {
      assert.ok(body.rounds[index].feed_order < body.rounds[index - 1].feed_order);
    }
    assertNoPrivateValues(JSON.stringify(body));
  });
});

test('a short snapshot page ends pagination without manufacturing extra rounds', async () => {
  const recorded = rows(23);
  await withFetch(() => json(recorded), async calls => {
    const response = await invoke('/api/rounds?limit=2000');
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).rounds, recorded);
    assert.equal(calls.length, 1);
  });
});

test('limit 20 is respected at the upstream boundary', async () => {
  await withFetch(() => json(rows(20)), async calls => {
    const response = await invoke('/api/rounds?limit=20');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).rounds.length, 20);
    assert.equal(calls.length, 1);
    assertFixedUpstream(calls[0]);
    assert.equal(calls[0].url.searchParams.get('limit'), '20');
  });
});

test('an empty delta is a successful response and uses the strict ascending cursor filter', async () => {
  await withFetch(() => json([]), async calls => {
    const response = await invoke('/api/rounds?limit=2000&after=12345');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.source, 'supabase');
    assert.deepEqual(body.rounds, []);
    assert.equal(calls.length, 1);
    assertFixedUpstream(calls[0]);
    assert.equal(calls[0].url.searchParams.get('feed_order'), 'gt.12345');
    assert.equal(calls[0].url.searchParams.get('order'), 'feed_order.asc');
  });
});

test('cursor zero is valid', async () => {
  await withFetch(() => json([]), async calls => {
    const response = await invoke('/api/rounds?limit=20&after=0');
    assert.equal(response.status, 200);
    assert.equal(calls[0].url.searchParams.get('feed_order'), 'gt.0');
    assert.equal(calls[0].url.searchParams.get('order'), 'feed_order.asc');
  });
});

test('a 2000-round delta pages upward from the last returned feed order without offsets', async () => {
  const after = 12345;
  const ascending = rows(2000).map((row, index) => ({...row, feed_order: after + index + 1}));
  const first = ascending.slice(0, 1000);
  const second = ascending.slice(1000);
  await withFetch((_call, index) => {
    assert.ok(index < 2, 'A bounded delta must not request a third page');
    return json(index === 0 ? first : second);
  }, async calls => {
    const response = await invoke(`/api/rounds?limit=2000&after=${after}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.rounds, ascending);
    assert.equal(calls.length, 2);
    for (const [index, call] of calls.entries()) {
      assertFixedUpstream(call);
      assert.equal(call.url.searchParams.get('order'), 'feed_order.asc');
      assert.equal(call.url.searchParams.get('limit'), '1000');
      assert.equal(Number(call.url.searchParams.get('offset') ?? 0), 0);
      assert.equal(call.url.searchParams.get('feed_order'), `gt.${index === 0 ? after : first.at(-1).feed_order}`);
    }
    for (let index = 1; index < body.rounds.length; index++) {
      assert.ok(body.rounds[index].feed_order > body.rounds[index - 1].feed_order);
    }
  });
});

test('foreign URL, table, selection, ordering and key query arguments cannot control the proxy', async () => {
  await withFetch(() => json([]), async calls => {
    const query = new URLSearchParams({
      limit: '20',
      url: 'https://attacker.invalid/private',
      table: 'private_messages',
      select: '*',
      order: 'coefficient.asc',
      apikey: 'attacker-key',
    });
    const response = await invoke('/api/rounds?' + query);
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assertFixedUpstream(calls[0]);
    assert.equal(calls[0].url.searchParams.get('order'), 'feed_order.desc');
    for (const parameter of ['url', 'table', 'apikey']) {
      assert.equal(calls[0].url.searchParams.has(parameter), false);
    }
  });
});

test('invalid limits are rejected before any upstream request', async () => {
  for (const value of ['0', '19', '2001', '22.5', 'abc', 'NaN', '']) {
    await withFetch(() => {throw new Error('Unexpected upstream request');}, async calls => {
      const response = await invoke('/api/rounds?limit=' + encodeURIComponent(value));
      assert.equal(response.status, 400, `Invalid limit ${JSON.stringify(value)}`);
      assert.equal(calls.length, 0);
    });
  }
});

test('invalid or unsafe cursors are rejected before any upstream request', async () => {
  for (const value of ['-1', '1.5', '1e3', 'abc', '', '9007199254740992']) {
    await withFetch(() => {throw new Error('Unexpected upstream request');}, async calls => {
      const response = await invoke('/api/rounds?limit=20&after=' + encodeURIComponent(value));
      assert.equal(response.status, 400, `Invalid cursor ${JSON.stringify(value)}`);
      assert.equal(calls.length, 0);
    });
  }
});

test('missing configuration returns 503 without attempting a network request', async () => {
  for (const env of [{}, {SUPABASE_URL: SUPABASE}, {SUPABASE_ANON_KEY: ANON_KEY}]) {
    await withFetch(() => {throw new Error('Unexpected upstream request');}, async calls => {
      const response = await invoke('/api/rounds?limit=20', env);
      assert.equal(response.status, 503);
      assertNoPrivateValues(await response.text());
      assert.equal(calls.length, 0);
    });
  }
});

test('POST /api/rounds is rejected without forwarding the request', async () => {
  await withFetch(() => {throw new Error('Unexpected upstream request');}, async calls => {
    const response = await invoke('/api/rounds', ENV, 'POST');
    assert.equal(response.status, 405);
    assert.equal(calls.length, 0);
  });
});

test('upstream failures are sanitized and rate limiting retains status 429', async () => {
  const raw = `private upstream diagnostic ${ANON_KEY} ${ENV.LUCKYJET_SESSION_ID}`;
  for (const upstreamStatus of [401, 403, 500, 429]) {
    await withFetch(() => new Response(raw, {status: upstreamStatus}), async () => {
      const response = await invoke('/api/rounds?limit=20');
      assert.equal(response.status, upstreamStatus === 429 ? 429 : 502);
      const body = await response.text();
      assert.ok(!body.includes(raw));
      assert.ok(!body.includes('private upstream diagnostic'));
      assertNoPrivateValues(body);
    });
  }
});

test('a failed second page does not return a misleading partial success', async () => {
  await withFetch((_call, index) => index === 0 ? json(rows(1000)) : new Response('private-page-two-error', {status: 500}), async calls => {
    const response = await invoke('/api/rounds?limit=2000');
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.ok(!body.includes('private-page-two-error'));
    assert.ok(!body.includes('real-round-0'));
    assert.equal(calls.length, 2);
  });
});

test('network exceptions are sanitized', async () => {
  await withFetch(() => {throw new Error(`private transport error ${ANON_KEY}`);}, async () => {
    const response = await invoke('/api/rounds?limit=20');
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.ok(!body.includes('private transport error'));
    assertNoPrivateValues(body);
  });
});

test('malformed upstream JSON is a sanitized gateway error', async () => {
  await withFetch(() => new Response('private invalid JSON', {headers: {'Content-Type': 'application/json'}}), async () => {
    const response = await invoke('/api/rounds?limit=20');
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.ok(!body.includes('private invalid JSON'));
    assertNoPrivateValues(body);
  });
});
