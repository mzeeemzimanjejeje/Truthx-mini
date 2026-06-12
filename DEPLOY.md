# Deployment: Private → Public → Heroku Sync Chain

## Overview

This project uses a three-stage deployment pipeline:

1. **Private Repo** (development) — Where code changes are made
2. **Public Repo** (`mzeeemzimanjejeje/Maintaining`) — Mirror of the private repo
3. **Heroku** — Production deployment, auto-deploys from the public repo

## One-Time Setup: Push Pending Commits

Before the automated pipeline takes over, push any pending commits to the
public repo. From a terminal with GitHub credentials:

```bash
git push origin main
```

If pushing from Replit, set `GITHUB_TOKEN` as an environment variable first,
then run:

```bash
git remote set-url origin https://$GITHUB_TOKEN@github.com/mzeeemzimanjejeje/Maintaining.git
git push origin main
```

## How It Works

### Step 1: Private → Public Sync (GitHub Actions)

The `.github/workflows/sync-to-public.yml` workflow automatically pushes every
commit on `main` in the private repo to the public repo.

**Required GitHub Secret:**

- `PUBLIC_REPO_TOKEN` — A GitHub Personal Access Token (classic) with `repo`
  scope, authorized to push to `mzeeemzimanjejeje/Maintaining`.

**To set it up:**

1. Go to https://github.com/settings/tokens and generate a classic token with
   `repo` scope.
2. In the **private** repo, go to Settings → Secrets and variables → Actions.
3. Add a new repository secret named `PUBLIC_REPO_TOKEN` with the token value.

### Step 2: Public Repo → Heroku Auto-Deploy

Heroku is connected to the public repo and auto-deploys on every push to `main`.

**To verify or enable:**

1. Log in to the Heroku Dashboard at https://dashboard.heroku.com.
2. Open your app and go to the **Deploy** tab.
3. Under **Deployment method**, select **GitHub** and connect to
   `mzeeemzimanjejeje/Maintaining`.
4. Under **Automatic deploys**, enable automatic deploys from the `main` branch.
5. Optionally check "Wait for CI to pass before deploy" if you add CI later.

The `Procfile` is already configured:

```
web: node server.js
```

### Pushing Directly from Replit

If you develop on Replit (which clones the public repo as `origin`), you can
push directly:

```bash
git push origin main
```

Heroku will auto-deploy as soon as the public repo receives the push.

## Environment Variables

No Heroku config vars are required just to display the website.

If you later want to use bot commands, set `SESSION_ID` or `OWNER_NUMBER`
after deployment.

## Troubleshooting

- **Push rejected**: Ensure your GitHub token has write access to the public repo.
- **Heroku not deploying**: Check the Deploy tab — automatic deploys may be
  paused or disconnected.
- **Build fails on Heroku**: Check the Activity tab for build logs. The
  `heroku-postbuild` script rebuilds `sharp` from source.
