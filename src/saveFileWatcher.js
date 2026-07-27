// Palworld's REST API has no "world was just saved" signal -- only /save,
// which triggers one but doesn't confirm it, and no endpoint reports when
// the last save happened. Since the bot runs on the same machine as the
// server, watching the actual save file's mtime on disk catches saves
// however they happen: autosave (AutoSaveSpan), an in-game/console save, or
// our own /save. `expectedActions` (shared with pm2Watcher, keyed
// `save:${guildId}:${label}` to not collide with its pm2-process-name keys)
// filters out the ones the bot itself just triggered.
function createSaveFileWatcher({ getServers, statSync, expectedActions, notify, intervalMs = 15000 }) {
  const known = new Map(); // `${guildId}:${label}` -> last mtimeMs

  function pollOnce() {
    const servers = getServers().filter((s) => s.saveFilePath);
    const activeKeys = new Set();

    for (const server of servers) {
      const key = `${server.guildId}:${server.label}`;
      activeKeys.add(key);

      let mtimeMs;
      try {
        mtimeMs = statSync(server.saveFilePath).mtimeMs;
      } catch {
        continue; // file missing / transient read error this cycle -- skip
      }

      const previous = known.get(key);
      const isFirstPoll = previous === undefined;
      if (!isFirstPoll && mtimeMs > previous && !expectedActions.wasExpected(`save:${key}`)) {
        notify.serverLog(server.guildId, {
          title: 'World Saved',
          description: `💾 World saved on **${server.label}** (autosave or in-game, not \`/save\`).`,
          level: 'info',
        }).catch(() => {});
      }
      known.set(key, mtimeMs);
    }

    for (const key of known.keys()) {
      if (!activeKeys.has(key)) known.delete(key);
    }
  }

  function start() {
    pollOnce();
    return setInterval(pollOnce, intervalMs);
  }

  return { start, pollOnce };
}

module.exports = { createSaveFileWatcher };
