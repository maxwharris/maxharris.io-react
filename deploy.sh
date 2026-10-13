#!/bin/bash
# Deploy hook for maxharris.io. Runs ON the box (ec2p) in /var/www/maxharris.io, after `git pull`.
# From your Mac, run `deployp` in this repo: it pushes, pulls on the box, runs this, then checks
# the URLs below. Running it by hand on the box works too. Box conventions: dev-personal/CLAUDE.md
#
# check: https://maxharris.io/
# check: https://maxharris.io/api/health
# check: https://api.maxharris.io/api/health
#
# nginx (sites-available/maxharris.io) serves dist/ and proxies /api and /socket.io to :3001.
# server/.env exists only on the box.

set -e
[ "$(uname)" = Linux ] || { echo "deploy.sh runs on the box. From your Mac: deployp"; exit 1; }
cd "$(dirname "$0")"

# Frontend: build beside the live dist/ and swap it in only if the build succeeds.
rm -rf dist.next
npm ci --no-audit --no-fund
npx vite build --outDir dist.next --emptyOutDir
rm -rf dist.prev && { [ ! -d dist ] || mv dist dist.prev; } && mv dist.next dist && rm -rf dist.prev

# API
(cd server && npm ci --omit=dev --no-audit --no-fund)
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
