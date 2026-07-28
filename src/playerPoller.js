// Palworld's REST API has no push events for player connect/disconnect --
// only GET /v1/api/players, a snapshot. This polls it periodically per
// server and diffs against the last snapshot to report joins/leaves. A
// "leave" could be a normal disconnect, a kick, or a ban -- the players
// list can't tell those apart, so the message stays honest about that
// (just "left") instead of guessing.
function playerKey(player) {
  return player.playerId || player.userId || player.accountName || player.name;
}

function createPlayerPoller({ getServers, createClient, notify, intervalMs = 20000 }) {
  const known = new Map(); // `${guildId}:${label}` -> Map<playerKey, name>

  async function pollOnce() {
    const servers = getServers();
    const activeKeys = new Set();

    for (const server of servers) {
      const key = `${server.guildId}:${server.label}`;
      activeKeys.add(key);
      const isFirstPoll = !known.has(key);

      let players;
      try {
        const client = createClient({ baseUrl: server.restApiUrl, password: server.restApiPassword });
        ({ players = [] } = await client.getPlayers());
      } catch {
        // server unreachable this tick (restarting, REST API down, etc.) --
        // skip without updating `known`, so a transient outage doesn't read
        // as everyone leaving at once when it recovers.
        continue;
      }

      const current = new Map(players.map((p) => [playerKey(p), p.name]));
      const previous = known.get(key) || new Map();

      if (!isFirstPoll) {
        for (const [id, name] of current) {
          if (!previous.has(id)) {
            notify.serverLog(server.guildId, {
              event: 'player.join',
              server: server.label,
              player: name,
              playerId: id,
              status: 'joined',
              level: 'join',
              msg: `${name} joined ${server.label}`,
            }).catch(() => {});
          }
        }
        for (const [id, name] of previous) {
          if (!current.has(id)) {
            notify.serverLog(server.guildId, {
              event: 'player.leave',
              server: server.label,
              player: name,
              playerId: id,
              status: 'left',
              level: 'leave',
              msg: `${name} left ${server.label}`,
            }).catch(() => {});
          }
        }
      }
      known.set(key, current);
    }

    for (const key of known.keys()) {
      if (!activeKeys.has(key)) known.delete(key);
    }
  }

  function start() {
    pollOnce().catch((err) => console.error('playerPoller: initial poll failed:', err.message));
    return setInterval(() => pollOnce().catch((err) => console.error('playerPoller: poll failed:', err.message)), intervalMs);
  }

  return { start, pollOnce };
}

module.exports = { createPlayerPoller, playerKey };
