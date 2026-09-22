# AWS registration service

The existing Nginx site serves `dist/`; `/api/` proxies to the Node service on `127.0.0.1:3001`. The service runs as the dedicated `refract` user. Node 24 is installed from Amazon Linux's repository. Google and Resend are disabled independently until their configuration is present. No placeholder login or test-code endpoint is deployed.

## Private configuration

Edit `/etc/refract/refract.env` on the server with `sudoedit`, then run `sudo systemctl restart refract`. This file is root-only and outside the release directory. Never commit it.

- `BETTER_AUTH_URL`: the public HTTPS origin, without a path. Currently the server uses its IP address. Google OAuth needs a domain rather than a public IP.
- `BETTER_AUTH_SECRET`: generated once during installation. Preserve it between deployments.
- `RESEND_API_KEY`: a sending key from your Resend account.
- `RESEND_FROM_EMAIL`: e.g. `Refract <registration@your-verified-domain.example>`. Verify that domain in Resend first. A test sender cannot email arbitrary participants.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: a Google OAuth **Web application**. Authorize `https://YOUR_DOMAIN/api/auth/callback/google`. Local development uses `http://localhost:3001/api/auth/callback/google`.

Point the domain to the server and install its TLS certificate before switching `BETTER_AUTH_URL`. Update Nginx's `server_name`, HTTP redirect, and certificate paths at the same time. The installation script intentionally preserves the server's existing `refract-ip` certificate; update that script when moving to a domain certificate.

## Deploy a committed release

1. Push the release to GitHub and archive the intended commit with `git archive` (do not copy `.env`, local databases or `node_modules`).
2. Extract it to `/opt/refract/releases/FULL_GIT_SHA` on AWS.
3. Run `npm ci --omit=dev --ignore-scripts` inside that release, then make the release files root-owned and readable by the service and Nginx.
4. Run `sudo bash /opt/refract/releases/FULL_GIT_SHA/deploy/install-aws.sh FULL_GIT_SHA https://PUBLIC_HOST`.
5. Check `https://PUBLIC_HOST/api/health` and `/register/`. Test Google and an email you control after adding the real provider credentials.

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
