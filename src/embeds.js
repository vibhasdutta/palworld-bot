const { EmbedBuilder } = require('discord.js');

function successEmbed(description) {
  return new EmbedBuilder().setColor(0x2ecc71).setDescription(description).setTimestamp();
}

function errorEmbed(description) {
  return new EmbedBuilder().setColor(0xe74c3c).setDescription(description).setTimestamp();
}

module.exports = { successEmbed, errorEmbed };
