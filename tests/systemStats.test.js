const test = require('node:test');
const assert = require('node:assert/strict');
const { getSystemStats } = require('../src/systemStats');

test('getSystemStats computes used/total memory in MB from an injected os module', () => {
  const fakeOs = {
    loadavg: () => [1.5, 1.2, 1.0],
    totalmem: () => 8 * 1024 * 1024 * 1024,
    freemem: () => 2 * 1024 * 1024 * 1024,
    cpus: () => [{}, {}, {}, {}],
  };

  const stats = getSystemStats(fakeOs);

  assert.equal(stats.cpuLoad1m, 1.5);
  assert.equal(stats.cpuCount, 4);
  assert.equal(stats.memTotalMb, 8192);
  assert.equal(stats.memUsedMb, 6144);
});

test('getSystemStats works against the real os module without throwing', () => {
  const stats = getSystemStats();
  assert.equal(typeof stats.cpuLoad1m, 'number');
  assert.ok(stats.cpuCount >= 1);
  assert.ok(stats.memUsedMb <= stats.memTotalMb);
});
