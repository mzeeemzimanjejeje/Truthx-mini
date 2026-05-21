# TRUTH-MD WhatsApp Bot

## Overview
A feature-rich WhatsApp bot built with Node.js and [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys). Supports 437 commands across 184 plugins.

## Project Structure
- `index.js` — Main entry point; starts the health/web server on `PORT` (default 5000) and initiates WhatsApp connection
- `main.js` — Message handling pipeline
- `config.js` — Global API endpoints and keys
- `settings.js` — Bot configuration (name, prefix, RAM-scaled limits)
- `commands/` — Individual command plugins (184 files)
- `lib/` — Core utilities: auth state, database layers, anti-spam, group tracking, etc.
- `database/` — JSON-based user settings
- `data/` — Bot runtime data (prefix, banned users, sudo, welcome messages, etc.)
- `scripts/` — Build/patch scripts (patch-baileys.js runs post-install)

## Tech Stack
- **Runtime**: Node.js 20.x
- **WhatsApp**: @whiskeysockets/baileys 7.0.0-rc.9
- **Databases**: PostgreSQL (auth state + settings), SQLite (chat store, chatbot, config), JSON files (data)
- **Web server**: Express + Node http (health check / setup UI)
- **Media**: sharp, jimp, fluent-ffmpeg, node-webpmux
- **Other**: dotenv, pino (logging), node-cache, axios, ws

## Running the Bot
The workflow runs: `PORT=5000 node index.js`

On first run the bot shows a web UI (port 5000) to enter:
1. **Session ID** — paste a pre-existing session string, or
2. **Phone number** — triggers WhatsApp pairing code flow

## Environment Variables
- `SESSION_ID` — WhatsApp session credential string
- `DATABASE_URL` / `POSTGRESQL_URL` etc. — PostgreSQL connection URL
- `PORT` / `SERVER_PORT` — HTTP port (set to 5000 for Replit)
- `OWNER_NUMBER` — Bot owner's WhatsApp number
- `RELAY_KEY` / `ACCESS_KEY` — Relay authentication key
- `GIPHY_API_KEY` — For GIF commands

## Auth State Storage
- **PostgreSQL** (when `DATABASE_URL` is set): all credentials and signal keys survive restarts — recommended for Heroku/panel.
- **SQLite fallback** (no PostgreSQL): stored at `session/auth_state.db` — survives restarts on Heroku and Pterodactyl panels because it lives inside `session/` (persistent disk), not `/tmp` (wiped on every restart).
- Previous behaviour stored the SQLite DB at `/tmp/truth-md-auth.db`, causing signal-key loss on every restart → bot would connect but never respond. Fixed in `lib/sqliteAuthState.js`.

## Deployment
Configured as a **VM** deployment (always-running) since the bot needs persistent WebSocket connections.
