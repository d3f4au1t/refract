# Refract — A PRISMS Student Hackathon

Responsive static event website, with a silver and ice-blue visual identity based on the supplied Refract brand assets. Content follows the September 2026 Refract proposal; approval, schedule, sponsorship, and registration remain explicitly unconfirmed.

Run `npm run dev`, then open http://127.0.0.1:4173. Or serve the `dist` folder using any static host. No build or installation is required. Run `npm run check` to check JavaScript syntax.

## Editing
- `dist/index.html`: public copy, schedule, targets, FAQ, and registration information.
- `dist/styles.css`: base layout, typography, and the fixed logo/glass treatment.
- `dist/polish.css`: floating navigation, editorial styling, illustrations, and motion.
- `dist/timeline.css`: responsive timeline chapters and pinned horizontal layout.
- `dist/app.js`: navigation, mobile menu, accessible registration dialog, and scroll-driven timeline.
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

## Motion and interactions

The transparent navigation stays visible while scrolling. Section entrances use staggered reveals; the project directions have drawn vector illustrations and pointer-responsive highlights, and a five-chapter sample timeline moves horizontally with vertical scrolling before releasing back into the page. Hero text, buttons, the mobile menu, FAQ answers, and the participation dialog have coordinated transitions. The main logo stays fixed. Reduced-motion preferences disable the decorative animations, and content remains visible when JavaScript is unavailable.

## Sample timeline

The timeline in `#experience` is explicitly placeholder content; edit the five `.journey-chapter` items in `dist/index.html` to change it. Native scrolling drives a sticky viewport and horizontal track. Its travel distance is measured from the actual content width, so the last chapter clears the viewport edge before normal downward scrolling resumes. Scrolling upward reverses the sequence. The fixed logo and glass are not transformed.

The timeline includes a skip link, a progress indicator, and a complete vertical list when JavaScript is unavailable, reduced motion is requested, or the viewport is too short for readable pinned content. Layout measurements refresh on resizing and font loading. No wheel or touch events are intercepted.

The scrolling page is clipped at the transparent navigation's bottom edge, so content cannot overlap the menu. The clip follows native root scrolling where supported, with an immediate JavaScript fallback for other browsers and reduced-motion mode. The page remains in normal document flow so the timeline and fixed glass background keep their existing behavior.
