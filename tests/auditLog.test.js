const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { appendAuditEntry, readLog } = require('../src/auditLog');

test('appendAuditEntry creates the file and adds a timestamped entry', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
  const logPath = path.join(dir, 'nested', 'audit-log.json');

  appendAuditEntry(logPath, { actor: 'user1', command: 'kick', target: 'steam_1' });
  const log = readLog(logPath);

  assert.equal(log.length, 1);
  assert.equal(log[0].actor, 'user1');
  assert.equal(log[0].command, 'kick');
  assert.equal(typeof log[0].timestamp, 'string');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('appendAuditEntry appends to an existing log', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
  const logPath = path.join(dir, 'audit-log.json');

  appendAuditEntry(logPath, { actor: 'user1', command: 'save' });
  appendAuditEntry(logPath, { actor: 'user2', command: 'ban', target: 'steam_2' });
  const log = readLog(logPath);

  assert.equal(log.length, 2);
  assert.equal(log[1].command, 'ban');
  fs.rmSync(dir, { recursive: true, force: true });
});
