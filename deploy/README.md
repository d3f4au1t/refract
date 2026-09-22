# AWS registration service

Refract is served only at `https://18.188.82.113:8443/`. Nginx listens on HTTPS port 8443 and serves `dist/`; `/api/` proxies to the Node service on `127.0.0.1:3001`. The service runs as the dedicated `refract` user. Node 24 is installed from Amazon Linux's repository. Google and Resend are disabled independently until their configuration is present. No placeholder login or test-code endpoint is deployed.

## Public ports

Allow inbound TCP 8443 in the instance security group (`sg-025e8c3d3af06c7c0`). Keep TCP 80 open for `/.well-known/acme-challenge/` so the IP certificate can renew. Every other HTTP request is closed without a response. Nothing listens on port 443, so the IP without `:8443` does not serve the site. Leave SSH access unchanged.

The application origin is `https://18.188.82.113:8443`. Keep this port in browser links, authentication origins and any future OAuth callback URLs. The installer updates only `BETTER_AUTH_URL` and preserves private credentials and registration data.

## Private configuration

The private setup helper avoids putting keys in chat, Git, shell history, or command arguments. Open an interactive SSH session, then run one of:

```sh
sudo python3 /opt/refract/current/deploy/configure-auth.py status
sudo python3 /opt/refract/current/deploy/configure-auth.py resend
sudo python3 /opt/refract/current/deploy/configure-auth.py google
```

Secret prompts are hidden. The helper writes the root-only environment file atomically, preserves the signing secret and database settings, restarts the application, checks its health, and restores the old configuration if startup fails. It does not send email or validate the credentials with Google/Resend; complete a real sign-in after setup. Google setup stays blocked until the site's HTTPS domain is configured. Run the helper's tests with `python3 -m unittest discover -s test -p '*_test.py'`.

Create a [Resend sending key](https://resend.com/api-keys) after [verifying the sender domain](https://resend.com/domains). Create a Google **Web application** OAuth client in [Google Auth Platform](https://console.cloud.google.com/auth/clients), with the callback below and only basic profile/email scopes. If Google is in testing mode, add your test accounts before trying sign-in.

Edit `/etc/refract/refract.env` on the server with `sudoedit`, then run `sudo systemctl restart refract`. This file is root-only and outside the release directory. Never commit it.

- `BETTER_AUTH_URL`: the public HTTPS origin, without a path. Currently the server uses its IP address. Google OAuth needs a domain rather than a public IP.
- `BETTER_AUTH_SECRET`: generated once during installation. Preserve it between deployments.
- `RESEND_API_KEY`: a sending key from your Resend account.
- `RESEND_FROM_EMAIL`: e.g. `Refract <registration@your-verified-domain.example>`. Verify that domain in Resend first. A test sender cannot email arbitrary participants.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: a Google OAuth **Web application**. Authorize `https://YOUR_DOMAIN:8443/api/auth/callback/google`. Local development uses `http://localhost:3001/api/auth/callback/google`.

Point the domain to the server and install its TLS certificate before switching `BETTER_AUTH_URL`. Update Nginx's `server_name`, port configuration, and certificate paths at the same time. The installation script intentionally preserves the server's existing `refract-ip` certificate; update that script when moving to a domain certificate.

## Deploy a committed release

1. Push the release to GitHub and archive the intended commit with `git archive` (do not copy `.env`, local databases or `node_modules`).
2. Extract it to `/opt/refract/releases/FULL_GIT_SHA` on AWS.
3. Run `npm ci --omit=dev --ignore-scripts` inside that release, then make the release files root-owned and readable by the service and Nginx.
4. Run `sudo bash /opt/refract/releases/FULL_GIT_SHA/deploy/install-aws.sh FULL_GIT_SHA https://PUBLIC_HOST:8443`.
5. Check `https://PUBLIC_HOST:8443/api/health` and `/register/`. Test Google and an email you control after adding the real provider credentials.

The installer saves the previous Nginx config, backs up an existing SQLite database before migration, preserves credentials, and tests the local service before switching the website. Existing releases remain available for rollback. Never replace the live database with a development database.

## Operations

- Service: `sudo systemctl status refract`
- Restart: `sudo systemctl restart refract`
- Logs: `sudo journalctl -u refract --since '10 minutes ago'`
- Database: `/var/lib/refract/refract.sqlite` (private, persistent; contains participant data)
- Auth sessions expire after 7 days. Email codes expire after 10 minutes, are hashed at rest, allow 5 attempts, and are single use.
- Email sends have a 60-second per-address cooldown and a maximum of 5 per hour, plus database-backed IP throttling.
- `GET /api/registration/config` returns provider availability, never secrets.
- Registrations are unique per verified user and remain `pending`; creating an account does not confirm an event place.

The browser never receives the Resend API key, Google secret, signing secret, or database files. Nginx replaces forwarded IP headers; the app must stay bound to loopback. Verification emails contain only a code, not a link that can be consumed by an email scanner.

## Backups

Release-time snapshots protect schema updates, but are not an off-server disaster recovery policy. Before accepting real registrations, arrange encrypted off-server backups of `/var/lib/refract` and secure storage of the signing secret. Use a live SQLite backup or `VACUUM INTO` rather than copying only the `.sqlite` file while it is open in WAL mode.
