const test = require('node:test');
const assert = require('node:assert/strict');
const { signPayload, verifyPayload, parseCookies, createWebServer } = require('../src/webServer');

test('signPayload and verifyPayload handle HMAC signing and verification correctly', () => {
  const secret = 'test-secret-key-12345';
  const payload = { userId: '123456789', guildId: '987654321', exp: Date.now() + 60000 };

  const signed = signPayload(payload, secret);
  assert.ok(typeof signed === 'string');
  assert.ok(signed.includes('.'));

  const verified = verifyPayload(signed, secret);
  assert.equal(verified.userId, '123456789');
  assert.equal(verified.guildId, '987654321');
});

test('verifyPayload rejects tampered signatures', () => {
  const secret = 'test-secret-key-12345';
  const payload = { userId: '123456789', guildId: '987654321' };

  const signed = signPayload(payload, secret);
  const tampered = signed.slice(0, -4) + 'abcd';

  const verified = verifyPayload(tampered, secret);
  assert.equal(verified, null);
});

test('verifyPayload rejects wrong secret key', () => {
  const secret1 = 'test-secret-key-1';
  const secret2 = 'test-secret-key-2';
  const payload = { userId: '123456789' };

  const signed = signPayload(payload, secret1);
  const verified = verifyPayload(signed, secret2);
  assert.equal(verified, null);
});

test('parseCookies parses HTTP Cookie header string into object', () => {
  const header = 'palworld_session=abc.123; theme=dark; foo=bar%20baz';
  const cookies = parseCookies(header);

  assert.equal(cookies.palworld_session, 'abc.123');
  assert.equal(cookies.theme, 'dark');
  assert.equal(cookies.foo, 'bar baz');
});

test('createWebServer returns server object with start and getBaseUrl', () => {
  const config = { clientId: '123', servers: [], roles: [] };
  const client = {};
  const notify = {};
  const auditLog = {};

  const server = createWebServer({ config, client, notify, auditLog });
  assert.ok(typeof server.start === 'function');
  assert.ok(typeof server.getBaseUrl === 'function');
  assert.ok(server.getBaseUrl().startsWith('http'));
});
