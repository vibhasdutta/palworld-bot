const fs = require('fs');

/**
 * Parses the INI content and extracts the OptionSettings into a Map
 * @param {string} iniContent - The full INI file content
 * @returns {Map<string, string>} A map of key-value pairs
 */
function parseOptionSettings(iniContent) {
  const map = new Map();
  if (!iniContent) return map;

  const prefix = 'OptionSettings=(';
  const startIndex = iniContent.indexOf(prefix);
  if (startIndex === -1) return map;

  const contentStartIndex = startIndex + prefix.length;
  // OptionSettings is supposed to end with a parenthesis, so let's find the closing parenthesis of the overall block.
  let contentEndIndex = iniContent.lastIndexOf(')');
  if (contentEndIndex <= contentStartIndex) {
      // Just in case it's malformed or not found
      contentEndIndex = iniContent.length;
  }
  const settingsString = iniContent.substring(contentStartIndex, contentEndIndex);

  let currentKey = '';
  let currentValue = '';
  let isKey = true;
  let inQuotes = false;
  let nestedParens = 0;

  for (let i = 0; i < settingsString.length; i++) {
    const char = settingsString[i];

    if (inQuotes) {
      if (char === '"') {
        inQuotes = false;
      }
      currentValue += char;
    } else if (char === '"') {
      inQuotes = true;
      currentValue += char;
    } else if (char === '(') {
      nestedParens++;
      currentValue += char;
    } else if (char === ')') {
      nestedParens--;
      currentValue += char;
    } else if (char === '=' && isKey) {
      isKey = false;
    } else if (char === ',' && !inQuotes && nestedParens === 0) {
      map.set(currentKey.trim(), currentValue);
      currentKey = '';
      currentValue = '';
      isKey = true;
    } else {
      if (isKey) {
        currentKey += char;
      } else {
        currentValue += char;
      }
    }
  }

  if (currentKey) {
    map.set(currentKey.trim(), currentValue);
  }

  return map;
}

function serializeOptionSettings(settingsMap) {
  const settingsArray = [];
  for (const [key, value] of settingsMap.entries()) {
    settingsArray.push(`${key}=${value}`);
  }
  const settingsString = settingsArray.join(',');
  return `[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(${settingsString})\n`;
}

function readWorldSettings(settingsFilePath, readFileSync = fs.readFileSync) {
  try {
    const content = readFileSync(settingsFilePath, 'utf8');
    return {
      settings: parseOptionSettings(content),
      exists: true
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        settings: new Map(),
        exists: false
      };
    }
    throw error;
  }
}

function writeWorldSettings(settingsFilePath, settingsMap, writeFileSync = fs.writeFileSync) {
  const content = serializeOptionSettings(settingsMap);
  writeFileSync(settingsFilePath, content, 'utf8');
}

module.exports = {
  parseOptionSettings,
  serializeOptionSettings,
  readWorldSettings,
  writeWorldSettings
};
