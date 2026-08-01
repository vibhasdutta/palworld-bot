const test = require('node:test');
const assert = require('node:assert/strict');
const { controlService, ALLOWED_ACTIONS } = require('../src/processControl');

test('controlService runs pm2 <action> <name> via the injected execFile', async () => {
  let capturedCmd, capturedArgs;
  const fakeExecFile = (cmd, args, cb) => {
    capturedCmd = cmd;
    capturedArgs = args;
    cb(null, 'ok', '');
  };

  const result = await controlService('palworld', 'start', fakeExecFile);

  assert.equal(result, 'ok');
  assert.equal(capturedCmd, 'pm2');
  assert.deepEqual(capturedArgs, ['start', 'palworld']);
});

test('controlService runs restart as an explicit pm2 stop then pm2 start, not pm2 restart', async () => {
  const calls = [];
  const fakeExecFile = (cmd, args, cb) => {
    calls.push(args);
    cb(null, 'ok', '');
  };

  const result = await controlService('palworld', 'restart', fakeExecFile);

  assert.equal(result, 'ok');
  assert.deepEqual(calls, [['stop', 'palworld'], ['start', 'palworld']]);
});

test('controlService restart does not start if stop fails', async () => {
  const calls = [];
  const fakeExecFile = (cmd, args, cb) => {
    calls.push(args);
    cb(new Error('exit 1'), '', 'process not found');
  };

  await assert.rejects(() => controlService('palworld', 'restart', fakeExecFile), /process not found/);
  assert.deepEqual(calls, [['stop', 'palworld']]);
});

test('controlService rejects unsupported actions without touching execFile', async () => {
  let called = false;
  const fakeExecFile = () => {
    called = true;
  };

  await assert.rejects(() => controlService('palworld', 'delete', fakeExecFile));
  assert.equal(called, false);
});

test('controlService surfaces stderr on failure', async () => {
  const fakeExecFile = (cmd, args, cb) => {
    cb(new Error('exit 1'), '', 'process not found');
  };

  await assert.rejects(
    () => controlService('palworld', 'stop', fakeExecFile),
    /process not found/,
  );
});

test('ALLOWED_ACTIONS lists exactly start, stop, restart', () => {
  assert.deepEqual([...ALLOWED_ACTIONS].sort(), ['restart', 'start', 'stop']);
});
