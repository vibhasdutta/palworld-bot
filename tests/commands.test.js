const test = require('node:test');
const assert = require('node:assert/strict');
const loadCommands = require('../src/commands');

test('every command module exports a matching name, a valid tier, and an execute function', () => {
  const commands = loadCommands();
  assert.ok(commands.size >= 10, `expected at least 10 commands, found ${commands.size}`);

  for (const [name, command] of commands) {
    assert.equal(typeof command.data.name, 'string');
    assert.equal(command.data.name, name);
    assert.ok(['admin', 'operator', 'common'].includes(command.tier), `${name} has an invalid tier: ${command.tier}`);
    assert.equal(typeof command.execute, 'function');
  }
});
