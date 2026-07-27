# Palworld Discord Admin Bot — Design

## Goal

A Discord bot that lets designated Discord roles manage the Palworld
dedicated server (currently running on an Azure VM, deployed via SteamCMD,
app id `2394010`) without SSH access: player moderation (kick/ban/unban),
announcements, world saves, and server lifecycle (start/stop/restart).

## Non-goals (v1)

- No whitelist management, scheduled restarts, or backup automation.
- No web dashboard — Discord is the only interface.
- No support for multiple game servers — one bot instance, one server.
- No live player-count presence/dashboard channel (can be added later).

## Background / research findings

- Palworld's **RCON is deprecated** and scheduled for removal. The
  supported control surface is the built-in **REST API**
  (`RESTAPIEnabled=True`, default port `8212`, HTTP Basic Auth via
  `AdminPassword`). Source: https://docs.palworldgame.com/api/rcon/,
  https://docs.palworldgame.com/category/rest-api
- Confirmed REST endpoints used by this bot:
  - `GET /v1/api/info` — server name/version
  - `GET /v1/api/players` — connected player list
  - `POST /v1/api/announce {message}`
  - `POST /v1/api/kick {userid, message}`
  - `POST /v1/api/ban {userid, message}`
  - `POST /v1/api/unban {userid}`
  - `POST /v1/api/save`
  - `POST /v1/api/shutdown {waittime, message}` — graceful
  - `POST /v1/api/stop` — force stop
- The REST API **cannot start a stopped server** (nothing to talk to) and
  is explicitly documented as unsafe to expose to the internet — it must
  stay bound to localhost/LAN.
- Server process lifecycle (start especially) requires OS-level control:
  `PalServer.sh` managed as a `systemd` service on the VM.

## Architecture

```
Discord ──slash commands──▶ Bot (Node.js, discord.js)  [runs on the Azure VM]
                                │
                ｜── HTTP (localhost:8212, Basic Auth) ──▶ Palworld REST API
                │        (players, kick, ban, announce, save, shutdown, stop)
                │
                └── child_process ──▶ sudo systemctl {start|stop|restart} palworld.service
```

The bot runs on the same VM as the game server (approved: same-VM hosting,
no tunneling needed) and is itself managed as its own systemd service for
auto-restart/boot persistence.

## Components

1. **Bot core** (discord.js, Node.js) — registers slash commands via
   Discord's application command API, routes interactions.
2. **Permission layer** — config-driven map of Discord role ID → tier
   (`admin` | `operator`). Every command handler checks the invoking
   member's roles against this map before doing anything. Multiple Discord
   roles can map to the same tier (supports "multiple admin roles,
   multiple operator roles").
3. **Palworld REST client** — thin wrapper module around the 8 endpoints
   above, targeting `http://localhost:8212`, Basic Auth credentials from
   config/env.
4. **Process control module** — shells out to
   `sudo systemctl {start,stop,restart} palworld.service` via
   `child_process.execFile` (not `exec`, to avoid shell interpolation).
   The bot's Linux service account has a sudoers rule scoped to exactly
   those three invocations of `systemctl` on that one unit — nothing else.
5. **Config** — `.env` (gitignored): Discord bot token, guild id, REST API
   host/port/password, role-id→tier mappings. `.env.example` committed as
   a template.

## Command surface (v1)

| Command | Args | Tier | Backing call |
|---|---|---|---|
| `/status` | – | operator | `GET /v1/api/info` |
| `/players` | – | operator | `GET /v1/api/players` |
| `/announce` | message | operator | `POST /v1/api/announce` |
| `/kick` | userid, reason? | operator | `POST /v1/api/kick` |
| `/ban` | userid, reason? | operator | `POST /v1/api/ban` |
| `/unban` | userid | operator | `POST /v1/api/unban` |
| `/save` | – | operator | `POST /v1/api/save` |
| `/restart` | – | admin | systemctl restart |
| `/start` | – | admin | systemctl start |
| `/stop` | graceful? waittime? | admin | REST `shutdown`/`stop`, falls back to `systemctl stop` if REST unreachable |

Tier split is adjustable post-review; this is the default the user approved.

## Data flow (example: `/kick`)

1. User invokes `/kick userid:<id> reason:<text>` in Discord.
2. Bot resolves invoking member's roles → tier. If no role maps to
   `operator` or `admin`, reply ephemeral "not authorized", stop.
3. Bot calls `POST http://localhost:8212/v1/api/kick` with Basic Auth.
4. On 200, reply with confirmation embed. On network/HTTP error, reply
   with a clear ephemeral error (distinguish "server unreachable" —
   expected when PalServer is down — from other failures).

## Error handling

- REST calls wrapped in try/catch; connection refused is treated as an
  expected "server is offline" state, not a crash.
- `systemctl` calls check exit code; non-zero surfaces stderr (truncated)
  in an ephemeral reply, never crashes the bot process.
- All destructive commands (`/ban`, `/stop`, `/restart`) get a Discord
  confirmation step (button or `--confirm` style follow-up) before
  executing, to avoid fat-finger mistakes.

## Security

- REST API and bot both bound to localhost/VM-internal only — the only
  public-facing surface is Discord itself.
- Sudoers rule is scoped to the three exact systemctl invocations, not a
  general sudo grant.
- Secrets (bot token, REST password) never committed; `.env` gitignored.
- Role→tier checks happen server-side in the bot, not relying solely on
  Discord's native per-command permission UI (which is per-guild config
  and easy to drift out of sync).

## Testing

- Smoke script (`scripts/check-rest-api.js`) that hits `GET /v1/api/info`
  against the real server once SSH/VM details are available, to validate
  REST auth before wiring commands into the bot.
- Manual test pass in a private test/staging Discord server for each
  command against the live REST API before rollout to the real admin
  server.

## Open items / inputs still needed from user

- Azure VM SSH access details (to be provided later).
- Confirm whether `PalServer.sh` is already running under systemd, or
  whether this project needs to create that unit file.
- Discord bot token + application (to be created in Discord Developer
  Portal) and the target guild ID.
- Actual Discord role IDs to map into `admin`/`operator` tiers.
