const test = require('node:test');
const assert = require('node:assert/strict');
const { createSaveFileWatcher } = require('../src/saveFileWatcher');
const { createExpectedActions } = require('../src/expectedActions');

function fakeNotify() {
  const messages = [];
  return { messages, serverLog: async (guildId, content) => { messages.push({ guildId, content }); } };
}

test('servers with no saveFilePath configured are ignored entirely', () => {
  const notify = fakeNotify();
  const watcher = createSaveFileWatcher({
    getServers: () => [{ guildId: 'G1', label: 'main' }],
    statSync: () => { throw new Error('should not be called'); },
    expectedActions: createExpectedActions(),
    notify,
  });

  watcher.pollOnce();

  assert.deepEqual(notify.messages, []);
});

test('the first poll seeds the known mtime silently', () => {
  const notify = fakeNotify();
  const watcher = createSaveFileWatcher({
    getServers: () => [{ guildId: 'G1', label: 'main', saveFilePath: '/save.sav' }],
    statSync: () => ({ mtimeMs: 1000 }),
    expectedActions: createExpectedActions(),
    notify,
  });

  watcher.pollOnce();

  assert.deepEqual(notify.messages, []);
});

test('an mtime increase on a later poll is reported as an external save', () => {
  const notify = fakeNotify();
  let mtimeMs = 1000;
  const watcher = createSaveFileWatcher({
    getServers: () => [{ guildId: 'G1', label: 'main', saveFilePath: '/save.sav' }],
    statSync: () => ({ mtimeMs }),
    expectedActions: createExpectedActions(),
    notify,
  });

  watcher.pollOnce(); // seed
  mtimeMs = 2000;
  watcher.pollOnce();

  assert.deepEqual(notify.messages, [
    {
      guildId: 'G1',
      content: {
        event: 'server.save',
        server: 'main',
        trigger: 'autosave_or_ingame',
        level: 'info',
        msg: 'World saved on main',
      },
    },
  ]);
});

test('an mtime increase marked as expected (bot-triggered /save) is not reported', () => {
  const notify = fakeNotify();
  const expectedActions = createExpectedActions();
  let mtimeMs = 1000;
  const watcher = createSaveFileWatcher({
    getServers: () => [{ guildId: 'G1', label: 'main', saveFilePath: '/save.sav' }],
    statSync: () => ({ mtimeMs }),
    expectedActions,
    notify,
  });

  watcher.pollOnce(); // seed
  expectedActions.expect('save:G1:main');
  mtimeMs = 2000;
  watcher.pollOnce();

  assert.deepEqual(notify.messages, []);
});

test('a stat failure is skipped without throwing or losing prior known state', () => {
  const notify = fakeNotify();
  let shouldFail = false;
  let mtimeMs = 1000;
  const watcher = createSaveFileWatcher({
    getServers: () => [{ guildId: 'G1', label: 'main', saveFilePath: '/save.sav' }],
    statSync: () => {
      if (shouldFail) throw new Error('ENOENT');
      return { mtimeMs };
    },
    expectedActions: createExpectedActions(),
    notify,
  });

  watcher.pollOnce(); // seed
  shouldFail = true;
  assert.doesNotThrow(() => watcher.pollOnce());
  shouldFail = false;
  watcher.pollOnce(); // same mtime as seed -- no message

  assert.deepEqual(notify.messages, []);
});
