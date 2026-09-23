# Refract prelaunch audit

**Decision: keep the site in preview. Do not announce registration as open yet.**

Audited September 22–23, 2026. Application reviewed through commit `f6c2526`; expanded server tests are in `5a6f587`. The AWS preview is at <https://18.188.82.113:8443/>. This report covers the current features, not a certification that every possible failure or vulnerability has been eliminated.

The event page and the locally exercised registration flow work. Launch is blocked by provider configuration and unfinished event information. Real email delivery and a complete Google login have **not** been verified.

## Launch blockers

| Priority | Finding | Evidence | Required next step |
| --- | --- | --- | --- |
| Required | Neither sign-in method works on the preview yet. | The public configuration endpoint returns `emailEnabled: false` and `googleEnabled: false`; the server's private status checker confirms missing provider credentials. | Configure Resend with a verified sender. Configure Google with the intended public HTTPS domain and OAuth callback. Keep secrets outside Git. |
| Required for Google | The site uses a public IP rather than a domain. | The app correctly disables Google for a public IP callback. | Choose and configure the public domain and certificate before enabling Google. The current `:8443` URL is deliberate; changing ports requires updating routing and auth origins together. |
| Required | Event information is unfinished. | 26 distinct bracketed fields remain in the homepage, with five repeated in registration. They include dates, venue, capacity, prizes, schedule, contacts, and submission details. | Replace all placeholders with approved information, including metadata and the registration receipt. Recheck line wrapping after the final copy is entered. |
| Required after configuration | Real provider completion is untested. | Local email tests use an isolated sender and temporary data. Google tests verify authorization URL, state, PKCE, and callback restrictions, but do not complete a Google account login. | Send to an organizer-controlled real inbox, verify the code, save/edit the registration, reload, sign out, and sign back in. Complete the equivalent Google flow, including cancellation. |

Before collecting real registrations, confirm an off-server backup and recovery procedure, an owner for service/email failures, and how organizers will review pending registrations. Release-time backups exist on the same instance and a local restore test passes; an external backup service or alerting system was not verified in this audit. There is no organizer dashboard or export UI in the current project.

## Fix made during this audit

**Returning to the same email address no longer strands the participant.** Previously, selecting “Use another email” deleted the pending verification state. Continuing with the unchanged address tried to send another message, hit the cooldown, and offered no way to enter the still-valid code. The form now reopens that code entry without sending another message. Reload also preserves the pending verification state.

The fix is committed and pushed. The logo, glass treatment, light timing, timeline animation, and event copy were not changed by this fix.

## Event-page feature audit

| Feature | Result | Evidence / scope |
| --- | --- | --- |
| Initial page and assets | Pass | No broken images or script errors in the tested browser. Local fonts and current logo assets load. |
| Fixed background logo | Pass | Logo position remains constant while scrolling in both directions. |
| Light occlusion and glass-edge glow | Pass | Sampled before, at, and after source coverage, then reversed. Light transmission and edge glow return to the same values at matching positions. REFR uses its separate letter-face mask; the full logo remains behind the glass. |
| Transparent fixed menu and mask | Pass | Eight rapid scroll jumps produced no header/mask drift or foreground content entering the menu boundary. |
| Clicked bookmark highlighting | Pass | Jumping directly to FAQ kept FAQ active throughout the sampled transition, with no intermediate bookmark flash. |
| Scroll tracking and direct anchors | Pass | Normal section tracking, direct `#support` entry, and offsets below the header checked. All current internal anchors resolve. |
| Mobile menu | Pass | Keyboard opening focuses the first link. Escape closes it and returns focus to the toggle. Section selection closes the menu and transfers focus. |
| Skip-to-content link | Pass | Keyboard activation reaches About; subsequent Tab reaches the replay control in that section. |
| Register links | Pass | All four links lead to `/register/`, a separate document. Registration does not resize or insert a panel into the homepage. |
| Horizontal schedule | Pass | Five chapters, readable arrow destinations, centered progress light, progress state, reverse movement, and transition back to vertical content checked. |
| Timeline layout fallback | Pass | Reduced motion and short-height layouts use the vertical schedule with horizontal controls hidden. No sideways overflow. |
| 60-person animation | Pass | Exactly 60 icons form 16 example groups; each has 2–5 members. Icons fit within the stage and replay returns to the grid then groups again. No group boxes were added. |
| Funding counters | Pass | Both counters animate once, finish as `$10K+` / `$3K+`, and do not restart after leaving and re-entering the section. Accessible labels stay at the final amounts. |
| Project illustrations and reveals | Pass | Existing vector illustrations and content entrances render. Reduced motion leaves content visible and removes running decorative animations. |
| FAQ | Pass | All seven native disclosures open and close without horizontal overflow. |
| Responsive layout | Pass in tested sizes | 320×568, 390×844, 768×1024, 1024×633, 1440×1000, and 1920×1080. A 667×375 short landscape view was also checked during the preceding fix verification. |
| Enlarged text | Pass in tested case | Doubling the root text size at desktop width caused no page overflow or clipped timeline text. This is a text-resize check, not a substitute for every OS/browser zoom mode. |
| Without JavaScript | Pass with stated limit | Event content, 60 icons, registration link, and vertical schedule remain present. Registration explains that JavaScript is needed. |
| Automated accessibility | Pass in tested scans | Desktop, mobile/reduced-motion, and registration receipt scans reported no WCAG A/AA violations. Manual keyboard checks supplemented them. Automated scans cannot establish complete accessibility compliance. |

The old `#prototype` fragment is absent because that experiment was intentionally reverted. No current link points to it. An old bookmarked URL with that fragment still opens the event page, but has no matching section.

## Registration and data-flow audit

Story: a visitor opens registration, verifies an email address through a provider, enters their name and confirms PRISMS eligibility, receives a pending-registration reference, and can later edit or sign out.

| Boundary or case | Result | Evidence / limit |
| --- | --- | --- |
| Provider availability → form | Pass | Unconfigured methods are disabled and described as unavailable. No fake success or account is created. |
| Email → code request | Pass locally | Address normalization, one request on duplicate submission, and cooldown behavior checked. |
| Pending code → reload/backtracking | Pass, bug fixed | Verification survives reload; continuing with the unchanged email restores the existing code screen without a new send. |
| Code entry | Pass locally | Wrong-code messaging and normalization of pasted, spaced, hyphenated, and full-width digits checked. |
| Code expiry / attempt limits | Pass in server tests | Expired codes and exhausted attempts cannot create sessions. |
| Code replay / concurrency | Pass in server tests | Eight simultaneous verification requests create exactly one session. Reuse fails. |
| Resend / throttling | Pass in server tests | Per-address cooldown preserves a valid code when throttled; successful resend replaces it. Five sends per hour per address and 40 sends per minute per IP are enforced. |
| Provider rejection / timeout | Pass in tests | Failed delivery is not reported as a successful send. The sender has a bounded timeout. Actual Resend deliverability is untested. |
| Connection failure after verification | Pass locally | Recovery loads the established session rather than submitting the consumed code again. The prior verification also checked a lost sign-in response and failure before submission. |
| Details validation | Pass | Blank/short/oversized names, control characters, invalid field types, and missing eligibility confirmation are rejected. |
| Name rendering | Pass locally | Markup in a test name is rendered as text and does not execute. |
| Save → receipt | Pass locally | One pending record and one stable reference per verified account. |
| Duplicate saves | Pass in server tests | Eight concurrent submissions keep one record/reference; client-supplied status and reference are ignored. |
| Edit / reload | Pass locally | Name changes persist and preserve the original reference. Receipt returns after reload and fits a 320px viewport. |
| Sign-out / expired session | Pass | Sign-out returns to the start view and protected reads return 401. Expired sessions cannot read or change records. |
| Account isolation | Pass in server tests | One participant cannot read or edit another participant's record. |
| Unverified account | Pass in server tests | Protected reads and writes return 403. |
| Cross-origin writes | Pass in server tests | Untrusted origins cannot consume a code, register, or sign out an existing session. |
| Google initiation | Partial | Authorization state, PKCE, minimal scopes, and callback restrictions pass locally. Real login, consent, account linking, and cancellation require configured credentials and a domain. |
| SQLite recovery | Pass in isolated restore test | A backup restored into a fresh service retains the registration reference, name, pending status, and signed session. No live participant data was used. |

Eligibility currently relies on the participant's checkbox. The app does not verify school enrollment, enforce a registration opening/closing time or capacity limit, or approve an event place. There is no team assignment backend: the 60-person grouping is illustrative. These are current product boundaries, not features this audit silently added.

## Deployment and security checks

| Check | Result |
| --- | --- |
| Service health | Nginx and Refract active; public health endpoint returns success. No service restarts recorded since the inspected release started. |
| Public routing | Homepage and registration return 200. `/register` redirects to `/register/`. Unknown routes return 404. Port 8443 is the intended public HTTPS listener; port 80 is reserved for certificate challenges. |
| Private files | Requests for `.env`, `.git/config`, and the database directory are denied. Server source and `package.json` are not served. |
| TLS | Trusted certificate for the IP address. Inspected validity: September 22–29, 2026. Renewal timer runs every six hours with jitter; last inspected renewal-service execution succeeded. |
| API exposure | Node binds to loopback. Nginx supplies the real client IP instead of trusting a client-supplied forwarding header. |
| Headers / caching | HTML revalidates; API responses are not cached. Content-type sniffing and framing protections are present. HTTPS auth cookies are Secure, HttpOnly, and SameSite=Lax in tests. |
| Request limits | Malformed JSON returns 400; oversized registration bodies return 413. Unused auth routes return 404. |
| Service permissions | Dedicated service user, `NoNewPrivileges`, strict system protection, private state directory. Environment file and current database are mode 0600; the state directory is 0700. |
| Release backups | Same-instance SQLite snapshots are created before releases. Older snapshots inspected were mode 0644 inside the protected 0700 directory; use 0600 if copying them elsewhere. Off-server backup and disaster recovery remain unverified. |
| Dependencies | `npm audit` reported zero known vulnerabilities across the installed dependency graph at audit time. This does not prove the application is vulnerability-free. |
| Repository hygiene | No environment files, private keys, live databases, or installed packages tracked. Targeted credential-pattern scan of current tracked text found no matches. Full Git-history secret scanning was not performed. |
| Host capacity | About 5 GB available on the 8 GB filesystem and about 40 MB service memory at inspection. This is a point-in-time check, not a load-capacity guarantee. |

No destructive recovery, load test, live email send, Google login, production-data edit, or forced certificate renewal was performed. AWS account-level backups, security groups, external uptime alerts, and EBS encryption settings were not inspected.

## Performance

Lighthouse mobile simulation against the AWS homepage:

| Metric | Result |
| --- | --- |
| Performance | 99 / 100 |
| Accessibility | 100 / 100 |
| Best practices | 100 / 100 |
| SEO | 100 / 100 |
| First contentful paint | 1.4 s |
| Largest contentful paint | 1.9 s |
| Total blocking time | 40 ms |
| Cumulative layout shift | 0.001 |
| Total transferred resources | About 1.68 MiB |

These are lab results, not real-user measurements. The SEO score does not mean the placeholder copy is ready or that social sharing is complete.

Non-blocking improvements: reduce the approximately 489 KB SVG favicon payload, provide appropriately sized image variants, set deliberate cache lifetimes for versioned static assets, and consider HTTP/2 on the final host. Keep the approved logo quality and lighting intact. A branded 404 page and final-domain canonical/social metadata would also improve the public release.

## Validation record and remaining coverage

- 21 Node integration/provider tests pass, including seven new tests for concurrency, validation, session boundaries, IP throttling, cross-origin protection, and backup restoration.
- Four private configuration-helper tests pass; JavaScript and deployment-script syntax checks pass.
- Browser feature checks used Chromium 153 on macOS, local isolated registration data, and the AWS preview for deployment/performance checks.
- The first light-position assertion ran during the intentional menu entrance animation. Rechecking after that animation settled confirmed stationary menu/logo geometry and symmetric lighting; no lighting code change was necessary.
- Real iPhone Safari, Firefox, VoiceOver/NVDA, production email delivery, real Google OAuth, and sustained load remain untested. Run a Safari/iPhone smoke check of fixed layers, mask edges, touch scrolling, and registration before the public announcement.

## Final release checklist

1. Fill every bracketed field and approve event copy, prizes, capacity, contacts, and registration dates.
2. Configure the public domain, Resend sender/key, and Google OAuth client/callback. Confirm sender-domain verification and provider account restrictions.
3. Complete real email and Google registration, editing, reload, sign-out, and sign-in on the final public origin.
4. Confirm how organizers will review pending records, who handles participant support, and the backup/restore and outage-notification arrangements.
5. Run the Safari/iPhone and screen-reader smoke checks; repeat layout checks after final content changes.
6. Run `npm run check`, `npm test`, and the Python configuration tests against the final commit. Deploy that commit, verify public health and static asset versions, then announce registration.
