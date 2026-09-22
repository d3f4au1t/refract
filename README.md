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

`dist/assets/refract-background.png` is the latest supplied background wordmark, copied unchanged. A fixed viewport layer keeps it stationary while the hero and lower information scroll. The lower sheet retains a translucent black tint and uses backdrop blur, with a readable fallback when backdrop filtering is unavailable. It does not use scroll-driven image transforms.

The glass uses a lighter black tint and enhanced backdrop brightness so the logo’s white rays remain visible. Smaller raster logos have been removed from the lower sections and footer to keep this surface unobstructed.

As the leading glass edge crosses the central flare, the exposed light dims over a short distance while a soft bloom and luminous rim catch on the edge. A feathered CSS mask preserves only the self-lit “REFR” lettering; the dark “ACT” lettering disappears with the exposed light. The light behind the glass remains visible and blurred. The effect follows scroll position in both directions, restoring the rays and “ACT” as the source emerges.
