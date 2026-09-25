# AWS registration service

Refract is served at [refracthack.org](https://refracthack.org). Nginx serves `dist/` over HTTPS on port 443; `/api/` proxies to the Node service on `127.0.0.1:3001`. The service runs as the dedicated `refract` user. Node 24 is installed from Amazon Linux's repository. Google, GitHub and Resend email sign-in are configured and were tested live on September 24, 2026. Each provider is enabled independently. No placeholder login or test-code endpoint is deployed.

## Public ports

Allow inbound TCP 80 and 443 in the instance security group (`sg-025e8c3d3af06c7c0`). Port 80 serves `/.well-known/acme-challenge/` for certificate renewal and redirects other requests to HTTPS. `www.refracthack.org` redirects to `refracthack.org`, preserving the path and query string. Keep port 8443 open for existing `https://18.188.82.113:8443/` bookmarks, which also redirect to the domain. Leave SSH access unchanged.

The application origin is `https://refracthack.org`. The installer updates only `BETTER_AUTH_URL` and preserves private credentials and registration data. Existing IP-address sessions do not transfer to the domain; participants sign in again.

## DNS and certificates

Namecheap BasicDNS holds an A record for `@` pointing to `18.188.82.113` and a CNAME for `www` pointing to `refracthack.org`. If the server's public IP changes, update the A record. Use an Elastic IP to keep that address stable.

Resend has verified `refracthack.org` for sending. The live sender is `Refract <registration@refracthack.org>`. Namecheap also holds the Resend-generated TXT record at `resend._domainkey`, CNAME `rsend` → `rsend.forge.rmta.net`, CNAME `send` → `send.forge.rmta.net`, and TXT `_dmarc` → `v=DMARC1; p=none;`. The existing root SPF and Namecheap mail-forwarding records were preserved. Use the records shown by Resend if reconfiguring the domain; older guides may show a different return-path setup. Incoming mail through Resend is disabled.

The AWS key has sending-only access restricted to `refracthack.org`. It is stored in the private server environment file. A live verification email was delivered and its code successfully established a session; no event registration was submitted during this test.

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

## Google sign-in

The Google Cloud project is `Refract` (`future-haiku-509618-g2`), with a Web application client named `Refract website`. Its only JavaScript origin is `https://refracthack.org` and its only redirect URI is `https://refracthack.org/api/auth/callback/google`. The audience is External and the publishing status is In production. Declared scopes are OpenID, basic profile and email; no sensitive or restricted scopes are requested.

The public privacy page is at `/privacy/` and is linked from the homepage, registration page, account page and Google consent screen. Google currently displays `refracthack.org` during sign-in; custom branding verification remains separate from the working basic sign-in flow. The live test returned to the existing account with its original registration reference and organizer access, without creating another registration.

Credentials are stored only in the private AWS environment file. Deployment preserves them. If the Google client is replaced, update both values together and repeat the live sign-in check.

## Organizer access

The dashboard is at `/admin/`. On the first deployment of the management dashboard, the existing private `ADMIN_USER_IDS` list is imported once into `admin_roles` in SQLite. Existing admins keep access. After that, grant and remove admin access through the Accounts panel. Editing the environment list does not re-add someone whose access was removed. All routes check the current database role, a verified sign-in session, and a separate admin-password unlock.

The first admin sets one shared password in the dashboard. All admins use that password. It must be 12–128 characters and is stored only as a salted scrypt hash in `admin_password`. `admin_unlocks` records an expiry for each signed-in session, lasting 30 minutes. Five failed password attempts lock that admin's password checks for 15 minutes. The Lock button, session revocation, and removal of admin access invalidate unlocks. Keep the shared password out of Git and share it privately with organizers.

If the shared password is lost, the server owner can reset it. On the server, stop the service, open the private SQLite database with a SQLite client as root, and in one transaction delete the rows in `admin_password`, `admin_unlocks` and `admin_password_attempts`. Restart the service. An existing admin can then set a new shared password. This does not delete roles or registrations. Back up the database before recovery; do not copy its contents into chat or Git.

For emergency role recovery, verify the intended person in the private `user` table and insert their immutable account ID into `admin_roles`. Normal role management must use the dashboard. An admin cannot remove their own access, sign themselves out through account management, or delete their own account.

Accounts includes people who signed in but did not register. Names and registration status are editable; verified email identities are not. Deleting an account removes its registration, provider links, sessions and role from the live database. Older backups remain subject to the backup retention policy. The person can sign up again. Admin actions record account IDs, action names and timestamps; the activity display resolves names only for accounts that still exist.

The submitted-registration list and CSV remain separate from all accounts. CSV output neutralizes spreadsheet formulas. Treat downloaded files as private participant data.

## Website traffic

The first-party `/traffic.js` script runs on home, registration, account and privacy pages. Admin visits are excluded. A daily browser identifier is hashed with the server secret and UTC date. The traffic table stores that hash, a page-view identifier, an allowlisted path and first/last timestamps. A visible tab sends a heartbeat once a minute; heartbeats update activity without creating extra page views. No account identifiers, emails, query strings or raw IP addresses are stored in traffic records. IP-based rate limiting is held briefly in memory.

Reports show approximate browsers, not verified individual people. Collection respects Do Not Track and Global Privacy Control; blocked JavaScript, multiple devices and bots affect counts. Records older than the last 30 UTC calendar days are pruned on startup and during traffic requests/report reads. There is no backfill from Nginx logs. The dashboard shows a 14-day daily chart and active browsers within the last five minutes.

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
