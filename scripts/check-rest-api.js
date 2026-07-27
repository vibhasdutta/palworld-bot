const { loadConfig, findGuildServer } = require('../src/config');
const { createPalworldClient } = require('../src/palworldClient');

const guildId = process.argv[2];
if (!guildId) {
  console.error('Usage: node scripts/check-rest-api.js <guildId>');
  console.error('(each guild has its own server in config/servers.json — pick which one to test)');
  process.exit(1);
}

(async () => {
  const config = loadConfig();
  const server = findGuildServer(config.servers, guildId);
  if (!server) {
    console.error(`No server configured for guild ${guildId} in config/servers.json.`);
    process.exit(1);
  }

  const client = createPalworldClient({ baseUrl: server.restApiUrl, password: server.restApiPassword });
  const info = await client.getInfo();
  console.log(`Connected to Palworld REST API for guild ${guildId}:`, info);
})();
