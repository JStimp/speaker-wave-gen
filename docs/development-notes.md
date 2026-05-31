# Development Notes

This file tracks the practical work being done in the repo so the project has a readable handoff trail beyond commit messages.

## Current Direction

- Build a static browser prototype for configuring a rectangular speaker enclosure with continuous 3D wave-interference relief.
- Treat the cabinet as a full 3D shell first, then derive routable panels later from that shared surface so corner boundaries match.
- Keep preview launch independent of OpenCascade/OCP, Docker, Python, Node, npm, Vite, Rollup, and Electron.
- Treat smooth, reliable SolidWorks solid STEP as the main CAD export goal. Smooth surface browser STEP is the default prototype output; faceted browser STEP is retained only as a compatibility fallback.
- Use Docker only for the separate analytic/CAD-kernel STEP experiments.

## Implemented So Far

- Created a static browser app in `app/`.
- Vendored browser-global Three.js and OrbitControls files.
- Added browser geometry math for cuboid shell sampling, continuous wave relief, driver overlays, source overlays, and seam overlays.
- Added relief limiting from wall thickness and minimum remaining wall settings.
- Added side-panel controls to add/remove drivers and point sources.
- Added a flat-bottom option that keeps the underside contact patch planar for real-world placement and rounds the lower perimeter inward and upward.
- Added preview aids: outline box, XYZ origin axes, floor grid toggle, front-facing reset view, dimension guide overlays, and relief analysis planes tied to live deviation stats.
- Split the origin visualization into a small floor marker and separate offset XYZ direction triad, and changed in-scene labels to slimmer CAD-style text.
- Added hover-only tooltips throughout the UI, with viewport-clamped placement and STEP-specific notes for smooth surface quality controls.
- Changed the coordinate system to X width, Y depth, Z height with the origin at the floor center.
- Added inches as the default unit plus inch/mm conversion in the project controls.
- Added focused source editing with selectable source chips, preview source marker selection, duplicate/copy/paste source actions, and a floating overlay editor that works alongside the sidebar editor.
- Improved wave relief visualization with computed normals and higher-contrast color modes.
- Added independent export quality so OBJ/STL/STEP can be generated at higher resolution than preview.
- Raised default preview/detail presets and tuned the starter cabinet, driver positions, source amplitudes, wavelengths, corner wrap, and relief depth for a better-looking first render.
- Changed the default browser STEP mode to Smooth surface STEP and kept faceted solid STEP as an import troubleshooting fallback.
- Added corner wrap geometry for smoother wrapped edges while preserving a flat underside contact patch.
- Added browser JSON, OBJ, STL, Smooth surface STEP, faceted fallback STEP, and PNG exports.
- Added a Docker-only CadQuery/OCP solid STEP exporter for the first outer-block SolidWorks import path.
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
- Browser STEP defaults to the Smooth surface BREP path. Smooth reliable solid STEP remains the overall export goal; the Docker exporter is the separate CAD-kernel path toward stronger validation.
- The Docker exporter currently targets one outer solid block; hollow shells, cutouts, and separated CAD panels remain future work.

## Verification Run By Codex

- Static smoke test page was added for browser-side checks.
- Old npm/Electron/Python checks are intentionally removed from the active prototype path.
