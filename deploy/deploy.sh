#!/usr/bin/env bash
# Deploy on the VPS itself (no GitHub Actions): pull main, build the two images on the server, restart the stack.
#   bash /opt/plato/src/deploy/deploy.sh
# Server layout: /opt/plato/.env (secrets, written by hand), /opt/plato/src (this repo at main).
# Compose runs inside src so the build contexts resolve; .env is symlinked in so the API gets its settings.
set -euo pipefail
ROOT=/opt/plato
SRC=$ROOT/src
REPO=https://github.com/YoussifSalama/plato-native.git

[ -f "$ROOT/.env" ] || { echo "missing $ROOT/.env (copy deploy/env.example and fill it)"; exit 1; }
[ -d "$SRC/.git" ] || git clone -q "$REPO" "$SRC"
git -C "$SRC" fetch -q origin
git -C "$SRC" checkout -q main
git -C "$SRC" reset -q --hard origin/main
ln -sfn "$ROOT/.env" "$SRC/.env"
cd "$SRC"
echo "== deploying $(git log --oneline -1)"
export API_IMAGE=plato-api:local WEB_IMAGE=plato-web:local
docker compose -p plato build --pull api web
docker compose -p plato up -d --remove-orphans
docker image prune -f >/dev/null
docker compose -p plato ps
echo "== done: https://$(grep '^WEB_DOMAIN=' .env | cut -d= -f2)  api https://$(grep '^API_DOMAIN=' .env | cut -d= -f2)"
