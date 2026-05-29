# Development Notes

This file tracks the practical work being done in the repo so the project has a readable handoff trail beyond commit messages.

## Current Direction

- Build a static browser prototype for configuring a rectangular speaker enclosure with continuous 3D wave-interference relief.
- Treat the cabinet as a full 3D shell first, then derive routable panels later from that shared surface so corner boundaries match.
- Keep preview launch independent of OpenCascade/OCP, Docker, Python, Node, npm, Vite, Rollup, and Electron.
- Use Docker later only for STEP export.

## Implemented So Far

- Created a static browser app in `app/`.
- Vendored browser-global Three.js and OrbitControls files.
- Added browser geometry math for cuboid shell sampling, continuous wave relief, driver overlays, source overlays, and seam overlays.
- Added relief limiting from wall thickness and minimum remaining wall settings.
- Added side-panel controls to add/remove drivers and point sources.
- Added a flat-bottom option that keeps the bottom face planar for real-world placement.
- Added preview aids: outline box, XYZ origin axes, floor grid toggle, reset view, and dimension guide overlays tied to cabinet controls.
- Changed the coordinate system to X width, Y depth, Z height with the origin at the floor center.
- Added inches as the default unit plus inch/mm conversion in the project controls.
- Added focused source editing with selectable source chips and preview source marker selection.
- Improved wave relief visualization with computed normals and higher-contrast color modes.
- Added independent export quality so OBJ/STL/STEP can be generated at higher resolution than preview.
- Added browser JSON, OBJ, STL, experimental faceted STEP, and PNG exports.
- Added an example `default-speaker.wavecad.json` project.
- Added a browser smoke test page.
- Reduced CI to static file and dependency-free checks.

## Launcher Behavior

- `Launch-WaveGen3D.bat` opens `app/index.html`.
- There is no install or setup step.
- The app can also be opened by double-clicking `app/index.html`.

## Packaging Direction

- Current packaging is just the repo folder itself.
- Do not add npm/Electron packaging until the static prototype proves the geometry and workflow.
- If a packaged desktop app is needed later, build it as a separate track rather than as the default launch path.

## Known Limits

- Rectangular cabinet only.
- Browser file dialogs use upload/download controls.
- OBJ/STL are mesh exports, not editable CAD surfaces.
- Built-in STEP is faceted mesh STEP. Analytic STEP surfaces and separated CAD panels remain future work.

## Verification Run By Codex

- Static smoke test page was added for browser-side checks.
- Old npm/Electron/Python checks are intentionally removed from the active prototype path.
