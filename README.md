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

4. **Point it at a Palworld server.** Edit `/home/$USER/palworld-bot/config/servers.json` for the same `guildId` and add one entry to that guild's `servers` array, giving it a short `label`:
   ```json
   {
     "guildId": "<guild-id>",
     "servers": [
       { "label": "main", "restApiUrl": "http://localhost:8212", "restApiPassword": "<the real AdminPassword from PalWorldSettings.ini>", "pm2ProcessName": "palworld" }
     ]
   }
   ```
   A guild can list more than one server here (see "Adding a second Palworld server" below) — when there's only one, commands don't need to say which one; with more than one, every command's `server` option (autocompleted with the labels you set) picks which server it acts on.

5. **(Optional) Set up log channels.** Edit `/home/$USER/palworld-bot/config/channels.json` for that `guildId` with real Discord channel IDs (right-click a channel → Copy Channel ID) — `botChannelId` for bot errors/permission denials, `serverChannelId` for a live feed of admin actions. Leave either `""` to skip it.

6. **Verify:**
   ```bash
   cd /home/$USER/palworld-bot
   node --env-file=.env scripts/check-rest-api.js <guildId>
   ```
   Should print the server's name/version. Then try `/status` in Discord as the user/role you just granted admin.

---

## Adding a second Palworld server

Works the same whether the second server belongs to the *same* guild (e.g. a "main" and a "pvp" server for one community) or a *different* guild — either way, `config/servers.json` supports it, but the server itself has to actually exist first:

1. Install a second Palworld dedicated server via SteamCMD in its own directory (e.g. `/home/$USER/palworld2/`) — same process as the first install, app ID `2394010`.
2. In its `PalWorldSettings.ini`, set `RESTAPIEnabled=True` and give it **different** ports than the first instance — e.g. `PublicPort=8221`, `RESTAPIPort=8222` (the first instance already uses `8211`/`8212`; reusing them will conflict).
3. Add a new app entry to `/home/$USER/palworld-bot/deploy/ecosystem.config.js` with a unique `name` (e.g. `palworld2`) pointing at that install's `PalServer.sh`, then `pm2 start deploy/ecosystem.config.js --only palworld2` (first-time bootstrap of that one app only) and `pm2 save`.
4. In `config/servers.json`, add a new object to that guild's `servers` array with a distinct `label` (e.g. `"pvp"`), `restApiUrl` = `http://localhost:8222`, `pm2ProcessName` = `palworld2`, `restApiPassword` = whatever you set in step 2.
5. Once a guild has more than one server, every command's `server` option is required in practice — Discord will autocomplete the labels you've set, but if a command is run with no `server` and it's ambiguous, the bot replies listing the available labels instead of guessing.

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

This bot can be invited to any Discord guild — including ones you don't control (people find/reuse the OAuth invite link; this has already happened twice). **Every guild is its own tenant.** A guild only gets a working Palworld connection if `/home/$USER/palworld-bot/config/servers.json` lists at least one complete server for that exact `guildId` (`label`, `restApiUrl`, `restApiPassword`, and `pm2ProcessName` all filled in). A guild with no servers listed, or only incomplete ones, gets a hard "no server configured" error on every command — **it cannot control any server**, no matter what roles it grants itself via `/operator`. That's the actual security boundary, not an allowlist bolted on afterward: capability is tied directly to configuration. A guild *can* be given several servers (see "Adding a second Palworld server"); it just can never reach one that isn't listed for it.

---

## Config file reference

All four files live in `/home/$USER/palworld-bot/config/`, are gitignored (VM-only, never in git), auto-create an empty entry for any guild the moment it joins, and **hot-reload within ~1 second of saving** — no bot restart needed after editing any of them.

- **`guilds.json`** — registry of known guilds: `[{ "guildId": "..." }]`. Informational, not something you edit.
- **`roles.json`** — who has access, per guild: `{ "guildId": "...", "admin": { "roleIds": [...], "userIds": [...] }, "operator": { "roleIds": [...], "userIds": [...] } }`. Empty arrays = nobody has that tier. A role ID and a user ID work independently.
- **`channels.json`** — where the bot posts, per guild: `{ "guildId": "...", "botChannelId": "...", "serverChannelId": "..." }`. `botChannelId` gets bot errors/permission-denials; `serverChannelId` gets a live feed of every successful admin action (mirrors `/home/$USER/palworld-bot/data/audit-log.json`). Blank (`""`) = that stream is off.
- **`servers.json`** — which Palworld server(s) the guild controls, if any: `{ "guildId": "...", "servers": [{ "label": "...", "restApiUrl": "...", "restApiPassword": "...", "pm2ProcessName": "..." }] }`. Empty `servers` array = guild is inert (see Multi-tenancy above). One entry = commands don't need to specify it; more than one = commands need the `server` option to say which.

**`/home/$USER/palworld-bot/.env`** is separate from all of that — just `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. Not hot-reloaded; run `pm2 restart palworld-bot` after editing it.

---

## Commands the bot exposes

| Tier | Commands |
|---|---|
| operator | `/status` `/players` `/announce` `/kick` `/ban` `/unban` `/save` |
| admin | everything operator has, plus `/restart` `/start` `/stop` `/operator` |

`/operator add-role`, `add-user`, `remove-role`, `remove-user`, `list` let an admin grant/revoke **operator** access from Discord directly (edits `roles.json` for you). Promoting someone to *admin* is not exposed as a command on purpose — that still requires editing `config/roles.json` directly on the VM, a deliberate manual step.

`/ban`, `/restart`, `/stop` require a Confirm/Cancel button press before doing anything.

Every command except `/operator` takes an optional `server` option (autocompleted with that guild's configured labels) — only needed when a guild has more than one server; with exactly one, it's picked automatically.

---

## Palworld REST API

- Enabled per-server in that install's `PalWorldSettings.ini`: `RESTAPIEnabled=True`, `RESTAPIPort=<port>`
- Auth: HTTP Basic, username `admin`, password = that guild's `restApiPassword` in `config/servers.json`
- Bound to localhost only — never open the REST port to the internet (check the Azure NSG has no inbound rule for it)
- Manual smoke test: `cd /home/$USER/palworld-bot && node --env-file=.env scripts/check-rest-api.js <guildId>`
- **Gotcha (already handled in `/stop`'s code — documented so it isn't reintroduced):** the REST API's `shutdown`/`stop` endpoints make the PalServer *process itself* exit. Since the game server's PM2 entry has `autorestart: true`, PM2 can't tell that apart from a crash and brings it right back up within seconds. `/stop` waits out the shutdown, then explicitly runs `pm2 stop <name>` so PM2 knows it was intentional. If you ever call the REST shutdown endpoint directly (bypassing the bot), follow it with a manual `pm2 stop <name>`.

---

## Catching manual `pm2` commands

The bot also watches PM2's own event bus (not just its own actions) — if someone runs `pm2 stop palworld`, `pm2 restart palworld-bot`, etc. directly over SSH instead of through a Discord command, that gets posted to the relevant guild's `serverChannelId` (or every guild's `botChannelId`, for the bot's own process, since that one isn't guild-specific) as an external-action warning. Actions the bot itself triggers are recognized and not double-reported. One caveat: if the *bot's own* process is killed externally, there's only a brief best-effort window to report that before it actually dies — it's not guaranteed for that one case.

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
