# TRUTH-MD — WhatsApp Pair Web Bot

> Multi-session WhatsApp bot with a web pairing interface. Users visit the site, enter their number, get a pairing code, and the bot connects instantly — no session ID needed.

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/mzeeemzimanjejeje/Truthx-mini)

---

## ✨ How It Works

1. User opens the website
2. Enters their WhatsApp number (with country code)
3. Gets an 8-character pairing code
4. Opens WhatsApp → Linked Devices → Link with phone number → enters the code
5. Bot is instantly active on their account ✅

No QR code. No session ID. Just pair and go.

---

## 🚀 Deploy on Heroku

Click the button above, then set these environment variables:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ Yes | PostgreSQL URL (add Heroku Postgres add-on) |
| `OWNER_NUMBER` | ✅ Yes | Your WhatsApp number with country code (e.g. `263771234567`) |
| `BOT_NAME` | Optional | Bot display name (default: `TRUTH-MD`) |
| `PREFIX` | Optional | Command prefix (default: `.`) |

> **Heroku Postgres:** After deploying, go to Resources → Add-ons → search **Heroku Postgres** → attach it. `DATABASE_URL` is set automatically.

---

## 💻 Local / VPS Setup

```bash
git clone https://github.com/mzeeemzimanjejeje/Truthx-mini
cd Truthx-mini
npm install
cp .env.example .env
# Edit .env with your values
node server.js
```

Then open `http://localhost:3000` to access the pair web UI.

---

## 📋 Commands

Once paired, users can send these commands:

| Command | Description |
|---|---|
| `.menu` | Show all available commands |
| `.alive` | Check if bot is active |
| `.ping` | Check response speed |
| `.uptime` | Bot uptime |
| `.info` | Bot information |
| + 440 more | All standard TRUTH-MD commands |

---

## 📁 Structure

```
server.js          ← Pair web entry point (Express + Socket.io)
lib/
  SessionManager.js  ← Multi-session Baileys management
  CommandHandler.js  ← Command handling
public/
  index.html         ← Pair web UI (WhatsApp dark theme)
commands/            ← 440 bot commands
Procfile             ← Heroku: web: node server.js
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
PORT=3000
BOT_NAME=TRUTH-MD
PREFIX=.
OWNER_NUMBER=263771234567
DATABASE_URL=postgresql://...
```

---

Made with ❤️ by TRUTH-MD
