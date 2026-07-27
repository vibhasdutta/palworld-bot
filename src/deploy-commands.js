const { REST, Routes } = require('discord.js');
const { loadConfig } = require('./config');
const loadCommands = require('./commands');

const config = loadConfig();
const commandData = [...loadCommands().values()].map((c) => c.data.toJSON());

const rest = new REST().setToken(config.discordToken);

(async () => {
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);
  const data = await rest.put(route, { body: commandData });
  console.log(`Registered ${data.length} slash commands.`);
})();
