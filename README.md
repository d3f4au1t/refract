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
- `dist/assets/refract-wordmark.png`: earlier supplied wordmark retained as a source asset.
- `dist/assets/refract-light.png`: earlier supplied symbol retained as a source asset.
- `dist/assets/refract-symbol.png`: simplified mark for header and browser icon.
The design uses deep black, silver, and subtle ice-blue accents, with rounded geometric type and a stationary light-filled background. CSS frames the source images without changing their pixels.

## Fixed background and scrolling glass

`dist/assets/refract-background.png` is the latest supplied background wordmark, copied unchanged. A fixed viewport layer keeps it stationary while the hero and lower information scroll. The lower sheet has a dark tint over a blurred, stationary copy of the full logo and light. Its rounded clipping surface moves with the content in the browser, so there is no separate mask edge to lag behind scrolling. It does not use scroll-driven image transforms.

The glass uses a deeper black tint and restrained brightness so the full logo and rays remain visible with softer glare. An opaque backing follows the rounded panel to prevent the exposed background leaking through its edge during scrolling. Smaller raster logos have been removed from the lower sections and footer to keep this surface unobstructed.

As the leading glass edge crosses the central flare, the exposed light holds near full brightness until contact, then follows a steep optical falloff. The edge bloom builds over a longer approach and settles more quickly after the source is covered. A feathered vector mask follows the rounded outer curve of the second “R”, preserving the self-lit “REFR” lettering outside the glass without a rectangular glow cutoff; the dark “ACT” lettering disappears with the exposed light. The complete logo, including the rays and “ACT”, remains visible and blurred through the glass at reduced intensity. The effect follows scroll position in both directions, restoring the rays and “ACT” as the source emerges.
