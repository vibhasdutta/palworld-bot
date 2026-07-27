# Palworld Discord Admin Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js/discord.js Discord bot that lets role-gated Discord users manage the Palworld dedicated server (player kick/ban/unban, announcements, saves, and start/stop/restart) via the game's REST API and systemd, per `docs/superpowers/specs/2026-07-27-palworld-discord-bot-design.md`.

**Architecture:** Slash commands route through a permission layer (Discord role → `admin`/`operator` tier, config stored in a local JSON file) to one of two backends: the Palworld REST API (`localhost:8212`, Basic Auth) for in-game actions, or `systemctl` (via a scoped sudoers rule) for OS-level process control. Every mutating action is appended to a local JSON audit log.

**Tech Stack:** Node.js ≥20.6 (native `fetch` and `--env-file`, no HTTP/env dependency needed), `discord.js` (only third-party dependency), Node's built-in `node:test` runner (no test framework needed).

---

## File Structure

```
package.json
.env.example                    # secrets template (token, REST password) — gitignored when filled in
config/roles.example.json       # role-tier mapping template
config/roles.json               # actual mapping — gitignored
data/                           # audit-log.json lives here — gitignored
deploy/palworld-bot.service     # systemd unit for the bot itself
deploy/palworld-bot.sudoers     # scoped sudoers rule for systemctl control
scripts/check-rest-api.js       # manual smoke test against the live server
src/config.js                   # loads env + config/roles.json
src/permissions.js              # tier resolution / access check
src/auditLog.js                 # append-only JSON action log
src/palworldClient.js           # REST API wrapper
src/processControl.js           # systemctl wrapper
src/confirm.js                  # Discord button confirmation helper
src/commands/status.js
src/commands/players.js
src/commands/announce.js
src/commands/kick.js
src/commands/ban.js
src/commands/unban.js
src/commands/save.js
src/commands/restart.js
src/commands/start.js
src/commands/stop.js
src/commands/index.js           # loads all command modules into a Collection
src/index.js                    # bot entrypoint (client, interaction router)
src/deploy-commands.js          # registers slash commands with Discord
tests/config.test.js
tests/permissions.test.js
tests/auditLog.test.js
tests/palworldClient.test.js
tests/processControl.test.js
tests/confirm.test.js
tests/commands.test.js
```

Note vs. the design doc: role mapping and the audit trail are stored as local JSON files (`config/roles.json`, `data/audit-log.json`) rather than env vars, per follow-up direction from the user. No database — everything the bot persists lives in flat JSON on disk.

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `config/roles.example.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "palworld-discord-bot",
  "version": "1.0.0",
  "private": true,
  "engines": {
    "node": ">=20.6.0"
  },
  "scripts": {
    "start": "node --env-file=.env src/index.js",
    "deploy-commands": "node --env-file=.env src/deploy-commands.js",
    "check-api": "node --env-file=.env scripts/check-rest-api.js",
    "test": "node --test"
  },
  "dependencies": {
    "discord.js": "^14.16.0"
  }
}
```

- [ ] **Step 2: Create `.env.example`**

```
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
PALWORLD_REST_URL=http://localhost:8212
PALWORLD_ADMIN_PASSWORD=
PALWORLD_SYSTEMD_UNIT=palworld.service
```

- [ ] **Step 3: Create `config/roles.example.json`**

```json
{
  "admin": ["REPLACE_WITH_ADMIN_ROLE_ID"],
  "operator": ["REPLACE_WITH_OPERATOR_ROLE_ID"]
}
```

- [ ] **Step 4: Update `.gitignore`**

The file already has `node_modules/`, `.env`, and `scrape/` from the earlier commit. Append these two new lines:

```
data/
config/roles.json
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.example config/roles.example.json .gitignore
git commit -m "chore: scaffold Node project for the Discord bot"
```

---

### Task 2: Config loader

**Files:**
- Create: `src/config.js`
- Test: `tests/config.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/config.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadRolesFile, loadConfig } = require('../src/config');

test('loadRolesFile reads admin/operator arrays and defaults missing keys to []', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roles-'));
  const rolesPath = path.join(dir, 'roles.json');
  fs.writeFileSync(rolesPath, JSON.stringify({ admin: ['1'] }));

  const roles = loadRolesFile(rolesPath);

  assert.deepEqual(roles, { admin: ['1'], operator: [] });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadConfig reads secrets from env and applies defaults', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roles-'));
  const rolesPath = path.join(dir, 'roles.json');
  fs.writeFileSync(rolesPath, JSON.stringify({ admin: ['A'], operator: ['B'] }));

  const config = loadConfig({
    DISCORD_TOKEN: 'tok',
    DISCORD_CLIENT_ID: 'cid',
    DISCORD_GUILD_ID: 'gid',
    PALWORLD_ADMIN_PASSWORD: 'pw',
    ROLES_CONFIG_PATH: rolesPath,
  });

  assert.equal(config.discordToken, 'tok');
  assert.equal(config.restApiUrl, 'http://localhost:8212');
  assert.equal(config.systemdUnit, 'palworld.service');
  assert.deepEqual(config.roles, { admin: ['A'], operator: ['B'] });
  fs.rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/config.test.js`
Expected: FAIL — `Error: Cannot find module '../src/config'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/config.js
const fs = require('node:fs');
const path = require('node:path');

function loadRolesFile(rolesPath) {
  const parsed = JSON.parse(fs.readFileSync(rolesPath, 'utf8'));
  return {
    admin: Array.isArray(parsed.admin) ? parsed.admin : [],
    operator: Array.isArray(parsed.operator) ? parsed.operator : [],
  };
}

function loadConfig(env = process.env) {
  const rolesPath = env.ROLES_CONFIG_PATH || path.join(__dirname, '..', 'config', 'roles.json');
  return {
    discordToken: env.DISCORD_TOKEN,
    clientId: env.DISCORD_CLIENT_ID,
    guildId: env.DISCORD_GUILD_ID,
    restApiUrl: env.PALWORLD_REST_URL || 'http://localhost:8212',
    restApiPassword: env.PALWORLD_ADMIN_PASSWORD,
    systemdUnit: env.PALWORLD_SYSTEMD_UNIT || 'palworld.service',
    auditLogPath: env.AUDIT_LOG_PATH || path.join(__dirname, '..', 'data', 'audit-log.json'),
    roles: loadRolesFile(rolesPath),
  };
}

module.exports = { loadConfig, loadRolesFile };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/config.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config.js tests/config.test.js
git commit -m "feat: add config loader for env secrets and roles.json"
```

---

### Task 3: Permission tier resolution

**Files:**
- Create: `src/permissions.js`
- Test: `tests/permissions.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/permissions.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTier, hasAccess } = require('../src/permissions');

const roles = { admin: ['A'], operator: ['B'] };

test('resolveTier returns admin when member has an admin role', () => {
  assert.equal(resolveTier(['A', 'X'], roles), 'admin');
});

test('resolveTier returns operator when member has only an operator role', () => {
  assert.equal(resolveTier(['B'], roles), 'operator');
});

test('resolveTier returns null when member has neither', () => {
  assert.equal(resolveTier(['X'], roles), null);
});

test('hasAccess: admin can use operator-tier commands', () => {
  assert.equal(hasAccess('admin', 'operator'), true);
});

test('hasAccess: operator cannot use admin-tier commands', () => {
  assert.equal(hasAccess('operator', 'admin'), false);
});

test('hasAccess: no tier is always denied', () => {
  assert.equal(hasAccess(null, 'operator'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/permissions.test.js`
Expected: FAIL — `Error: Cannot find module '../src/permissions'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/permissions.js
const TIER_RANK = { operator: 1, admin: 2 };

function resolveTier(memberRoleIds, roles) {
  if (memberRoleIds.some((id) => roles.admin.includes(id))) return 'admin';
  if (memberRoleIds.some((id) => roles.operator.includes(id))) return 'operator';
  return null;
}

function hasAccess(memberTier, requiredTier) {
  if (!memberTier) return false;
  return TIER_RANK[memberTier] >= TIER_RANK[requiredTier];
}

module.exports = { resolveTier, hasAccess, TIER_RANK };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/permissions.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/permissions.js tests/permissions.test.js
git commit -m "feat: add role-tier permission resolver"
```

---

### Task 4: Audit log

**Files:**
- Create: `src/auditLog.js`
- Test: `tests/auditLog.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/auditLog.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/auditLog.test.js`
Expected: FAIL — `Error: Cannot find module '../src/auditLog'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/auditLog.js
const fs = require('node:fs');
const path = require('node:path');

function readLog(logPath) {
  if (!fs.existsSync(logPath)) return [];
  const raw = fs.readFileSync(logPath, 'utf8').trim();
  return raw ? JSON.parse(raw) : [];
}

function appendAuditEntry(logPath, entry) {
  const log = readLog(logPath);
  log.push({ timestamp: new Date().toISOString(), ...entry });
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  return log;
}

module.exports = { appendAuditEntry, readLog };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/auditLog.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/auditLog.js tests/auditLog.test.js
git commit -m "feat: add local JSON audit log for bot actions"
```

---

### Task 5: Palworld REST client

**Files:**
- Create: `src/palworldClient.js`
- Test: `tests/palworldClient.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/palworldClient.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPalworldClient, PalworldApiError } = require('../src/palworldClient');

function withStubFetch(stub, run) {
  const original = global.fetch;
  global.fetch = stub;
  return run().finally(() => {
    global.fetch = original;
  });
}

test('getInfo sends Basic Auth with the admin username and parses JSON', async () => {
  let capturedUrl, capturedOptions;
  await withStubFetch(async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ servername: 'Test', version: '1.0' }),
    };
  }, async () => {
    const client = createPalworldClient({ baseUrl: 'http://localhost:8212', password: 'secret' });
    const info = await client.getInfo();
    assert.equal(info.servername, 'Test');
  });

  assert.equal(capturedUrl, 'http://localhost:8212/v1/api/info');
  assert.equal(capturedOptions.headers.Authorization, `Basic ${Buffer.from('admin:secret').toString('base64')}`);
});

test('kick sends a POST with a JSON body', async () => {
  let capturedOptions;
  await withStubFetch(async (url, options) => {
    capturedOptions = options;
    return { ok: true, headers: { get: () => '' } };
  }, async () => {
    const client = createPalworldClient({ baseUrl: 'http://localhost:8212', password: 'secret' });
    await client.kick('steam_1', 'bye');
  });

  assert.equal(capturedOptions.method, 'POST');
  assert.deepEqual(JSON.parse(capturedOptions.body), { userid: 'steam_1', message: 'bye' });
});

test('a network failure is wrapped in PalworldApiError', async () => {
  await withStubFetch(async () => {
    throw new Error('ECONNREFUSED');
  }, async () => {
    const client = createPalworldClient({ baseUrl: 'http://localhost:8212', password: 'secret' });
    await assert.rejects(() => client.getInfo(), PalworldApiError);
  });
});

test('a non-2xx response is wrapped in PalworldApiError', async () => {
  await withStubFetch(async () => ({
    ok: false,
    status: 401,
    headers: { get: () => '' },
    text: async () => 'unauthorized',
  }), async () => {
    const client = createPalworldClient({ baseUrl: 'http://localhost:8212', password: 'wrong' });
    await assert.rejects(() => client.getInfo(), /401/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/palworldClient.test.js`
Expected: FAIL — `Error: Cannot find module '../src/palworldClient'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/palworldClient.js
class PalworldApiError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'PalworldApiError';
    if (cause) this.cause = cause;
  }
}

function createPalworldClient({ baseUrl, password }) {
  const authHeader = `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;

  async function request(method, endpoint, body) {
    let response;
    try {
      response = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers: {
          Authorization: authHeader,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new PalworldApiError('Palworld server is unreachable', { cause: err });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new PalworldApiError(`Palworld API error ${response.status}: ${text}`);
    }

    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('application/json') ? response.json() : undefined;
  }

  return {
    getInfo: () => request('GET', '/v1/api/info'),
    getPlayers: () => request('GET', '/v1/api/players'),
    announce: (message) => request('POST', '/v1/api/announce', { message }),
    kick: (userid, message) => request('POST', '/v1/api/kick', { userid, message }),
    ban: (userid, message) => request('POST', '/v1/api/ban', { userid, message }),
    unban: (userid) => request('POST', '/v1/api/unban', { userid }),
    save: () => request('POST', '/v1/api/save'),
    shutdown: (waittime, message) => request('POST', '/v1/api/shutdown', { waittime, message }),
    stop: () => request('POST', '/v1/api/stop'),
  };
}

module.exports = { createPalworldClient, PalworldApiError };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/palworldClient.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/palworldClient.js tests/palworldClient.test.js
git commit -m "feat: add Palworld REST API client"
```

---

### Task 6: Process control (systemctl)

**Files:**
- Create: `src/processControl.js`
- Test: `tests/processControl.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/processControl.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { controlService, ALLOWED_ACTIONS } = require('../src/processControl');

test('controlService runs sudo systemctl <action> <unit> via the injected execFile', async () => {
  let capturedCmd, capturedArgs;
  const fakeExecFile = (cmd, args, cb) => {
    capturedCmd = cmd;
    capturedArgs = args;
    cb(null, 'ok', '');
  };

  const result = await controlService('palworld.service', 'restart', fakeExecFile);

  assert.equal(result, 'ok');
  assert.equal(capturedCmd, 'sudo');
  assert.deepEqual(capturedArgs, ['/usr/bin/systemctl', 'restart', 'palworld.service']);
});

test('controlService rejects unsupported actions without touching execFile', async () => {
  let called = false;
  const fakeExecFile = () => {
    called = true;
  };

  await assert.rejects(() => controlService('palworld.service', 'delete', fakeExecFile));
  assert.equal(called, false);
});

test('controlService surfaces stderr on failure', async () => {
  const fakeExecFile = (cmd, args, cb) => {
    cb(new Error('exit 1'), '', 'permission denied');
  };

  await assert.rejects(
    () => controlService('palworld.service', 'stop', fakeExecFile),
    /permission denied/,
  );
});

test('ALLOWED_ACTIONS lists exactly start, stop, restart', () => {
  assert.deepEqual([...ALLOWED_ACTIONS].sort(), ['restart', 'start', 'stop']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/processControl.test.js`
Expected: FAIL — `Error: Cannot find module '../src/processControl'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/processControl.js
const { execFile } = require('node:child_process');

const ALLOWED_ACTIONS = ['start', 'stop', 'restart'];

function controlService(unit, action, execFileImpl = execFile) {
  if (!ALLOWED_ACTIONS.includes(action)) {
    return Promise.reject(new Error(`Unsupported systemctl action: ${action}`));
  }
  return new Promise((resolve, reject) => {
    execFileImpl('sudo', ['/usr/bin/systemctl', action, unit], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`systemctl ${action} failed: ${stderr || error.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}

module.exports = { controlService, ALLOWED_ACTIONS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/processControl.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/processControl.js tests/processControl.test.js
git commit -m "feat: add scoped systemctl process control wrapper"
```

---

### Task 7: Confirmation button helper

**Files:**
- Create: `src/confirm.js`
- Test: `tests/confirm.test.js`

`awaitConfirmation` drives real Discord interaction objects (message components, timeouts) and isn't meaningfully unit-testable without a Discord gateway — it gets exercised in the manual live test pass (see spec's Testing section). Only the pure `buildConfirmRow` builder is unit tested here.

- [ ] **Step 1: Write the failing test**

```js
// tests/confirm.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/confirm.test.js`
Expected: FAIL — `Error: Cannot find module '../src/confirm'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/confirm.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function buildConfirmRow(actionId) {
  const confirmId = `confirm:${actionId}`;
  const cancelId = `cancel:${actionId}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(confirmId).setLabel('Confirm').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
  return { row, confirmId, cancelId };
}

async function awaitConfirmation(interaction, actionId, timeoutMs = 15000) {
  const { row, confirmId, cancelId } = buildConfirmRow(actionId);
  const reply = await interaction.reply({
    content: 'Are you sure? This action cannot be undone.',
    components: [row],
    ephemeral: true,
    fetchReply: true,
  });

  try {
    const buttonInteraction = await reply.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id && [confirmId, cancelId].includes(i.customId),
      time: timeoutMs,
    });
    const confirmed = buttonInteraction.customId === confirmId;
    await buttonInteraction.update({ content: confirmed ? 'Confirmed.' : 'Cancelled.', components: [] });
    return confirmed;
  } catch {
    await interaction.editReply({ content: 'Confirmation timed out.', components: [] });
    return false;
  }
}

module.exports = { buildConfirmRow, awaitConfirmation };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/confirm.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/confirm.js tests/confirm.test.js
git commit -m "feat: add Discord button confirmation helper for destructive actions"
```

---

### Task 8: Operator-tier commands

**Files:**
- Create: `src/commands/status.js`
- Create: `src/commands/players.js`
- Create: `src/commands/announce.js`
- Create: `src/commands/kick.js`
- Create: `src/commands/ban.js`
- Create: `src/commands/unban.js`
- Create: `src/commands/save.js`

Every command module exports `{ data, tier, execute(interaction, ctx) }`, where `ctx` (built in Task 10's `src/index.js`) provides `palworld`, `processControl`, `config`, and `auditLog`. These are thin wrappers around the already-tested `palworldClient`/`auditLog` modules, so per-command unit tests would just re-test those modules' mocks — the shape/wiring check in Task 10 (`tests/commands.test.js`) plus the manual live-server test pass from the spec cover this layer instead.

- [ ] **Step 1: Create `src/commands/status.js`**

```js
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
```

- [ ] **Step 2: Create `src/commands/players.js`**

```js
const { SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder().setName('players').setDescription('List connected players');
const tier = 'operator';

async function execute(interaction, ctx) {
  try {
    const { players } = await ctx.palworld.getPlayers();
    if (!players || players.length === 0) {
      await interaction.reply('No players are currently connected.');
      return;
    }
    const lines = players.map((p) => `- ${p.name} (${p.userId ?? p.accountName ?? 'unknown id'})`);
    await interaction.reply(`**Connected players (${players.length}):**\n${lines.join('\n')}`);
  } catch (err) {
    await interaction.reply({ content: `Server unreachable: ${err.message}`, ephemeral: true });
  }
}

module.exports = { data, tier, execute };
```

- [ ] **Step 3: Create `src/commands/announce.js`**

```js
const { SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Broadcast a message to all connected players')
  .addStringOption((opt) => opt.setName('message').setDescription('Message to broadcast').setRequired(true));
const tier = 'operator';

async function execute(interaction, ctx) {
  const message = interaction.options.getString('message', true);
  try {
    await ctx.palworld.announce(message);
    ctx.auditLog.appendAuditEntry({ actor: interaction.user.tag, command: 'announce', message });
    await interaction.reply(`Announced: "${message}"`);
  } catch (err) {
    await interaction.reply({ content: `Failed to announce: ${err.message}`, ephemeral: true });
  }
}

module.exports = { data, tier, execute };
```

- [ ] **Step 4: Create `src/commands/kick.js`**

```js
const { SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a player from the server')
  .addStringOption((opt) => opt.setName('userid').setDescription('Player ID (e.g. steam_xxxx)').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Reason shown to the player'));
const tier = 'operator';

async function execute(interaction, ctx) {
  const userid = interaction.options.getString('userid', true);
  const reason = interaction.options.getString('reason') || 'Kicked by an admin.';
  try {
    await ctx.palworld.kick(userid, reason);
    ctx.auditLog.appendAuditEntry({ actor: interaction.user.tag, command: 'kick', target: userid, reason });
    await interaction.reply(`Kicked \`${userid}\`.`);
  } catch (err) {
    await interaction.reply({ content: `Failed to kick: ${err.message}`, ephemeral: true });
  }
}

module.exports = { data, tier, execute };
```

- [ ] **Step 5: Create `src/commands/ban.js`**

```js
const { SlashCommandBuilder } = require('discord.js');
const { awaitConfirmation } = require('../confirm');

const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a player from the server')
  .addStringOption((opt) => opt.setName('userid').setDescription('Player ID (e.g. steam_xxxx)').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Reason shown to the player'));
const tier = 'operator';

async function execute(interaction, ctx) {
  const userid = interaction.options.getString('userid', true);
  const reason = interaction.options.getString('reason') || 'Banned by an admin.';

  const confirmed = await awaitConfirmation(interaction, `ban:${userid}`);
  if (!confirmed) return;

  try {
    await ctx.palworld.ban(userid, reason);
    ctx.auditLog.appendAuditEntry({ actor: interaction.user.tag, command: 'ban', target: userid, reason });
    await interaction.followUp(`Banned \`${userid}\`.`);
  } catch (err) {
    await interaction.followUp({ content: `Failed to ban: ${err.message}`, ephemeral: true });
  }
}

module.exports = { data, tier, execute };
```

- [ ] **Step 6: Create `src/commands/unban.js`**

```js
const { SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Remove a player ban')
  .addStringOption((opt) => opt.setName('userid').setDescription('Player ID (e.g. steam_xxxx)').setRequired(true));
const tier = 'operator';

async function execute(interaction, ctx) {
  const userid = interaction.options.getString('userid', true);
  try {
    await ctx.palworld.unban(userid);
    ctx.auditLog.appendAuditEntry({ actor: interaction.user.tag, command: 'unban', target: userid });
    await interaction.reply(`Unbanned \`${userid}\`.`);
  } catch (err) {
    await interaction.reply({ content: `Failed to unban: ${err.message}`, ephemeral: true });
  }
}

module.exports = { data, tier, execute };
```

- [ ] **Step 7: Create `src/commands/save.js`**

```js
const { SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder().setName('save').setDescription('Save the world');
const tier = 'operator';

async function execute(interaction, ctx) {
  try {
    await ctx.palworld.save();
    ctx.auditLog.appendAuditEntry({ actor: interaction.user.tag, command: 'save' });
    await interaction.reply('World saved.');
  } catch (err) {
    await interaction.reply({ content: `Failed to save: ${err.message}`, ephemeral: true });
  }
}

module.exports = { data, tier, execute };
```

- [ ] **Step 8: Commit**

```bash
git add src/commands/status.js src/commands/players.js src/commands/announce.js src/commands/kick.js src/commands/ban.js src/commands/unban.js src/commands/save.js
git commit -m "feat: add operator-tier slash commands"
```

---

### Task 9: Admin-tier lifecycle commands

**Files:**
- Create: `src/commands/restart.js`
- Create: `src/commands/start.js`
- Create: `src/commands/stop.js`

- [ ] **Step 1: Create `src/commands/restart.js`**

```js
const { SlashCommandBuilder } = require('discord.js');
const { awaitConfirmation } = require('../confirm');

const data = new SlashCommandBuilder().setName('restart').setDescription('Restart the Palworld server process');
const tier = 'admin';

async function execute(interaction, ctx) {
  const confirmed = await awaitConfirmation(interaction, 'restart');
  if (!confirmed) return;

  try {
    await ctx.processControl.controlService('restart');
    ctx.auditLog.appendAuditEntry({ actor: interaction.user.tag, command: 'restart' });
    await interaction.followUp('Server restart triggered.');
  } catch (err) {
    await interaction.followUp({ content: `Failed to restart: ${err.message}`, ephemeral: true });
  }
}

module.exports = { data, tier, execute };
```

- [ ] **Step 2: Create `src/commands/start.js`**

```js
const { SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder().setName('start').setDescription('Start the Palworld server process');
const tier = 'admin';

async function execute(interaction, ctx) {
  try {
    await ctx.processControl.controlService('start');
    ctx.auditLog.appendAuditEntry({ actor: interaction.user.tag, command: 'start' });
    await interaction.reply('Server start triggered.');
  } catch (err) {
    await interaction.reply({ content: `Failed to start: ${err.message}`, ephemeral: true });
  }
}

module.exports = { data, tier, execute };
```

- [ ] **Step 3: Create `src/commands/stop.js`**

Graceful stop tries the REST API's `shutdown` (in-game countdown message) first; if the REST API is unreachable, it falls back to `systemctl stop` directly, per the spec.

```js
const { SlashCommandBuilder } = require('discord.js');
const { awaitConfirmation } = require('../confirm');
const { PalworldApiError } = require('../palworldClient');

const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop the Palworld server')
  .addIntegerOption((opt) => opt.setName('waittime').setDescription('Seconds to warn players before shutdown').setMinValue(0))
  .addBooleanOption((opt) => opt.setName('force').setDescription('Force stop immediately, skipping the in-game warning'));
const tier = 'admin';

async function execute(interaction, ctx) {
  const waittime = interaction.options.getInteger('waittime') ?? 30;
  const force = interaction.options.getBoolean('force') ?? false;

  const confirmed = await awaitConfirmation(interaction, 'stop');
  if (!confirmed) return;

  try {
    if (force) {
      await ctx.palworld.stop();
    } else {
      await ctx.palworld.shutdown(waittime, `Server is shutting down in ${waittime} seconds.`);
    }
    ctx.auditLog.appendAuditEntry({ actor: interaction.user.tag, command: 'stop', force, waittime });
    await interaction.followUp('Server stop triggered.');
    return;
  } catch (err) {
    if (!(err instanceof PalworldApiError)) {
      await interaction.followUp({ content: `Failed to stop: ${err.message}`, ephemeral: true });
      return;
    }
  }

  try {
    await ctx.processControl.controlService('stop');
    ctx.auditLog.appendAuditEntry({ actor: interaction.user.tag, command: 'stop', via: 'systemctl-fallback' });
    await interaction.followUp('Server was unreachable via REST API — stopped via systemctl instead.');
  } catch (err) {
    await interaction.followUp({ content: `Failed to stop: ${err.message}`, ephemeral: true });
  }
}

module.exports = { data, tier, execute };
```

- [ ] **Step 4: Commit**

```bash
git add src/commands/restart.js src/commands/start.js src/commands/stop.js
git commit -m "feat: add admin-tier server lifecycle commands"
```

---

### Task 10: Command registry, interaction router, and command deployment

**Files:**
- Create: `src/commands/index.js`
- Create: `src/index.js`
- Create: `src/deploy-commands.js`
- Test: `tests/commands.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/commands.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const loadCommands = require('../src/commands');

test('every command module exports a matching name, a valid tier, and an execute function', () => {
  const commands = loadCommands();
  assert.ok(commands.size >= 10, `expected at least 10 commands, found ${commands.size}`);

  for (const [name, command] of commands) {
    assert.equal(typeof command.data.name, 'string');
    assert.equal(command.data.name, name);
    assert.ok(['admin', 'operator'].includes(command.tier), `${name} has an invalid tier: ${command.tier}`);
    assert.equal(typeof command.execute, 'function');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/commands.test.js`
Expected: FAIL — `Error: Cannot find module '../src/commands'`

- [ ] **Step 3: Create `src/commands/index.js`**

```js
const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');

function loadCommands(dir = __dirname) {
  const commands = new Collection();
  for (const file of fs.readdirSync(dir)) {
    if (file === 'index.js' || !file.endsWith('.js')) continue;
    const command = require(path.join(dir, file));
    commands.set(command.data.name, command);
  }
  return commands;
}

module.exports = loadCommands;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/commands.test.js`
Expected: PASS (1 test, confirms all 10 commands from Tasks 8-9 are wired correctly)

- [ ] **Step 5: Create `src/index.js`** (bot entrypoint)

```js
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { loadConfig } = require('./config');
const { resolveTier, hasAccess } = require('./permissions');
const { createPalworldClient } = require('./palworldClient');
const { controlService } = require('./processControl');
const { appendAuditEntry } = require('./auditLog');
const loadCommands = require('./commands');

const config = loadConfig();
const commands = loadCommands();

const palworld = createPalworldClient({ baseUrl: config.restApiUrl, password: config.restApiPassword });

const ctx = {
  config,
  palworld,
  processControl: {
    controlService: (action) => controlService(config.systemdUnit, action),
  },
  auditLog: {
    appendAuditEntry: (entry) => appendAuditEntry(config.auditLogPath, entry),
  },
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  const memberRoleIds = interaction.member?.roles?.cache ? [...interaction.member.roles.cache.keys()] : [];
  const tier = resolveTier(memberRoleIds, config.roles);

  if (!hasAccess(tier, command.tier)) {
    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    return;
  }

  try {
    await command.execute(interaction, ctx);
  } catch (err) {
    console.error(`Error executing /${interaction.commandName}:`, err);
    const payload = { content: `Something went wrong: ${err.message}`, ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  }
});

client.login(config.discordToken);
```

- [ ] **Step 6: Create `src/deploy-commands.js`**

```js
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
```

- [ ] **Step 7: Commit**

```bash
git add src/commands/index.js src/index.js src/deploy-commands.js tests/commands.test.js
git commit -m "feat: wire up command registry, interaction router, and command deployment"
```

---

### Task 11: Deployment files (systemd unit, sudoers rule, REST smoke test)

**Files:**
- Create: `deploy/palworld-bot.service`
- Create: `deploy/palworld-bot.sudoers`
- Create: `scripts/check-rest-api.js`

- [ ] **Step 1: Create `deploy/palworld-bot.service`**

```ini
[Unit]
Description=Palworld Discord Admin Bot
After=network-online.target palworld.service
Wants=network-online.target

[Service]
Type=simple
User=palworld-bot
WorkingDirectory=/opt/palworld-bot
ExecStart=/usr/bin/node --env-file=/opt/palworld-bot/.env /opt/palworld-bot/src/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Install on the VM with:
```bash
sudo cp deploy/palworld-bot.service /etc/systemd/system/palworld-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now palworld-bot.service
```

- [ ] **Step 2: Create `deploy/palworld-bot.sudoers`**

```
palworld-bot ALL=(root) NOPASSWD: /usr/bin/systemctl start palworld.service, /usr/bin/systemctl stop palworld.service, /usr/bin/systemctl restart palworld.service
```

Install on the VM with (validated before install, since a bad sudoers file can lock out sudo):
```bash
sudo visudo -c -f deploy/palworld-bot.sudoers
sudo cp deploy/palworld-bot.sudoers /etc/sudoers.d/palworld-bot
sudo chmod 440 /etc/sudoers.d/palworld-bot
```

- [ ] **Step 3: Create `scripts/check-rest-api.js`**

```js
const { loadConfig } = require('../src/config');
const { createPalworldClient } = require('../src/palworldClient');

(async () => {
  const config = loadConfig();
  const client = createPalworldClient({ baseUrl: config.restApiUrl, password: config.restApiPassword });
  const info = await client.getInfo();
  console.log('Connected to Palworld REST API:', info);
})();
```

Run against the real server once REST API is enabled on the VM:
Run: `npm run check-api`
Expected: prints `Connected to Palworld REST API: { servername: ..., version: ..., ... }`. A connection error here means `RESTAPIEnabled`/`RESTAPIPort`/`AdminPassword` in `PalWorldSettings.ini` need checking, or the bot isn't running on the same host as the server.

- [ ] **Step 4: Commit**

```bash
git add deploy/palworld-bot.service deploy/palworld-bot.sudoers scripts/check-rest-api.js
git commit -m "chore: add systemd unit, sudoers rule, and REST API smoke test"
```

---

## Manual verification (after all tasks)

These require the real Discord application + Azure VM details the user will provide later — not part of the automated test suite:

1. Create a Discord application + bot token, invite it to the test/staging guild with `applications.commands` and `bot` scopes.
2. Fill in real `.env` (`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `PALWORLD_ADMIN_PASSWORD`) and `config/roles.json` (real role IDs) on the VM.
3. `npm run deploy-commands` — confirm slash commands show up in the guild.
4. `npm run check-api` — confirm REST API connectivity.
5. `npm start` — confirm the bot comes online.
6. Exercise each command once as an operator-tier and once as an admin-tier user, plus once as a user with neither role (expect "not authorized"). Confirm `/ban`, `/restart`, `/stop` show the confirm/cancel buttons and respect Cancel.
7. Check `data/audit-log.json` after a few actions to confirm entries are being recorded.
