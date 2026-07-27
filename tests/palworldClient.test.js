const test = require('node:test');
const assert = require('node:assert/strict');
const { createPalworldClient, PalworldApiError } = require('../src/palworldClient');

function withStubFetch(stub, run) {
  const original = global.fetch;
  global.fetch = stub;
  return run().finally(() => {
    global.fetch = original;
  });
}

test('getInfo sends Basic Auth with the admin username and parses JSON', async () => {
  let capturedUrl, capturedOptions;
  await withStubFetch(async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ servername: 'Test', version: '1.0' }),
    };
  }, async () => {
    const client = createPalworldClient({ baseUrl: 'http://localhost:8212', password: 'secret' });
    const info = await client.getInfo();
    assert.equal(info.servername, 'Test');
  });

  assert.equal(capturedUrl, 'http://localhost:8212/v1/api/info');
  assert.equal(capturedOptions.headers.Authorization, `Basic ${Buffer.from('admin:secret').toString('base64')}`);
});

test('kick sends a POST with a JSON body', async () => {
  let capturedOptions;
  await withStubFetch(async (url, options) => {
    capturedOptions = options;
    return { ok: true, headers: { get: () => '' } };
  }, async () => {
    const client = createPalworldClient({ baseUrl: 'http://localhost:8212', password: 'secret' });
    await client.kick('steam_1', 'bye');
  });

  assert.equal(capturedOptions.method, 'POST');
  assert.deepEqual(JSON.parse(capturedOptions.body), { userid: 'steam_1', message: 'bye' });
});

test('getMetrics hits the metrics endpoint and returns the parsed body', async () => {
  let capturedUrl;
  await withStubFetch(async (url) => {
    capturedUrl = url;
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ serverfps: 60, currentplayernum: 2, maxplayernum: 32, uptime: 3600, days: 5 }),
    };
  }, async () => {
    const client = createPalworldClient({ baseUrl: 'http://localhost:8212', password: 'secret' });
    const metrics = await client.getMetrics();
    assert.equal(metrics.serverfps, 60);
  });

  assert.equal(capturedUrl, 'http://localhost:8212/v1/api/metrics');
});

test('a network failure is wrapped in PalworldApiError', async () => {
  await withStubFetch(async () => {
    throw new Error('ECONNREFUSED');
  }, async () => {
    const client = createPalworldClient({ baseUrl: 'http://localhost:8212', password: 'secret' });
    await assert.rejects(() => client.getInfo(), PalworldApiError);
  });
});

test('a non-2xx response is wrapped in PalworldApiError', async () => {
  await withStubFetch(async () => ({
    ok: false,
    status: 401,
    headers: { get: () => '' },
    text: async () => 'unauthorized',
  }), async () => {
    const client = createPalworldClient({ baseUrl: 'http://localhost:8212', password: 'wrong' });
    await assert.rejects(() => client.getInfo(), /401/);
  });
});
