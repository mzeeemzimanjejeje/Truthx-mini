# TRUTH-MD — WhatsApp Bot

> A feature-rich WhatsApp bot with 440+ commands and a web-based setup UI. Visit the site, enter your number or session ID, and the bot connects instantly.

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/mzeeemzimanjejeje/Truthx-mini)
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https://github.com/mzeeemzimanjejeje/Truthx-mini)

---

## ✨ How It Works

1. Visit the bot's web UI
2. Enter your WhatsApp number **or** paste a Session ID
3. If using phone number — enter the 8-character pairing code in WhatsApp → Linked Devices
4. Bot is instantly active ✅

---

## 🚀 Deploy on Railway

Click the **Deploy on Railway** button above, then set these environment variables in the Railway dashboard:

| Variable | Required | Description |
|---|---|---|
| `SESSION_ID` | Recommended | WhatsApp session string (`TRUTH-MD:~xxxxx`) — skip to pair via web UI instead |
| `OWNER_NUMBER` | ✅ Yes | Your WhatsApp number with country code, no `+` (e.g. `254712345678`) |
| `DATABASE_URL` | ✅ Yes | PostgreSQL URL — add a Railway Postgres plugin for this |
| `BOT_NAME` | Optional | Bot display name (default: `TRUTH-MD`) |
| `PREFIX` | Optional | Command prefix (default: `.`) |

> **Railway Postgres:** In your Railway project → New → Database → PostgreSQL. `DATABASE_URL` is injected automatically.

---

## 🟣 Deploy on Heroku

Click the **Deploy to Heroku** button above, then set these environment variables:

| Variable | Required | Description |
|---|---|---|
| `SESSION_ID` | Recommended | WhatsApp session string (`TRUTH-MD:~xxxxx`) — skip to pair via web UI instead |
| `OWNER_NUMBER` | ✅ Yes | Your WhatsApp number with country code, no `+` (e.g. `254712345678`) |
| `DATABASE_URL` | Auto | Added automatically with the Heroku Postgres add-on |
| `BOT_NAME` | Optional | Bot display name (default: `TRUTH-MD`) |
| `PREFIX` | Optional | Command prefix (default: `.`) |

> **Heroku Postgres:** Go to Resources → Add-ons → search **Heroku Postgres** → attach it.

---

## 🖥️ Deploy on VPS (one command)

```bash
curl -fsSL https://raw.githubusercontent.com/mzeeemzimanjejeje/Truthx-mini/main/setup-vps.sh | bash
```

This installs Docker, clones the repo, prompts you to fill in `.env`, then starts the bot on port 80. Your website is live at `http://your-server-ip`.

---

## 💻 Local Setup

```bash
git clone https://github.com/mzeeemzimanjejeje/Truthx-mini
cd Truthx-mini
npm install
cp .env.example .env
# Edit .env with your values
node index.js
```

Open `http://localhost:5000` to access the setup UI.

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
SESSION_ID=
OWNER_NUMBER=254712345678
PORT=5000
BOT_NAME=TRUTH-MD
PREFIX=.
DATABASE_URL=postgresql://...
GITHUB_PERSONAL_ACCESS_TOKEN=
```

---

## 📋 Commands

| Command | Description |
|---|---|
| `.menu` | Show all available commands |
| `.alive` | Check if bot is active |
| `.ping` | Response speed |
| `.uptime` | Bot uptime |
| `.info` | Bot information |
| + 435 more | Full TRUTH-MD command set |

---

## 📁 Project Structure

```
index.js           ← Main entry point (bot + web server)
main.js            ← Message handling pipeline
settings.js        ← Bot configuration
config.js          ← API endpoints and keys
commands/          ← 440+ bot command plugins
lib/               ← Core utilities (auth, DB, anti-spam, etc.)
data/              ← Bot runtime data
Dockerfile         ← Container build
docker-compose.yml ← VPS Docker deployment
setup-vps.sh       ← One-command VPS installer
```

---

Made with ❤️ by TRUTH-MD
