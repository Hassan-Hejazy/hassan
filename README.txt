BY MELI — FLOW & WE CAN CINEMATIC FIX

Open through a local or hosted web server:
  python3 -m http.server
Then visit the local address shown in the terminal.

FIXED IN THIS VERSION
- Service Scene 05 (Crowd & Guest Operations) repaired:
  - Corrected the broken registration-screen function call.
  - Added three illuminated guest-flow paths.
  - Added animated directional markers and fixed floor arrows.
  - Retained registration desks, turnstiles, barriers and guest movement.
- Portfolio image handling strengthened:
  - All 23 supplied images are included locally.
  - Cards now load their images immediately and confirm successful loading.
  - Automatic fallback is applied if an image cannot be decoded.
  - Keyboard access and the full lightbox remain available.
- WE CAN rebuilt as one focused cinematic sequence:
  1. Dark opening with a large transparent WE CAN cutout.
  2. One signature By Meli image appears inside the lettering.
  3. Scrolling expands the letter portal and reveals the full image.
  4. The final heading, description and calls to action enter over the image.
- No other website sections, navigation, service copy or project structure were changed.

DEPENDENCIES
Three.js r128 is loaded from cdnjs for the real-time 3D scenes. An internet connection is required for WebGL. Local image fallbacks remain available when Three.js or WebGL cannot load.

DEPLOYMENT
Upload the complete folder without changing its internal paths.
