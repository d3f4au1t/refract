# Refract — A PRISMS Student Hackathon

Responsive static event website, with a silver and ice-blue visual identity based on the supplied Refract brand assets. Content follows the September 2026 Refract proposal; approval, schedule, sponsorship, and registration remain explicitly unconfirmed.

Run `npm run dev`, then open http://127.0.0.1:4173. Or serve the `dist` folder using any static host. No build or installation is required. Run `npm run check` to check JavaScript syntax.

## Editing
- `dist/index.html`: public copy, schedule, targets, FAQ, and registration information.
- `dist/styles.css`: responsive layout, animation, typography, and colors.
- `dist/app.js`: navigation, mobile menu, and accessible registration dialog.
- `dist/assets/`: supplied wordmark, light symbol, and simplified mark.

Registration intentionally displays event status and does not collect or submit personal data. Replace this flow with an approved registration destination once available. The private proposal PDF is not included in the public website.

Brand assets are copied unchanged from the user's supplied files:
- `dist/assets/refract-wordmark.png`: luminous silver wordmark in the hero and footer.
- `dist/assets/refract-light.png`: refracted-light symbol in the editorial and closing sections.
- `dist/assets/refract-symbol.png`: simplified mark for header and browser icon.
The design uses deep black, silver, and subtle ice-blue accents, with rounded geometric type and understated light motion. CSS frames the source images without changing their pixels.
