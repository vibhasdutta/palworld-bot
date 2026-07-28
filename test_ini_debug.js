const c = require("./src/config.js");
const r = c.readIniOptionSettings("/home/morfit/palworld/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini");
console.log("INI parse result:", JSON.stringify(r));

const servers = c.loadServersFile("./config/servers.json");
const all = c.allCompleteServers(servers);
for (const s of all) {
  const conn = c.resolveServerConnection(s);
  console.log(`Server ${s.label} (guild ${s.guildId}): url=${conn.restApiUrl} pw=${conn.restApiPassword}`);
}
