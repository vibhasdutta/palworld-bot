const { SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder().setName('status').setDescription('Show Palworld server status');
const tier = 'operator';

async function execute(interaction, ctx) {
  try {
    const info = await ctx.palworld.getInfo();
    await interaction.reply(`**${info.servername}** — v${info.version}${info.description ? `\n${info.description}` : ''}`);
  } catch (err) {
    await interaction.reply({ content: `Server unreachable: ${err.message}`, ephemeral: true });
  }
}

module.exports = { data, tier, execute };
