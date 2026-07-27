const test = require('node:test');
const assert = require('node:assert/strict');
const { createExpectedActions } = require('../src/expectedActions');

test('wasExpected is true right after expect(), and consumes the flag (one-shot)', () => {
  const actions = createExpectedActions(8000, () => 1000);
  actions.expect('palworld');

  assert.equal(actions.wasExpected('palworld'), true);
  assert.equal(actions.wasExpected('palworld'), false);
});

test('wasExpected is false once the TTL has elapsed', () => {
  let currentTime = 1000;
  const actions = createExpectedActions(5000, () => currentTime);
  actions.expect('palworld');

  currentTime = 1000 + 5001;
  assert.equal(actions.wasExpected('palworld'), false);
});

test('wasExpected is false for a process that was never marked', () => {
  const actions = createExpectedActions(8000, () => 1000);
  assert.equal(actions.wasExpected('palworld-bot'), false);
});
