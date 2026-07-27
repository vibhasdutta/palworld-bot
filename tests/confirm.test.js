const test = require('node:test');
const assert = require('node:assert/strict');
const { buildConfirmRow } = require('../src/confirm');

test('buildConfirmRow returns confirm/cancel buttons with predictable custom IDs', () => {
  const { row, confirmId, cancelId } = buildConfirmRow('ban:steam_1');

  assert.equal(confirmId, 'confirm:ban:steam_1');
  assert.equal(cancelId, 'cancel:ban:steam_1');

  const json = row.toJSON();
  const customIds = json.components.map((c) => c.custom_id);
  assert.deepEqual(customIds.sort(), [cancelId, confirmId].sort());
});
