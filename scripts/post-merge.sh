#!/bin/bash
set -e

echo "==> Post-merge setup starting..."

# Install/update Node.js dependencies
if [ -f package.json ]; then
    echo "==> Running npm install..."
    npm install --prefer-offline --no-audit --no-fund 2>&1 || npm install --no-audit --no-fund 2>&1
fi

echo "==> Post-merge setup complete."
