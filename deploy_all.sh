#!/bin/bash
export HEROKU_API_KEY=${HEROKU_API_KEY}

APPS=(
    "truthx-mini-1783266336"
    "truthx-mini-1783272010-1"
    "truthx-mini-1783272044-2"
    "truthx-mini-1783272045-1"
    "truthx-mini-1783272126-4"
    "truthx-mini-1783272241-2"
    "truthx-mini-1783272268-3"
    "truthx-mini-1783272397-3"
    "truthx-mini-1783272434-4"
    "truthx-mini-1783272550-4"
)

cd /home/ubuntu/Truthx-mini

for APP in "${APPS[@]}"; do
    echo "----------------------------------------------------"
    echo "🚀 Deploying to $APP..."
    echo "----------------------------------------------------"
    
    # Check if app exists
    if heroku apps:info -a "$APP" >/dev/null 2>&1; then
        # Add heroku remote with API key for authentication
        git remote remove "$APP" >/dev/null 2>&1
        git remote add "$APP" "https://:$HEROKU_API_KEY@git.heroku.com/$APP.git"
        
        # Push to heroku
        if git push "$APP" main:master --force; then
            echo "✅ Successfully deployed to $APP"
        else
            echo "❌ Failed to deploy to $APP"
        fi
    else
        echo "❌ App $APP not found or no access"
    fi
done
