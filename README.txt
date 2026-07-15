BY MELI — Final Three-Section Camera & Scroll Rework

This build preserves the current website and rebuilds the three requested experiences:

1. Booth Manufacturing
- Bounding-sphere camera fitting for complete booth visibility at every aspect ratio
- Time-based scroll damping for consistent motion at 60 Hz and 120 Hz
- Mobile-safe render density, shadow quality and viewport resizing
- Compact information panel and animated scroll-down indicator

2. Connected 3D Production Route
- Continuous camera path instead of abrupt stage jumps
- Responsive full-stage fitting on portrait phones, tablets and desktop screens
- Device-fitted final overview of the complete connected route
- Active-scene rendering, reduced mobile GPU load and off-screen resource cleanup
- Smooth exit transition and animated scroll-down indicator

3. WE CAN
- Image-only full-screen section with no WebGL model
- Full-viewport background retained throughout the scroll sequence
- Responsive WE CAN word treatment on mobile and desktop
- Time-based word expansion, image movement and final content reveal

Open index.html through a local web server or deploy the full folder to GitHub Pages.
