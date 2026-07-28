const test = require('node:test');
const assert = require('node:assert');
const {
  parseOptionSettings,
  serializeOptionSettings,
  readWorldSettings,
  writeWorldSettings
} = require('../src/worldSettingsParser.js');

test('Parse simple key=value pairs', () => {
  const ini = '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(Difficulty=Custom,ExpRate=1.000000)';
  const map = parseOptionSettings(ini);
  assert.strictEqual(map.get('Difficulty'), 'Custom');
  assert.strictEqual(map.get('ExpRate'), '1.000000');
  assert.strictEqual(map.size, 2);
});

test('Parse quoted strings with special chars', () => {
  const ini = '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(ServerName="Isle of Palcadia, ⚔️",AdminPassword="M@rfit")';
  const map = parseOptionSettings(ini);
  assert.strictEqual(map.get('ServerName'), '"Isle of Palcadia, ⚔️"');
  assert.strictEqual(map.get('AdminPassword'), '"M@rfit"');
});

test('Parse nested parentheses (CrossplayPlatforms)', () => {
  const ini = '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(CrossplayPlatforms=(Steam,Xbox,PS5,Mac),Other=Value)';
  const map = parseOptionSettings(ini);
  assert.strictEqual(map.get('CrossplayPlatforms'), '(Steam,Xbox,PS5,Mac)');
  assert.strictEqual(map.get('Other'), 'Value');
});

test('Parse empty values', () => {
  const ini = '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(DenyTechnologyList=,PublicIP="",End=Yes)';
  const map = parseOptionSettings(ini);
  assert.strictEqual(map.get('DenyTechnologyList'), '');
  assert.strictEqual(map.get('PublicIP'), '""');
  assert.strictEqual(map.get('End'), 'Yes');
});

test('Round-trip: parse -> serialize -> parse gives identical Map', () => {
  const ini = '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(Difficulty=Custom,ServerName="Pal, Server",CrossplayPlatforms=(Steam,Xbox),Empty=)';
  const map1 = parseOptionSettings(ini);
  const newIni = serializeOptionSettings(map1);
  const map2 = parseOptionSettings(newIni);
  
  assert.deepStrictEqual([...map1.entries()], [...map2.entries()]);
});

test('readWorldSettings returns exists:false for missing file', () => {
  const mockRead = () => {
    const error = new Error('ENOENT');
    error.code = 'ENOENT';
    throw error;
  };
  const result = readWorldSettings('nonexistent.ini', mockRead);
  assert.strictEqual(result.exists, false);
  assert.ok(result.settings instanceof Map);
});

test('writeWorldSettings preserves the [/Script/Pal.PalGameWorldSettings] header', () => {
  let writtenData = '';
  const mockWrite = (path, data) => {
    writtenData = data;
  };
  const map = new Map([['Test', '1']]);
  writeWorldSettings('dummy.ini', map, mockWrite);
  
  assert.ok(writtenData.includes('[/Script/Pal.PalGameWorldSettings]'));
  assert.ok(writtenData.includes('OptionSettings=(Test=1)'));
});

test('Test with the FULL real INI content', () => {
  const ini = `[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(Difficulty=Custom,RandomizerType=None,RandomizerSeed="",bIsRandomizerPalLevelRandom=False,DayTimeSpeedRate=1.000000,NightTimeSpeedRate=1.000000,ExpRate=1.000000,PalCaptureRate=1.000000,ServerName="Isle of Palcadia",ServerDescription="⚔️ Fair PvP • 🤝 Guilds • 🥚 Instant Hatch • 💬 discord.gg/zkafANZcDs",AdminPassword="M@rfit",ServerPassword="connect",CrossplayPlatforms=(Steam,Xbox,PS5,Mac),DenyTechnologyList=,BanListURL="https://b.palworldgame.com/api/banlist.txt")`;
  
  const map = parseOptionSettings(ini);
  assert.strictEqual(map.get('Difficulty'), 'Custom');
  assert.strictEqual(map.get('RandomizerSeed'), '""');
  assert.strictEqual(map.get('ServerName'), '"Isle of Palcadia"');
  assert.strictEqual(map.get('ServerDescription'), '"⚔️ Fair PvP • 🤝 Guilds • 🥚 Instant Hatch • 💬 discord.gg/zkafANZcDs"');
  assert.strictEqual(map.get('CrossplayPlatforms'), '(Steam,Xbox,PS5,Mac)');
  assert.strictEqual(map.get('DenyTechnologyList'), '');
  assert.strictEqual(map.get('BanListURL'), '"https://b.palworldgame.com/api/banlist.txt"');
});
