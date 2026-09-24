#!/usr/bin/env bash
# Run as root on the existing Refract AWS host after uploading a committed release.
set -euo pipefail
revision=${1:?Usage: install-aws.sh GIT_SHA HTTPS_ORIGIN}
public_origin=${2:-https://refracthack.org}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid revision' >&2; exit 1; }
public_host=$(python3 - "$public_origin" <<'PY'
import sys, urllib.parse
u=urllib.parse.urlsplit(sys.argv[1])
if u.scheme!='https' or u.hostname!='refracthack.org' or u.path or u.query or u.fragment or u.username or u.password or u.port not in (None, 443):
    raise SystemExit('Use https://refracthack.org without a path or credentials.')
print(u.hostname)
PY
)
public_origin="https://$public_host"
release="/opt/refract/releases/$revision"
test -f "$release/server/index.mjs"
test -f "/etc/letsencrypt/live/$public_host/fullchain.pem"
test -f "/etc/letsencrypt/live/$public_host/privkey.pem"
openssl x509 -in "/etc/letsencrypt/live/$public_host/fullchain.pem" -noout -checkhost "$public_host"
openssl x509 -in "/etc/letsencrypt/live/$public_host/fullchain.pem" -noout -checkhost "www.$public_host"
# Retain the IP certificate so existing preview bookmarks can redirect safely.
test -f /etc/letsencrypt/live/refract-ip/fullchain.pem
test -f /etc/letsencrypt/live/refract-ip/privkey.pem
id -u refract >/dev/null 2>&1 || useradd --system --home-dir /var/lib/refract --shell /sbin/nologin refract
install -d -m 700 /etc/refract
install -d -m 700 -o refract -g refract /var/lib/refract
if [[ ! -f /etc/refract/refract.env ]]; then
  umask 077
  auth_secret=$(openssl rand -hex 32)
  cat > /etc/refract/refract.env <<ENV
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
BETTER_AUTH_URL=$public_origin
BETTER_AUTH_SECRET=$auth_secret
DATABASE_PATH=/var/lib/refract/refract.sqlite
RESEND_API_KEY=
RESEND_FROM_EMAIL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ENV
  unset auth_secret
fi
# Update only the public origin; preserve provider keys, signing secret and data.
chmod 600 /etc/refract/refract.env
cp -a /etc/refract/refract.env "/etc/refract/env-before-$revision"
python3 - "$public_origin" <<'PYORIGIN'
from pathlib import Path
import os, re, sys
p = Path('/etc/refract/refract.env')
lines = [line for line in p.read_text().splitlines() if not re.match(r'^\s*BETTER_AUTH_URL\s*=', line)]
lines.append('BETTER_AUTH_URL=' + sys.argv[1])
temporary = p.with_name('.refract.env.next')
fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as stream:
    stream.write('\n'.join(lines) + '\n')
os.replace(temporary, p)
PYORIGIN
if [[ -f /var/lib/refract/refract.sqlite ]]; then
  sudo -u refract /usr/bin/node --input-type=module - "$revision" <<'JS'
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('/var/lib/refract/refract.sqlite');
db.prepare('VACUUM INTO ?').run(`/var/lib/refract/before-${process.argv[2]}-${Date.now()}.sqlite`);
db.close();
JS
fi
previous_app=$(readlink /opt/refract/current || true)
previous_web=$(readlink /var/www/refract/current || true)
cp -a /etc/nginx/conf.d/refract.conf "/etc/refract/nginx-before-$revision.conf"
install -m 644 "$release/deploy/refract.service" /etc/systemd/system/refract.service
ln -sfn "$release" /opt/refract/.next
mv -Tf /opt/refract/.next /opt/refract/current
systemctl daemon-reload
systemctl enable refract >/dev/null
systemctl restart refract
healthy=0
for attempt in {1..20}; do
  if curl -fsS http://127.0.0.1:3001/api/health >/dev/null 2>&1; then healthy=1; break; fi
  sleep .5
done
if [[ "$healthy" != 1 ]]; then
  cp -a "/etc/refract/env-before-$revision" /etc/refract/refract.env
  if [[ -n "$previous_app" ]]; then ln -sfn "$previous_app" /opt/refract/current; systemctl restart refract; else systemctl stop refract; fi
  echo 'Service failed health check; previous application restored.' >&2
  exit 1
fi
cat > /etc/nginx/conf.d/refract.conf <<NGINX
server_names_hash_bucket_size 128;
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $public_host www.$public_host 18.188.82.113;
    server_tokens off;
    location ^~ /.well-known/acme-challenge/ {
        root /var/lib/refract-acme;
        default_type text/plain;
        try_files \$uri =404;
    }
    location / { return 308 $public_origin\$request_uri; }
}
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name $public_host;
    ssl_certificate /etc/letsencrypt/live/$public_host/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$public_host/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:RefractSSL:10m;
    ssl_session_timeout 1d;
    error_page 497 =308 $public_origin\$request_uri;
    root /var/www/refract/current;
    index index.html;
    server_tokens off;
    client_max_body_size 12k;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    gzip on;
    gzip_vary on;
    gzip_types text/css application/javascript image/svg+xml application/json;
    location ^~ /.well-known/acme-challenge/ {
        root /var/lib/refract-acme;
        default_type text/plain;
        try_files \$uri =404;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 30s;
        proxy_hide_header X-Powered-By;
        add_header Cache-Control "no-store" always;
        add_header X-Content-Type-Options nosniff always;
    }
    location / { try_files \$uri \$uri/ =404; }
    location ~ \\.html\$ {
        try_files \$uri =404;
        add_header Cache-Control "no-cache" always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options DENY always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
    }
    location ~ /\\. { deny all; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.$public_host;
    ssl_certificate /etc/letsencrypt/live/$public_host/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$public_host/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    server_tokens off;
    return 308 $public_origin\$request_uri;
}
server {
    listen 8443 ssl default_server;
    listen [::]:8443 ssl default_server;
    server_name 18.188.82.113;
    ssl_certificate /etc/letsencrypt/live/refract-ip/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/refract-ip/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    server_tokens off;
    error_page 497 =308 $public_origin\$request_uri;
    return 308 $public_origin\$request_uri;
}
NGINX
if ! nginx -t; then
  cp -a "/etc/refract/env-before-$revision" /etc/refract/refract.env
  if [[ -n "$previous_app" ]]; then ln -sfn "$previous_app" /opt/refract/current; systemctl restart refract; else systemctl stop refract; fi
  cp -a "/etc/refract/nginx-before-$revision.conf" /etc/nginx/conf.d/refract.conf
  echo 'Nginx validation failed; configuration restored.' >&2
  exit 1
fi
install -d /var/www/refract/releases
ln -sfn "$release/dist" "/var/www/refract/releases/$revision"
ln -sfn "/var/www/refract/releases/$revision" /var/www/refract/.next
mv -Tf /var/www/refract/.next /var/www/refract/current
systemctl reload nginx
# Nginx reloads gracefully: old workers can serve the first request after reload.
public_healthy=0
for attempt in {1..20}; do
  if curl -fsS --max-time 5 --resolve "$public_host:443:127.0.0.1" "$public_origin/api/health" >/dev/null 2>&1; then public_healthy=1; break; fi
  sleep .5
done
if [[ "$public_healthy" != 1 ]]; then
  cp -a "/etc/refract/env-before-$revision" /etc/refract/refract.env
  if [[ -n "$previous_app" ]]; then ln -sfn "$previous_app" /opt/refract/current; systemctl restart refract; else systemctl stop refract; fi
  cp -a "/etc/refract/nginx-before-$revision.conf" /etc/nginx/conf.d/refract.conf
  if [[ -n "$previous_web" ]]; then ln -sfn "$previous_web" /var/www/refract/current; fi
  nginx -t && systemctl reload nginx
  echo 'Public routing failed; previous web release and nginx configuration restored.' >&2
  exit 1
fi
echo "Deployed Refract $revision"
