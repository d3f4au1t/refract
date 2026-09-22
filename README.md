# Refract — A PRISMS Student Hackathon

Responsive static event website, with a monochrome visual identity based on the supplied Refract logo. Content follows the September 2026 Refract proposal; approval, schedule, sponsorship, and registration remain explicitly unconfirmed.

Run `npm run dev`, then open http://127.0.0.1:4173. Or serve the `dist` folder using any static host. No build or installation is required. Run `npm run check` to check JavaScript syntax.

## Editing
- `dist/index.html`: public copy, schedule, targets, FAQ, and registration information.
- `dist/styles.css`: responsive layout, animation, typography, and colors.
- `dist/app.js`: navigation, mobile menu, and accessible registration dialog.
- `dist/assets/refract-logo.png`: supplied original logo.

Registration intentionally displays event status and does not collect or submit personal data. Replace this flow with an approved registration destination once available. The private proposal PDF is not included in the public website.

Brand asset: the user's supplied Refract / PRISMS Hackathon logo, copied unchanged into `dist/assets/refract-logo.png`. CSS frames its existing black margins for header, hero, and footer presentation without altering the image. The monochrome palette, light-ray dividers, rounded geometry, and typography follow this logo.
