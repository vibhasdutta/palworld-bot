const { loadConfig } = require('../src/config');
const { createPalworldClient } = require('../src/palworldClient');

(async () => {
  const config = loadConfig();
  const client = createPalworldClient({ baseUrl: config.restApiUrl, password: config.restApiPassword });
  const info = await client.getInfo();
  console.log('Connected to Palworld REST API:', info);
})();
