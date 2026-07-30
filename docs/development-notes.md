# Development Notes

This file tracks the practical work being done in the repo so the project has a readable handoff trail beyond commit messages.

## Current Direction

- Build a static browser prototype for configuring a rectangular speaker enclosure with continuous 3D wave-interference relief.
- Treat the cabinet as a full 3D shell first, then derive routable DFM panels from that shared surface so corner boundaries match.
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
- Added first-pass DFM panel exports: six flat-workholding panel solids with no more than two routed curved edges per panel, plus Smooth STEP, OBJ, and STL downloads.
- Changed DFM blank sizing from six full-face overlapping slabs to flush butt-joint solids. Each square non-owning edge is inset by one wall thickness, while routed owners retain the full outside extent.
- Added a twelve-edge DFM joint report that verifies one owner per cabinet edge, zero modeled corner overlap, and matching mating planes.
- Added transparent panel-split and exploded panel visualization modes. Exploded panels are selectable and open a focused DFM properties overlay while source markers stay hidden.
- Added DFM panel inclusion controls and separate labeled STEP/OBJ/STL files for the selected faces.
- Changed flat DFM STEP boundaries to explicit analytic `PLANE` surfaces so SolidWorks can recognize them as planar faces.
- Grouped Save/Load under Project and consolidated all assembled and panel outputs in the Output section.
- Reorganized the right controls into contextual File, Build, Driver Source Config, Panels, and Export tool tabs, with a close control that returns the full width to the viewport.
- Changed the UI to a compact console/computer-science visual system using local monospace fonts and restrained phosphor, amber, cyan, and CAD axis colors.
- Moved view overlays, analysis readouts, and reset view into a bottom-left popup that remains available when the right tool dock is closed.
- Added center and cursor wheel-zoom anchors. Cursor mode zooms around the point under the pointer on the orbit-target plane.
- Added independent six-panel visibility state and contextual sidebar switching when sources or exploded panels are selected.
- Added a viewer `ResizeObserver` so Three.js follows the animated sidebar width without stale framing or a blank canvas.
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
- Browser project files use normal upload/download controls. Chromium directory access is used for grouped separate DFM files, with individual downloads as the compatibility fallback.
- OBJ/STL are mesh exports, not editable CAD surfaces.
- Browser STEP defaults to the Smooth surface BREP path. Smooth reliable solid STEP remains the overall export goal; the Docker exporter is the separate CAD-kernel path toward stronger validation.
- DFM panel STEP is a browser-generated BREP prototype with one spline top and five analytic planar faces per panel, not a fully validated CAD-kernel sew.
- DFM panel outputs use zero-clearance butt joints and do not yet include rabbets, screw holes, driver cutouts, glue gaps, machining tolerances, or internal clearances.
- The Docker exporter currently targets one outer solid block; hollow shells, cutouts, and CAD-kernel separated panels remain future work.

## Verification Run By Codex

- Static smoke test page was added for browser-side checks.
- Browser checks cover model/panel-split/exploded mode switching, panel selection overlays, export selection, and console errors.
- Browser checks cover tool-tab switching, full-width dock collapse/reopen, contextual source/panel tabs, panel visibility, view drawer layout, and both wheel-zoom origins.
- DFM checks confirm six panel solids, one owner on each of twelve cabinet edges, zero corner-volume overlap, matched mating planes, five analytic planes per panel, flat undersides, and one solid in each individual panel file.
- Old npm/Electron/Python checks are intentionally removed from the active prototype path.
