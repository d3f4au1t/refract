# Refract — A PRISMS Student Hackathon

Responsive static event website, with a silver and ice-blue visual identity based on the supplied Refract brand assets. Content follows the September 2026 Refract proposal; approval, schedule, sponsorship, and registration remain explicitly unconfirmed.

Run `npm run dev`, then open http://127.0.0.1:4173. Or serve the `dist` folder using any static host. No build or installation is required. Run `npm run check` to check JavaScript syntax.

## Editing
- `dist/index.html`: public copy, schedule, targets, FAQ, and registration information.
- `dist/styles.css`: base layout, typography, and the fixed logo/glass treatment.
- `dist/polish.css`: floating navigation, editorial styling, illustrations, and motion.
- `dist/timeline.css`: responsive timeline chapters and pinned horizontal layout.
- `dist/app.js`: navigation, mobile menu, accessible registration dialog, and scroll-driven timeline.
- `dist/teams.css` and `dist/teams.js`: the 60-person animation and replay, with no boxes around the teams.
- `dist/assets/`: supplied wordmark, light symbol, and simplified mark.
- `dist/assets/fonts/`: locally served variable fonts and their OFL licenses.

Registration intentionally displays event status and does not collect or submit personal data. Replace this flow with an approved registration destination once available. The private proposal PDF is not included in the public website.

Original brand assets are retained from the user's supplied files:
- `dist/assets/refract-wordmark.png`: earlier supplied wordmark retained as a source asset.
- `dist/assets/refract-light.png`: earlier supplied symbol retained as a source asset.
- `dist/assets/refract-symbol.png`: simplified mark for header and browser icon.
The design uses deep black, silver, and subtle ice-blue accents, with rounded geometric type and a stationary light-filled background. The active backdrop is the AI-enhanced `refract-background-ai.png`; the original is retained alongside it.

## Fixed background and scrolling glass

`dist/assets/refract-background.png` is the latest supplied background wordmark, copied unchanged. A fixed viewport layer keeps the active artwork stationary. The opening headline, description and registration controls sit inside the same scrolling glass panel as the lower information. Its permanent top border is transparent; the existing light-source calculation illuminates the edge only near the flare. The lower sheet has a dark tint over a blurred, stationary copy of the full logo and light. Its rounded clipping surface moves with the content in the browser, so there is no separate mask edge to lag behind scrolling. It does not use scroll-driven image transforms.

The glass uses a deeper black tint and restrained brightness so the full logo and rays remain visible with softer glare. An opaque backing follows the rounded panel to prevent the exposed background leaking through its edge during scrolling. Smaller raster logos have been removed from the lower sections and footer to keep this surface unobstructed.

As the leading glass edge crosses the central flare, the exposed light holds near full brightness until contact, then follows a steep optical falloff. The edge bloom builds over a longer approach and settles more quickly after the source is covered. A feathered vector mask follows the rounded outer curve of the second “R”, preserving the self-lit “REFR” lettering outside the glass without a rectangular glow cutoff; the dark “ACT” lettering disappears with the exposed light. The complete logo, including the rays and “ACT”, remains visible and blurred through the glass at reduced intensity. The effect follows scroll position in both directions, restoring the rays and “ACT” as the source emerges.

## Motion and interactions

The transparent navigation stays visible while scrolling. Section entrances use staggered reveals; the project directions have drawn vector illustrations and pointer-responsive highlights, and a five-chapter sample timeline moves horizontally with vertical scrolling before releasing back into the page. Hero text, buttons, the mobile menu, FAQ answers, and the participation dialog have coordinated transitions. The main logo stays fixed. Reduced-motion preferences disable the decorative animations, and content remains visible when JavaScript is unavailable.

## Sample timeline

The timeline in `#experience` is explicitly placeholder content; edit the five `.journey-chapter` items in `dist/index.html` to change it. Native scrolling drives one sticky panorama containing the opening title and all five chapters. The title moves off to the left with the chapters, following the full-section horizontal movement on Trae’s site. Its travel distance is measured from the actual content width, so the last chapter clears the viewport edge before normal downward scrolling resumes. Scrolling upward reverses the sequence. The fixed logo and glass are not transformed.

The timeline includes a skip link, a progress indicator, and a complete vertical list when JavaScript is unavailable, reduced motion is requested, or the viewport is too short for readable pinned content. Compact desktop windows (including 633px tall) keep the horizontal experience, with a more compact composition. Layout measurements refresh on resizing and font loading. No wheel or touch events are intercepted.

Previous and next controls move to the actual chapter positions using native scrolling. The highlighted chapter follows the card nearest the center of the screen. At the end, normal downward scrolling continues to sponsorship. Reduced-motion and vertical layouts hide the horizontal controls.

A fixed copy of the background, clipped to the menu height, covers scrolling content behind the transparent navigation. The mask never follows scroll events. The page remains in normal document flow so the timeline and fixed glass background keep their existing behavior.

Navigation links highlight their destination immediately on activation. Intermediate sections do not change the highlight during a bookmark's smooth scroll. Position-based tracking resumes when scrolling continues, including wheel, touch, and keyboard interruptions. The browser's native hash navigation and history remain intact.

The mobile menu includes registration information. Keyboard activation focuses the first link; Escape closes the menu and restores focus to its trigger. Selecting a section transfers focus to that section. The registration dialog returns focus to its opener, or to the menu trigger when opened on mobile. Registration links lead to the FAQ when JavaScript is unavailable.

Funding goals count up from zero once per page load when each amount first enters the viewport. The full dollar value appears briefly before the compact $10K+ / $3K+ label returns. Leaving and re-entering the section does not restart the counters. Reduced-motion users and assistive technology receive the final amounts directly.

## Public copy

Use plain descriptions of what students would do, concrete project examples and direct labels for navigation and registration. The proposal remains unapproved; keep the draft schedule and funding targets explicit without repeating long approval notices in every section. The opening light/glass interaction, team animation, funding counters and horizontal schedule are independent of these copy edits.
