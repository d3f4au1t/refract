#!/usr/bin/env bash
# Run as root on the existing Refract AWS host after uploading a committed release.
set -euo pipefail
revision=${1:?Usage: install-aws.sh GIT_SHA HTTPS_ORIGIN}
public_origin=${2:?An HTTPS origin is required}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid revision' >&2; exit 1; }
public_host=$(python3 - "$public_origin" <<'PY'
import sys, urllib.parse
u=urllib.parse.urlsplit(sys.argv[1])
if u.scheme!='https' or not u.hostname or u.path or u.query or u.fragment or u.username or u.password or u.port:
    raise SystemExit('Use an HTTPS origin without a path, port or credentials.')
print(u.hostname)
PY
)
release="/opt/refract/releases/$revision"
test -f "$release/server/index.mjs"
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
# Keep credentials intact on subsequent deploys.
chmod 600 /etc/refract/refract.env
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
  if curl -fsS http://127.0.0.1:3001/api/health >/dev/null; then healthy=1; break; fi
  sleep .5
done
if [[ "$healthy" != 1 ]]; then
  if [[ -n "$previous_app" ]]; then ln -sfn "$previous_app" /opt/refract/current; systemctl restart refract; else systemctl stop refract; fi
  echo 'Service failed health check; previous application restored.' >&2
  exit 1
fi
cat > /etc/nginx/conf.d/refract.conf <<NGINX
server_names_hash_bucket_size 128;
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $public_host;
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
    ssl_certificate /etc/letsencrypt/live/refract-ip/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/refract-ip/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:RefractSSL:10m;
    ssl_session_timeout 1d;
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
        proxy_set_header Host \$host;
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
NGINX
if ! nginx -t; then
  cp -a "/etc/refract/nginx-before-$revision.conf" /etc/nginx/conf.d/refract.conf
  echo 'Nginx validation failed; configuration restored.' >&2
  exit 1
fi
install -d /var/www/refract/releases
ln -sfn "$release/dist" "/var/www/refract/releases/$revision"
ln -sfn "/var/www/refract/releases/$revision" /var/www/refract/.next
mv -Tf /var/www/refract/.next /var/www/refract/current
systemctl reload nginx
if ! curl -fsS --resolve "$public_host:443:127.0.0.1" "$public_origin/api/health" >/dev/null; then
  cp -a "/etc/refract/nginx-before-$revision.conf" /etc/nginx/conf.d/refract.conf
  if [[ -n "$previous_web" ]]; then ln -sfn "$previous_web" /var/www/refract/current; fi
  nginx -t && systemctl reload nginx
  echo 'Public routing failed; previous web release and nginx configuration restored.' >&2
  exit 1
fi
echo "Deployed Refract $revision"
