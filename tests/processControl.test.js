const test = require('node:test');
const assert = require('node:assert/strict');
const { controlService, ALLOWED_ACTIONS } = require('../src/processControl');

test('controlService runs sudo systemctl <action> <unit> via the injected execFile', async () => {
  let capturedCmd, capturedArgs;
  const fakeExecFile = (cmd, args, cb) => {
    capturedCmd = cmd;
    capturedArgs = args;
    cb(null, 'ok', '');
  };

  const result = await controlService('palworld.service', 'restart', fakeExecFile);

  assert.equal(result, 'ok');
  assert.equal(capturedCmd, 'sudo');
  assert.deepEqual(capturedArgs, ['/usr/bin/systemctl', 'restart', 'palworld.service']);
});

test('controlService rejects unsupported actions without touching execFile', async () => {
  let called = false;
  const fakeExecFile = () => {
    called = true;
  };

  await assert.rejects(() => controlService('palworld.service', 'delete', fakeExecFile));
  assert.equal(called, false);
});

test('controlService surfaces stderr on failure', async () => {
  const fakeExecFile = (cmd, args, cb) => {
    cb(new Error('exit 1'), '', 'permission denied');
  };

  await assert.rejects(
    () => controlService('palworld.service', 'stop', fakeExecFile),
    /permission denied/,
  );
});

test('ALLOWED_ACTIONS lists exactly start, stop, restart', () => {
  assert.deepEqual([...ALLOWED_ACTIONS].sort(), ['restart', 'start', 'stop']);
});
