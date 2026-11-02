#!/usr/bin/env bash
# Weekly disk hygiene on the VPS. Install once (as root):
#   cp /opt/plato/src/deploy/vps-housekeeping.sh /usr/local/bin/plato-housekeeping && chmod +x /usr/local/bin/plato-housekeeping
#   echo '0 4 * * 0 root /usr/local/bin/plato-housekeeping >> /var/log/plato-housekeeping.log 2>&1' > /etc/cron.d/plato-housekeeping
# Container logs rotate by themselves (docker-compose.yml x-logging and /etc/docker/daemon.json); this removes what
# rotation does not cover: the build cache, dangling and unused images, stopped containers, and old journal entries.
set -u
echo "== $(date -Is) before: $(df -h / | awk 'NR==2{print $4" free"}')"
docker builder prune -af --filter until=168h >/dev/null 2>&1 || true   # build cache older than 7 days
docker image prune -af --filter until=168h >/dev/null 2>&1 || true     # images not used by a container, older than 7 days
docker container prune -f --filter until=24h >/dev/null 2>&1 || true   # stopped containers
docker volume ls -qf dangling=true | grep -v -E 'plato_|mongo|redis|caddy' | xargs -r docker volume rm >/dev/null 2>&1 || true  # anonymous volumes only; named data volumes are never touched
journalctl --vacuum-size=500M --vacuum-time=14d >/dev/null 2>&1 || true
find /var/log -name '*.gz' -mtime +30 -delete 2>/dev/null || true
command -v pm2 >/dev/null && pm2 flush >/dev/null 2>&1 || true          # pm2 logs, while pm2 still runs
echo "== after: $(df -h / | awk 'NR==2{print $4" free"}')"
