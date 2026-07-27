# Palworld Discord Admin Bot — Operations Guide

## At a glance

| What | Value |
|---|---|
| VM | `<vm-ip>`, SSH user `$USER` |
| Bot code + config | `/home/$USER/palworld-bot/` |
| Bot secrets | `/home/$USER/palworld-bot/.env` |
| Bot config (4 files) | `/home/$USER/palworld-bot/config/guilds.json`, `roles.json`, `channels.json`, `servers.json` |
| Palworld server install | `/home/$USER/palworld/` |
| Palworld server settings | `/home/$USER/palworld/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini` |
| Process manager | PM2, running as user `$USER` (no systemd, no sudo for daily use) |
| PM2 app names | `palworld` (game server), `palworld-bot` (this bot) |
| Currently-active guild | `<guild-id>` ("your-guild-name") — the only guild with a real server wired up |
| Game port | `8211` (UDP) |
| REST API port | `8212` (localhost only — never expose to the internet) |

Everything below assumes you're SSH'd in as `$USER@<vm-ip>`.

---

## First-time setup: turning on a new guild

The bot auto-joins every guild it's invited to and creates empty entries for it, but a brand new guild can't do anything until you fill those in. Concretely:

1. **Find the guild ID.** In Discord, enable Developer Mode (User Settings → Advanced), then right-click the server icon → Copy Server ID.

2. **Confirm the bot already registered it:**
   ```bash
   cat /home/$USER/palworld-bot/config/guilds.json
   ```
   If your guild ID isn't listed, the bot hasn't seen it yet — invite it first (invite link uses client ID `<bot-client-id>`), it registers itself within seconds of joining.

3. **Grant yourself admin access.** Edit `/home/$USER/palworld-bot/config/roles.json`, find the object with your `guildId`, and add your Discord user ID (right-click your name → Copy User ID) or a role ID to `admin.userIds` / `admin.roleIds`:
   ```bash
   nano /home/$USER/palworld-bot/config/roles.json
   ```
   Example for guild `<guild-id>`:
   ```json
   {
     "guildId": "<guild-id>",
     "admin": { "roleIds": ["<admin-role-id>"], "userIds": [] },
     "operator": { "roleIds": ["<operator-role-id>"], "userIds": ["<operator-user-id>"] }
   }
   ```
   Saves apply automatically within ~1 second — no restart needed.

4. **Point it at a Palworld server.** Edit `/home/$USER/palworld-bot/config/servers.json` for the same `guildId`. If this guild should control the one existing server on this VM, use the real values already active for `<guild-id>`:
   ```json
   {
     "guildId": "<guild-id>",
     "restApiUrl": "http://localhost:8212",
     "restApiPassword": "<the real AdminPassword from PalWorldSettings.ini>",
     "pm2ProcessName": "palworld"
   }
   ```
   If this is a *different* guild that needs its own separate Palworld server, see "Adding a second Palworld server" below — don't point two guilds at the same server unless you actually want both to share control of it.

5. **(Optional) Set up log channels.** Edit `/home/$USER/palworld-bot/config/channels.json` for that `guildId` with real Discord channel IDs (right-click a channel → Copy Channel ID) — `botChannelId` for bot errors/permission denials, `serverChannelId` for a live feed of admin actions. Leave either `""` to skip it.

6. **Verify:**
   ```bash
   cd /home/$USER/palworld-bot
   node --env-file=.env scripts/check-rest-api.js <guildId>
   ```
   Should print the server's name/version. Then try `/status` in Discord as the user/role you just granted admin.

---

## Adding a second Palworld server (for a different guild)

`config/servers.json` supports it, but the server itself has to actually exist first:

1. Install a second Palworld dedicated server via SteamCMD in its own directory (e.g. `/home/$USER/palworld2/`) — same process as the first install, app ID `2394010`.
2. In its `PalWorldSettings.ini`, set `RESTAPIEnabled=True` and give it **different** ports than the first instance — e.g. `PublicPort=8221`, `RESTAPIPort=8222` (the first instance already uses `8211`/`8212`; reusing them will conflict).
3. Add a new app entry to `/home/$USER/palworld-bot/deploy/ecosystem.config.js` with a unique `name` (e.g. `palworld2`) pointing at that install's `PalServer.sh`, then `pm2 start deploy/ecosystem.config.js --only palworld2` (first-time bootstrap of that one app only) and `pm2 save`.
4. In `config/servers.json`, set that guild's entry: `restApiUrl` = `http://localhost:8222`, `pm2ProcessName` = `palworld2`, `restApiPassword` = whatever you set in step 2.

---

## Daily operations (PM2)

```bash
pm2 list                       # status of all processes
pm2 logs palworld               # tail the game server's stdout/stderr
pm2 logs palworld-bot           # tail the bot's stdout/stderr
pm2 restart palworld            # restart the game server
pm2 restart palworld-bot        # restart the bot (needed after editing .env or code — NOT after editing config/*.json, those hot-reload)
pm2 stop palworld|palworld-bot
pm2 start palworld|palworld-bot
pm2 monit                       # live CPU/mem dashboard
pm2 save                        # persist current process list so a reboot restores it — run after any start/stop/restart
```

Boot persistence is already installed (`systemctl status pm2-$USER` — a systemd unit that runs `pm2 resurrect` on boot). You shouldn't need to touch it again.

**Restarting a single already-running app: use `pm2 restart <name>` by name.** Do **not** re-run `pm2 start deploy/ecosystem.config.js` (even with `--only`) against an app that's already running — this caused the *other* app in that same file to receive SIGINT and stop, even though it wasn't targeted. Only use `pm2 start deploy/ecosystem.config.js` to bootstrap an app for the very first time.

---

## Multi-tenancy: one bot, many guilds, separate servers

This bot can be invited to any Discord guild — including ones you don't control (people find/reuse the OAuth invite link; this has already happened twice). **Every guild is its own tenant.** A guild only gets a working Palworld connection if `/home/$USER/palworld-bot/config/servers.json` has a complete entry for that exact `guildId` (`restApiUrl`, `restApiPassword`, and `pm2ProcessName` all filled in). A guild with no entry, or an incomplete one, gets a hard "no server configured" error on every command — **it cannot control any server**, no matter what roles it grants itself via `/operator`. That's the actual security boundary, not an allowlist bolted on afterward: capability is tied directly to configuration.

---

## Config file reference

All four files live in `/home/$USER/palworld-bot/config/`, are gitignored (VM-only, never in git), auto-create an empty entry for any guild the moment it joins, and **hot-reload within ~1 second of saving** — no bot restart needed after editing any of them.

- **`guilds.json`** — registry of known guilds: `[{ "guildId": "..." }]`. Informational, not something you edit.
- **`roles.json`** — who has access, per guild: `{ "guildId": "...", "admin": { "roleIds": [...], "userIds": [...] }, "operator": { "roleIds": [...], "userIds": [...] } }`. Empty arrays = nobody has that tier. A role ID and a user ID work independently.
- **`channels.json`** — where the bot posts, per guild: `{ "guildId": "...", "botChannelId": "...", "serverChannelId": "..." }`. `botChannelId` gets bot errors/permission-denials; `serverChannelId` gets a live feed of every successful admin action (mirrors `/home/$USER/palworld-bot/data/audit-log.json`). Blank (`""`) = that stream is off.
- **`servers.json`** — which Palworld server the guild controls, if any: `{ "guildId": "...", "restApiUrl": "...", "restApiPassword": "...", "pm2ProcessName": "..." }`. All three blank = guild is inert (see Multi-tenancy above).

**`/home/$USER/palworld-bot/.env`** is separate from all of that — just `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. Not hot-reloaded; run `pm2 restart palworld-bot` after editing it.

---

## Commands the bot exposes

| Tier | Commands |
|---|---|
| operator | `/status` `/players` `/announce` `/kick` `/ban` `/unban` `/save` |
| admin | everything operator has, plus `/restart` `/start` `/stop` `/operator` |

`/operator add-role`, `add-user`, `remove-role`, `remove-user`, `list` let an admin grant/revoke **operator** access from Discord directly (edits `roles.json` for you). Promoting someone to *admin* is not exposed as a command on purpose — that still requires editing `config/roles.json` directly on the VM, a deliberate manual step.

`/ban`, `/restart`, `/stop` require a Confirm/Cancel button press before doing anything.

---

## Palworld REST API

- Enabled per-server in that install's `PalWorldSettings.ini`: `RESTAPIEnabled=True`, `RESTAPIPort=<port>`
- Auth: HTTP Basic, username `admin`, password = that guild's `restApiPassword` in `config/servers.json`
- Bound to localhost only — never open the REST port to the internet (check the Azure NSG has no inbound rule for it)
- Manual smoke test: `cd /home/$USER/palworld-bot && node --env-file=.env scripts/check-rest-api.js <guildId>`
- **Gotcha (already handled in `/stop`'s code — documented so it isn't reintroduced):** the REST API's `shutdown`/`stop` endpoints make the PalServer *process itself* exit. Since the game server's PM2 entry has `autorestart: true`, PM2 can't tell that apart from a crash and brings it right back up within seconds. `/stop` waits out the shutdown, then explicitly runs `pm2 stop <name>` so PM2 knows it was intentional. If you ever call the REST shutdown endpoint directly (bypassing the bot), follow it with a manual `pm2 stop <name>`.

---

## Deploying code changes

No CI/CD — updates are manual. **Only overwrite tracked source files, never `rm -rf`/replace the whole `/home/$USER/palworld-bot/` directory** — `config/*.json` and `data/audit-log.json` are gitignored and live only on the VM; wiping the directory destroys them.

```bash
# from your machine: copy changed files to the VM (pscp/scp), e.g.:
#   pscp path/to/file $USER@<vm-ip>:/home/$USER/palworld-bot/path/to/file
# then on the VM:
cd /home/$USER/palworld-bot
npm install              # only if package.json changed
npm test                 # sanity check — should be 0 failures before restarting
pm2 restart palworld-bot
pm2 save
```

If slash commands themselves changed (new command, renamed/added option, etc.), also run:

```bash
cd /home/$USER/palworld-bot && npm run deploy-commands
```
