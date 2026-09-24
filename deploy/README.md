# AWS registration service

Refract is served at [refracthack.org](https://refracthack.org). Nginx serves `dist/` over HTTPS on port 443; `/api/` proxies to the Node service on `127.0.0.1:3001`. The service runs as the dedicated `refract` user. Node 24 is installed from Amazon Linux's repository. GitHub sign-in is configured and was tested live on September 24, 2026. Google and Resend remain disabled until their credentials are added. Each provider is enabled independently. No placeholder login or test-code endpoint is deployed.

## Public ports

Allow inbound TCP 80 and 443 in the instance security group (`sg-025e8c3d3af06c7c0`). Port 80 serves `/.well-known/acme-challenge/` for certificate renewal and redirects other requests to HTTPS. `www.refracthack.org` redirects to `refracthack.org`, preserving the path and query string. Keep port 8443 open for existing `https://18.188.82.113:8443/` bookmarks, which also redirect to the domain. Leave SSH access unchanged.

The application origin is `https://refracthack.org`. The installer updates only `BETTER_AUTH_URL` and preserves private credentials and registration data. Existing IP-address sessions do not transfer to the domain; participants sign in again.

## DNS and certificates

Namecheap BasicDNS holds an A record for `@` pointing to `18.188.82.113` and a CNAME for `www` pointing to `refracthack.org`. If the server's public IP changes, update the A record. Use an Elastic IP to keep that address stable.

The domain certificate covers both `refracthack.org` and `www.refracthack.org`. It lives under `/etc/letsencrypt/live/refracthack.org/`; the legacy IP certificate remains under `/etc/letsencrypt/live/refract-ip/`. Private keys stay on the server.

The existing `refract-certbot-renew.timer` renews both certificates with `/opt/refract-certbot/bin/certbot`. Its deploy hook validates and reloads Nginx after renewal. To issue the domain certificate on this host:

```sh
sudo /opt/refract-certbot/bin/certbot certonly --non-interactive --webroot \
  -w /var/lib/refract-acme --cert-name refracthack.org \
  -d refracthack.org -d www.refracthack.org --keep-until-expiring
```

Test renewal with `sudo /opt/refract-certbot/bin/certbot renew --cert-name refracthack.org --dry-run`.

## Private configuration

The private setup helper avoids putting keys in chat, Git, shell history, or command arguments. Open an interactive SSH session, then run one of:

```sh
sudo python3 /opt/refract/current/deploy/configure-auth.py status
sudo python3 /opt/refract/current/deploy/configure-auth.py resend
sudo python3 /opt/refract/current/deploy/configure-auth.py google
sudo python3 /opt/refract/current/deploy/configure-auth.py github
```

Secret prompts are hidden. The helper writes the root-only environment file atomically, preserves the signing secret and database settings, restarts the application, checks its health, and restores the old configuration if startup fails. It does not send email or validate the credentials with GitHub/Google/Resend; complete a real sign-in after setup. Social sign-in setup stays blocked until the site's HTTPS domain is configured. Run the helper's tests with `python3 -m unittest discover -s test -p '*_test.py'`.

Create a [Resend sending key](https://resend.com/api-keys) after [verifying the sender domain](https://resend.com/domains). Create a Google **Web application** OAuth client in [Google Auth Platform](https://console.cloud.google.com/auth/clients), with the callback below and only basic profile/email scopes. If Google is in testing mode, add your test accounts before trying sign-in.

Create a [GitHub OAuth app](https://github.com/settings/applications/new) named **Refract**, with homepage `https://refracthack.org` and callback `https://refracthack.org/api/auth/callback/github`. Leave device authorization disabled. The app requests only `read:user` and `user:email`; repository access is not needed. Generate a client secret and enter it through the private setup helper. Use a separate OAuth app with `http://localhost:3001/api/auth/callback/github` for local development.

Edit `/etc/refract/refract.env` on the server with `sudoedit`, then run `sudo systemctl restart refract`. This file is root-only and outside the release directory. Never commit it.

- `BETTER_AUTH_URL`: `https://refracthack.org`, without a trailing slash or port.
- `BETTER_AUTH_SECRET`: generated once during installation. Preserve it between deployments.
- `RESEND_API_KEY`: a sending key from your Resend account.
- `RESEND_FROM_EMAIL`: `Refract <registration@refracthack.org>` after verifying `refracthack.org` in Resend. Add the DNS records Resend supplies in Namecheap. A test sender cannot email arbitrary participants.
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`: the GitHub OAuth app credentials. GitHub must provide a verified email address; private primary emails are supported.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: a Google OAuth **Web application**. Set the JavaScript origin to `https://refracthack.org` and authorize `https://refracthack.org/api/auth/callback/google` as the redirect URI. Local development uses `http://localhost:3001/api/auth/callback/google`.

The domain and HTTPS connection do not activate GitHub, Google or Resend by themselves. Configure those accounts and their credentials separately, then test each sign-in method.

## Deploy a committed release

1. Push the release to GitHub and archive the intended commit with `git archive` (do not copy `.env`, local databases or `node_modules`).
2. Extract it to `/opt/refract/releases/FULL_GIT_SHA` on AWS.
3. Run `npm ci --omit=dev --ignore-scripts` inside that release, then make the release files root-owned and readable by the service and Nginx.
4. Run `sudo bash /opt/refract/releases/FULL_GIT_SHA/deploy/install-aws.sh FULL_GIT_SHA https://refracthack.org`.
5. Check `https://refracthack.org/api/health` and `/register/`. Check HTTP, `www`, and the old IP address redirect to the domain. Test GitHub, Google and an email you control after adding the real provider credentials.

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

The browser never receives the Resend API key, GitHub or Google secret, signing secret, or database files. Nginx replaces forwarded IP headers; the app must stay bound to loopback. Verification emails contain only a code, not a link that can be consumed by an email scanner.

## Backups

Release-time snapshots protect schema updates, but are not an off-server disaster recovery policy. Before accepting real registrations, arrange encrypted off-server backups of `/var/lib/refract` and secure storage of the signing secret. Use a live SQLite backup or `VACUUM INTO` rather than copying only the `.sqlite` file while it is open in WAL mode.
