# TRUTH-MD — Pterodactyl Panel Deployment Guide

Complete, tested guide for deploying TRUTH-MD WhatsApp bot on Pterodactyl panels.
Covers single and bulk deployment with one reusable config.

---

## Root Causes of Common Panel Failures

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find module 'axios'` | `npm install` OOM-killed on low-RAM container | Fixed in bot code — axios is now optional |
| `filesystem: not enough disk space` | Relay caches old commit directories in `/tmp/truth-md-bot/` | `start.sh` now auto-cleans stale relay dirs |
| `401` on pairing code | Old PostgreSQL session keys conflict with new number | Fixed — bot clears PG on `FORCE_PAIR` |
| `401 retry loop` | After pairing timeout, bot retried with broken session | Fixed — bot re-requests pairing code up to 3x |
| Port not accessible | Bot used `PORT` but Pterodactyl sets `SERVER_PORT` | Fixed — bot now reads `SERVER_PORT` first |
| `npm install` OOM | No memory cap during install on 256 MB containers | `start.sh` now caps npm install heap |

---

## One-Shot Fix — Complete Setup

### Startup Command

Set this as the **Startup Command** in the Pterodactyl server settings:

```
bash start.sh
```

The `start.sh` script automatically:
- Detects available RAM and sets the correct heap limit
- Runs `npm install` if `node_modules` is missing (with memory cap)
- Reads `SERVER_PORT` from Pterodactyl and exports it as `PORT`
- Cleans up stale relay cache directories to free disk space
- Starts the bot with optimal Node.js flags

### Required Environment Variables

Set these in **Server → Startup → Variables**:

```
SESSION_ID    = TRUTH-MD~your_session_id_here
DATABASE_URL  = postgresql://user:pass@host:5432/dbname
NODE_ENV      = production
```

**First-time pairing only** (remove after pairing succeeds):
```
OWNER_NUMBER  = 254712345678
FORCE_PAIR    = true
```

### Minimum Server Resources

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 512 MB | 1 GB |
| CPU | 50% | 100% |
| Disk | 3 GB | 5 GB |
| Node.js | 18+ | 20 LTS |

---

## Bulk Deployment — Egg Import

To deploy the same config across all panels without repeating manual steps:

1. Go to **Admin Panel → Nests → Import Egg**
2. Upload `pterodactyl-egg.json` from this repo
3. Create new servers using that egg — all variables are pre-defined
4. Set `SESSION_ID` and `DATABASE_URL` per server (everything else is shared)

The egg includes the correct startup command, Docker image (Node 20), variable definitions, and an auto-install script.

---

## Environment Variable Reference

```env
# Required
SESSION_ID=TRUTH-MD~xxxxxxxxxxxxxx   # From https://truth-md.courtneytech.xyz
DATABASE_URL=postgresql://...        # Keeps session alive across container restarts
NODE_ENV=production

# Set automatically by Pterodactyl — do NOT set manually
SERVER_PORT=8080

# First-time pairing only — delete both after pairing
OWNER_NUMBER=254712345678
FORCE_PAIR=true
```

---

## Fixing "Not Enough Disk Space"

The relay caches each downloaded bot version as a separate folder inside `/tmp/truth-md-bot/`. Old folders accumulate across restarts. The updated `start.sh` auto-cleans all but the two newest on each boot.

If the disk is already full before the bot can start:

1. In the Pterodactyl **File Manager**, navigate to `/tmp/`
2. Delete the entire `truth-md-bot/` folder
3. Restart the server — it re-downloads fresh

---

## Session Persistence

Without `DATABASE_URL`, every container restart loses the WhatsApp session and needs re-pairing. With PostgreSQL:

- Session survives restarts, server moves, and egg changes
- Bot reconnects automatically — no manual pairing needed

**Free PostgreSQL providers:**
- [Neon](https://neon.tech) — 512 MB free
- [Supabase](https://supabase.com) — 500 MB free
- [Railway](https://railway.app) — 1 GB free

Copy the connection string and paste it as `DATABASE_URL`.

---

## Pairing a New Number

1. Add to server variables:
   ```
   OWNER_NUMBER = 254712345678
   FORCE_PAIR   = true
   ```
2. Restart the server
3. Watch the console — a code like `ABCD-1234` will appear within 30 seconds
4. On your phone: **WhatsApp → Settings → Linked Devices → Link a Device**
5. Enter the code
6. **After the console shows "Connected":** delete `OWNER_NUMBER` and `FORCE_PAIR`
7. Restart — the bot will auto-connect from the stored session every time

If the code expires before you enter it, the bot automatically clears the broken session and generates a fresh code (up to 3 attempts before stopping).

---

## Final Checklist

- [ ] Startup command: `bash start.sh`
- [ ] `SESSION_ID` set, OR `OWNER_NUMBER` + `FORCE_PAIR` for first-time pairing
- [ ] `DATABASE_URL` pointing to a live PostgreSQL instance
- [ ] `NODE_ENV=production`
- [ ] At least 512 MB RAM and 3 GB disk allocated
- [ ] Node.js 18 or 20 available in the container
- [ ] After pairing: `FORCE_PAIR` and `OWNER_NUMBER` removed from variables
- [ ] Console shows no crash loops — bot stays online
