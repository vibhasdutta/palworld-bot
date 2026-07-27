# Palworld Discord Admin Bot — Operations Guide

Live deployment: `20.207.201.17`, user `morfit`.

## Layout on the VM

- `/home/morfit/palworld/` — the Palworld dedicated server (SteamCMD install, `PalServer.sh`, `PalWorldSettings.ini` under `Pal/Saved/Config/LinuxServer/`)
- `/home/morfit/palworld-bot/` — this bot's code, `.env` (secrets), `config/guilds.json` (per-guild permissions)

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

- **`.env`** (gitignored, lives only on the VM and your local machine) — Discord bot token, client ID, Palworld REST API URL/password, PM2 process name. Restart the bot after editing.
- **`config/guilds.json`** (gitignored) — one entry per Discord server the bot is in:
  ```json
  {
    "guildId": "...",
    "admin":    { "roleIds": [...], "userIds": [...] },
    "operator": { "roleIds": [...], "userIds": [...] }
  }
  ```
  The bot **creates this entry automatically** the moment it joins a guild (or on its own startup for guilds it's already in) — you never need to look up a guild ID by hand. New entries start with empty `roleIds`/`userIds`, meaning **nobody has access yet**. Add role IDs and/or individual user IDs to `admin`/`operator`, then `pm2 restart palworld-bot` to apply. A role and a user ID work independently — either grants that tier.

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

## Deploying code changes

There's no CI/CD here — updates are manual:

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

## First-time access setup (still needed)

The bot is online and has auto-registered itself in every guild it's been invited to, but **no one has admin/operator access yet**. Edit `config/guilds.json` on the VM to add your Discord user ID (or a role ID) to the `admin` tier, then `pm2 restart palworld-bot`.
