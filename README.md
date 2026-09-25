# Refract

The website and registration app for Refract, a student hackathon at PRISMS.

The frontend is plain HTML, CSS and JavaScript. Registration runs on Express, with Better Auth for sign-in, Resend for verification emails, and SQLite for storage.

This is still a preview. Google, GitHub and email sign-in work on [refracthack.org](https://refracthack.org/register/). Event details still need to be filled in.

## Run locally

Use Node 24, or at least Node 22.13.

```sh
npm ci
cp .env.example .env
```

Generate a secret with `openssl rand -hex 32` and put it in `.env` as `BETTER_AUTH_SECRET`. Then start the server:

```sh
npm run dev
```

Open [localhost:3001](http://localhost:3001). You can work on the event page without email, GitHub or Google credentials; those sign-in buttons stay disabled until configured.

## Where things live

| File | What to edit |
| --- | --- |
| `dist/index.html` | Event information, schedule, sponsorship and FAQ |
| `dist/styles.css`, `dist/polish.css` | Page layout, typography and glass effects |
| `dist/app.js` | Navigation, lighting, timeline scrolling and counters |
| `dist/timeline.css` | Schedule layout |
| `dist/teams.js`, `dist/teams.css` | The 60-person team animation |
| `dist/register/` | Registration forms and their browser code |
| `dist/admin/` | Private organizer dashboard |
| `dist/account/` | Participant account and registration details |
| `dist/assets/` | Logos, artwork and fonts |
| `server/` | Sign-in, email delivery and registration storage |
| `test/` | API and configuration tests |
| `deploy/` | AWS setup and deployment scripts |

The background logo stays fixed while the glass panel scrolls over it. The light dims as its source goes behind the glass. The schedule turns vertical scrolling into horizontal movement, then lets the page continue downward. Both effects live in `dist/app.js`.

## Registration

Registration has its own page at `/register/`. Participants verify their email, enter their name and confirm that they attend PRISMS. Each account gets one pending registration with a reference number. Editing the name keeps the same reference; registering does not automatically approve an event place.

After registering, participants go to `/account/` to see their details, edit their registered name or sign out. Signed-in visitors who have not submitted a form can finish registration from there. Organizer accounts also have a link to the admin dashboard.

GitHub and Google sign-in need OAuth credentials. Email verification needs a Resend key and a verified sender. See [AWS setup](deploy/README.md) for configuration, deployment and backups. Keep credentials in `.env` locally or the private environment file on the server.

## Organizer dashboard

Open `/admin/` and sign in with an authorized organizer account. The first admin to visit sets one shared admin password. Every admin needs that password to unlock the dashboard, even when already signed in. Unlocks last 30 minutes and are specific to the current sign-in session; the Lock button ends access immediately.

- **Accounts:** all signed-in users, verified-email status, linked providers, admin status and registration details. Edit account and registration names, approve/waitlist/decline registrations, grant or revoke admin access, sign out other accounts, or delete an account after typing its email. Admins cannot delete themselves or remove their own access.
- **Registrations:** submitted forms, search, sorting, pagination and CSV export.
- **Traffic:** active browsers in the last five minutes, today's approximate visitors and page views, a 14-day chart, and today's popular pages. Collection starts with this version; there is no historical backfill.
- **Activity:** the 50 most recent admin changes.

Verified email addresses are sign-in identities and cannot be overwritten in the dashboard. Account deletion removes the live account, registration, provider links and sessions; older backups may retain records. It does not ban someone from signing up again.

Admin roles are stored privately in SQLite. `ADMIN_USER_IDS` seeds the initial roles once; later role changes use the dashboard and survive restarts. The shared password is stored only as a salted scrypt hash. See [AWS setup](deploy/README.md#organizer-access) for recovery and backups.

## Before launch

Replace the bracketed placeholders in the homepage and registration page. The funding figures are targets, and the team animation shows example groups.

Run the checks:

```sh
npm run check
npm test
python3 -m unittest discover -s test -p '*_test.py'
```

Then test a real email registration and each social sign-in on the public site. The [prelaunch audit](docs/prelaunch-audit.md) lists what has been tested and what still needs to be done.
