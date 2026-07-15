BY MELI — Final Device-Specific 3D and Responsive Correction

This version preserves the original workflow design and website structure.

Final corrections included:
- Manufacturing camera now uses real aspect-ratio and field-of-view fitting instead of fixed mobile zoom values.
- The full manufacturing structure remains inside the frame on narrow portrait phones, tablets and landscape screens.
- Connected 3D service models use the same aspect-ratio fitting, with a wider final overview camera for the complete route.
- Mobile 3D overlays are smaller, scroll-safe and positioned to preserve the visible model area.
- The We Can SVG automatically changes to a portrait coordinate system on narrow devices, preventing cropped wording.
- We Can image scaling, final message panel, action layout and scroll distance were refined for phone and tablet screens.
- Mobile scroll overscroll behavior was restored for a more natural touch experience.
- Rendering density was increased adaptively, with improved mobile shadow resolution.
- The original six-card workflow layout remains unchanged; only its responsive behavior is corrected.
- Arabic diacritics remain removed.
- Three.js remains bundled locally for reliable GitHub Pages or client hosting.

Validated:
- JavaScript syntax
- CSS parsing
- Local file references
- Arabic diacritic removal

Open index.html through a local web server or publish the complete folder through GitHub Pages.
