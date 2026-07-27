# Palworld Discord Admin Bot — Operations Guide

Live deployment: `20.207.201.17`, user `morfit`.

## Layout on the VM

- `/home/morfit/palworld/` — the Palworld dedicated server (SteamCMD install, `PalServer.sh`, `PalWorldSettings.ini` under `Pal/Saved/Config/LinuxServer/`)
- `/home/morfit/palworld-bot/` — this bot's code, `.env` (secrets), `config/{guilds,roles,channels}.json` (per-guild registry/permissions/channel routing)

Both processes run under **PM2** as the `morfit` user — no systemd units, no sudo needed for day-to-day control.

## Daemon management (PM2)

```bash
pm2 list                       # status of both processes
pm2 logs palworld              # tail the game server's stdout/stderr
pm2 logs palworld-bot          # tail the bot's stdout/stderr
pm2 restart palworld           # restart the game server
pm2 restart palworld-bot       # restart the bot (needed after editing .env or code)
pm2 stop palworld|palworld-bot
pm2 start palworld|palworld-bot
pm2 monit                      # live CPU/mem dashboard
```

After any change to what's running, persist it so a reboot restores it:

```bash
pm2 save
```

Boot persistence is already installed (`systemctl status pm2-morfit` — a systemd unit that runs `pm2 resurrect` on boot). You should not need to touch it again.

## Config files

All three below live in `config/`, are gitignored (VM/local only), and are **auto-registered** the moment the bot joins a guild (or on its own startup for guilds it's already in) — you never need to look up a guild ID by hand, and all three files are joined by that same `guildId`. All three **hot-reload within ~1 second of saving** — no restart needed after editing any of them.

- **`.env`** — Discord bot token, client ID, Palworld REST API URL/password, PM2 process name. This one is *not* hot-reloaded — restart the bot (`pm2 restart palworld-bot`) after editing it.
- **`config/guilds.json`** — just the registry of known guilds: `[{ "guildId": "..." }]`. Mostly for your own visibility; not something you need to edit.
- **`config/roles.json`** — who has access, per guild:
  ```json
  { "guildId": "...", "admin": { "roleIds": [...], "userIds": [...] }, "operator": { "roleIds": [...], "userIds": [...] } }
  ```
  New entries start with empty `roleIds`/`userIds`, meaning **nobody has access yet**. A role ID and a user ID work independently — either grants that tier.
- **`config/channels.json`** — where the bot posts, per guild:
  ```json
  { "guildId": "...", "botChannelId": "...", "serverChannelId": "..." }
  ```
  `botChannelId` gets the bot's own operational log (permission denials, command errors). `serverChannelId` gets a live feed of every successful admin/moderation action (kick/ban/unban/announce/save/start/stop/restart), mirroring `data/audit-log.json`. **Leave either blank (`""`) to disable that stream** — the bot silently skips posting instead of erroring. New guild entries start with both blank.

## Commands the bot exposes

| Tier | Commands |
|---|---|
| operator | `/status` `/players` `/announce` `/kick` `/ban` `/unban` `/save` |
| admin | everything operator has, plus `/restart` `/start` `/stop` |

`/ban`, `/restart`, `/stop` require a Confirm/Cancel button press before doing anything.

## Palworld REST API

- Enabled in `PalWorldSettings.ini`: `RESTAPIEnabled=True`, `RESTAPIPort=8212`
- Auth: HTTP Basic, username `admin`, password = `PALWORLD_ADMIN_PASSWORD` in `.env`
- Bound to localhost only — never expose port 8212 to the internet (Azure NSG should not have an inbound rule for it)
- Manual smoke test: `cd /home/morfit/palworld-bot && node --env-file=.env scripts/check-rest-api.js`
- **Gotcha (already handled in `/stop`'s code, documented here so it isn't reintroduced):** the REST API's `shutdown`/`stop` endpoints make the PalServer *process itself* exit. Since `palworld`'s PM2 entry has `autorestart: true`, PM2 can't tell that apart from a crash and will bring it right back up on its own within seconds. `/stop` waits out the shutdown, then explicitly calls `pm2 stop palworld` so PM2 knows it was intentional and stays down. If you ever call the REST shutdown endpoint directly (bypassing the bot), follow it with a manual `pm2 stop palworld` too.

## Deploying code changes

There's no CI/CD here — updates are manual. **Only overwrite the tracked source files** — never `rm -rf`/replace the whole `palworld-bot` directory, since `config/guilds.json` and `data/audit-log.json` are gitignored (not in git) and live only on the VM; wiping the directory destroys them.

```bash
# from your machine: re-copy changed files to the VM, e.g. via pscp/scp
# then on the VM:
cd /home/morfit/palworld-bot
npm install        # only if package.json changed
npm test            # sanity check
pm2 restart palworld-bot
```

If slash commands themselves changed (new command, renamed option, etc.), also run:

```bash
npm run deploy-commands
```

**Restarting a single already-running app**: use `pm2 restart <name>` by name. Do **not** re-run `pm2 start deploy/ecosystem.config.js` (even with `--only`) against an app that's already running — in testing this caused the *other* app defined in the same ecosystem file to receive SIGINT and stop, even though it wasn't targeted. Only use `pm2 start deploy/ecosystem.config.js` for the very first bootstrap of both apps.

## First-time access setup (still needed)

The bot is online and has auto-registered itself in every guild it's been invited to, but new guilds start with **no admin/operator access and no channels configured**. Edit `config/roles.json` on the VM to add your Discord user ID (or a role ID) to the `admin` tier, and `config/channels.json` if you want the bot/server log channels — both hot-reload automatically, no restart needed.
