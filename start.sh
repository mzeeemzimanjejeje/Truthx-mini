#!/bin/sh
# TRUTH-MD startup script — works on Pterodactyl, Heroku, Render, Railway, VPS.

# ── 1. RAM detection ────────────────────────────────────────────────────────
detect_ram_mb() {
    if [ -f /sys/fs/cgroup/memory.max ]; then
        VAL=$(cat /sys/fs/cgroup/memory.max 2>/dev/null)
        if [ "$VAL" != "max" ] && [ -n "$VAL" ]; then
            echo $(( VAL / 1024 / 1024 ))
            return
        fi
    fi
    if [ -f /sys/fs/cgroup/memory/memory.limit_in_bytes ]; then
        VAL=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null)
        MB=$(( VAL / 1024 / 1024 ))
        if [ "$MB" -gt 0 ] && [ "$MB" -lt 65536 ]; then
            echo "$MB"
            return
        fi
    fi
    if [ -f /proc/meminfo ]; then
        awk '/MemTotal/ { printf "%d", $2 / 1024 }' /proc/meminfo
    else
        echo 512
    fi
}

TOTAL_RAM_MB=$(detect_ram_mb)

if [ "$TOTAL_RAM_MB" -le 300 ]; then
    MAX_OLD=$(( TOTAL_RAM_MB * 60 / 100 ))
elif [ "$TOTAL_RAM_MB" -le 512 ]; then
    MAX_OLD=$(( TOTAL_RAM_MB * 65 / 100 ))
else
    MAX_OLD=$(( TOTAL_RAM_MB * 70 / 100 ))
fi
[ "$MAX_OLD" -lt 80  ] && MAX_OLD=80
[ "$MAX_OLD" -gt 8192 ] && MAX_OLD=8192

echo "TRUTH MD › RAM: ${TOTAL_RAM_MB}MB  →  heap limit: ${MAX_OLD}MB"

# ── 2. Port configuration ───────────────────────────────────────────────────
if [ -n "$SERVER_PORT" ]; then
    export PORT="$SERVER_PORT"
fi
echo "TRUTH MD › Using port: ${PORT:-8080}"

# ── 3. Aggressive disk cleanup BEFORE install ────────────────────────────────
NPM_CACHE="/tmp/.npm-truth-cache"
export npm_config_cache="$NPM_CACHE"

disk_clean() {
    rm -rf "$NPM_CACHE" /tmp/npm-* /tmp/*.log /tmp/v8-* ~/.npm 2>/dev/null || true
}

# Returns free disk in MB (0 if unknown)
free_disk_mb() {
    df -k . 2>/dev/null | awk 'NR==2 { printf "%d", $4 / 1024 }' || echo 0
}

# Strip non-essential files from node_modules to reclaim disk space.
# Safe to run on every restart — never removes .js/.json/.node files needed at runtime.
prune_node_modules() {
    if [ ! -d "node_modules" ]; then return; fi

    BEFORE_MB=$(free_disk_mb)
    echo "TRUTH MD › Pruning node_modules (free: ${BEFORE_MB} MB)..."

    # Whole directories that are never needed at runtime
    find node_modules -type d \( \
        -name "test"        -o \
        -name "tests"       -o \
        -name "__tests__"   -o \
        -name "spec"        -o \
        -name "specs"       -o \
        -name "docs"        -o \
        -name "doc"         -o \
        -name "examples"    -o \
        -name "example"     -o \
        -name "benchmark"   -o \
        -name "benchmarks"  -o \
        -name "coverage"    -o \
        -name "fixtures"    -o \
        -name ".github"     -o \
        -name ".nyc_output" \
    \) -prune -exec rm -rf {} + 2>/dev/null || true

    # Individual files that are never needed at runtime
    find node_modules -type f \( \
        -name "*.md"        -o \
        -name "*.markdown"  -o \
        -name "*.map"       -o \
        -name "*.ts"        -o \
        -name "*.flow"      -o \
        -name "*.coffee"    -o \
        -name "CHANGELOG*"  -o \
        -name "CHANGES*"    -o \
        -name "HISTORY*"    -o \
        -name "CONTRIBUTING*" -o \
        -name "AUTHORS*"    -o \
        -name "NOTICE*"     -o \
        -name "Makefile"    -o \
        -name ".eslintrc*"  -o \
        -name ".prettierrc*" -o \
        -name "*.tgz"       -o \
        -name "*.log" \
    \) -delete 2>/dev/null || true

    AFTER_MB=$(free_disk_mb)
    SAVED=$(( AFTER_MB - BEFORE_MB ))
    echo "TRUTH MD › Prune complete — freed ~${SAVED} MB (free now: ${AFTER_MB} MB)"
}

echo "TRUTH MD › Cleaning disk space..."
disk_clean

# Remove cached/log directories that should never persist on Pterodactyl
rm -rf .cache logs .npm node_modules/.cache 2>/dev/null || true

# Remove old auth_state.db from session dir — auth is now stored in /tmp
rm -f session/auth_state.db session/auth_state.db-wal session/auth_state.db-shm 2>/dev/null || true

# Remove any stray log files in project root
find . -maxdepth 1 -name "*.log" -delete 2>/dev/null || true

# ── Auto-create .env if it doesn't exist ────────────────────────────────────
if [ ! -f ".env" ]; then
    echo "TRUTH MD › No .env found — creating template .env ..."
    printf 'SESSION_ID=\n' > .env
    echo "TRUTH MD › .env created. Edit it with your SESSION_ID and restart."
fi

# Reset baileys_store.json if it has grown too large (> 500 KB)
if [ -f "baileys_store.json" ]; then
    STORE_SIZE=$(wc -c < baileys_store.json 2>/dev/null || echo 0)
    if [ "$STORE_SIZE" -gt 512000 ]; then
        echo "TRUTH MD › Resetting oversized baileys_store.json (${STORE_SIZE} bytes)..."
        echo '{"chats":{},"contacts":{},"messages":{}}' > baileys_store.json
    fi
fi

RELAY_DIR="/tmp/truth-md-bot"
if [ -d "$RELAY_DIR" ]; then
    DIR_COUNT=$(find "$RELAY_DIR" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l)
    if [ "$DIR_COUNT" -gt 1 ]; then
        echo "TRUTH MD › Removing $((DIR_COUNT - 1)) old relay dir(s)..."
        find "$RELAY_DIR" -maxdepth 1 -mindepth 1 -type d -printf '%T+ %p\n' 2>/dev/null \
            | sort | head -n $(( DIR_COUNT - 1 )) | awk '{print $2}' \
            | xargs rm -rf 2>/dev/null || true
    fi
fi

rm -rf tmp/ logs/pm2-*.log 2>/dev/null || true

# Prune node_modules on every restart to keep disk usage low.
# SKIP on Heroku — the slug filesystem is immutable and already optimised at
# build time. Running find/rm on it wastes precious startup seconds.
if [ -z "$DYNO" ]; then
    prune_node_modules
else
    echo "TRUTH MD › Heroku slug detected — skipping node_modules prune."
fi

# ── 4. Install dependencies if missing ──────────────────────────────────────
if [ ! -d "node_modules" ] || [ ! -d "node_modules/@whiskeysockets" ]; then
    echo "TRUTH MD › Installing packages..."

    rm -rf node_modules package-lock.json 2>/dev/null || true

    NODE_OPTIONS="--max-old-space-size=${MAX_OLD}" \
        npm install --omit=dev --ignore-scripts --no-package-lock --legacy-peer-deps --no-audit --no-fund --no-optional 2>&1
    EXIT_CODE=$?
    disk_clean

    if [ "$EXIT_CODE" -ne 0 ]; then
        echo "TRUTH MD › Retrying install..."
        rm -rf node_modules 2>/dev/null || true
        NODE_OPTIONS="--max-old-space-size=${MAX_OLD}" \
            npm install --omit=dev --force --ignore-scripts --no-package-lock --no-audit --no-fund --no-optional 2>&1
        disk_clean
    fi

    echo "TRUTH MD › Building native modules..."
    npm rebuild 2>&1 || echo "TRUTH MD › Some native modules failed (non-fatal)"
    disk_clean

    echo "TRUTH MD › Dependencies ready."
fi

# ── 5. Verify node_modules integrity ────────────────────────────────────────
# SKIP on Heroku — the slug is built and verified at deploy time.
# Running a dynamic import() on every dyno start wastes 1-3 seconds.
if [ -z "$DYNO" ] && [ -d "node_modules" ]; then
    # Use dynamic import() because baileys ships as an ES module — require() always fails on ESM
    if ! node --input-type=module -e "import('@whiskeysockets/baileys').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
        echo "TRUTH MD › Corrupted modules — reinstalling..."
        rm -rf node_modules package-lock.json 2>/dev/null || true
        disk_clean
        NODE_OPTIONS="--max-old-space-size=${MAX_OLD}" \
            npm install --omit=dev --ignore-scripts --no-package-lock --legacy-peer-deps --no-audit --no-fund --no-optional 2>&1
        npm rebuild 2>&1 || true
        disk_clean
        echo "TRUTH MD › Reinstall complete."
    fi
fi

# ── 6. Start the bot ─────────────────────────────────────────────────────────
# Semi-space is the V8 nursery (young-gen GC).  On very low RAM it must be
# kept small so the combined heap (old+semi) fits inside the container limit.
#   ≤300 MB total RAM → 16 MB semi-space  (old 150 + semi 16 = 166 MB heap)
#   ≤512 MB total RAM → 32 MB semi-space  (old ~330 + semi 32 = 362 MB heap)
#   otherwise         → 64 MB semi-space  (safe for ≥1 GB machines)
if   [ "$TOTAL_RAM_MB" -le 300 ]; then SEMI_SPACE=16
elif [ "$TOTAL_RAM_MB" -le 512 ]; then SEMI_SPACE=32
else SEMI_SPACE=64
fi
echo "TRUTH MD › Semi-space: ${SEMI_SPACE}MB"

exec node \
    --max-old-space-size="$MAX_OLD" \
    --max-semi-space-size="$SEMI_SPACE" \
    --expose-gc \
    --import ./lib/preload-baileys.mjs \
    index.js
