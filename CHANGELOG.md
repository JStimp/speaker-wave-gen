# Changelog

## Unreleased

### Static Prototype Rebuild

- Rebuilt the active prototype as a dependency-free static browser app.
- Removed Node/npm/Vite/Rollup/Electron from the normal launch path.
- Added vendored Three.js browser files and a local-file launcher.
- Added continuous four-wall wave relief with seam-matched front/side/back distance math.
- Added side-panel controls for cabinet dimensions, wall limits, drivers, point sources, relief settings, preview resolution, and overlays.
- Replaced the mixed flat-bottom treatment with fixed, fully planar top and bottom cap panels for simpler CNC workholding and assembly.
- Added preview helpers for XYZ origin, outline box, floor grid, front-facing reset view, dimension guides, and relief analysis planes.
- Refined CAD preview labels with a separate floor origin marker, offset XYZ direction triad, slim dimension text, and viewport-clamped hover-only tooltips for control text.
- Changed coordinates to X width, Y depth, Z height with the origin at floor center and bottom on `Z=0`.
- Added inch/mm unit selection with inches as the default.
- Added focused source editing with selectable source chips, click-to-select preview markers, duplicate/copy/paste source actions, and a floating overlay editor.
- Improved wave height visualization with computed preview normals and contrast color modes.
- Added independent export quality so outputs can be denser than preview.
- Raised preview/detail presets and updated the starter cabinet/source settings for a stronger default wave pattern.
- Set Smooth surface STEP as the default browser STEP export and kept faceted solid STEP as a fallback.
- Limited corner blending to the four vertical wall corners and faded it out before the planar cap seams.
- Added JSON, OBJ, STL, Smooth surface STEP, faceted fallback STEP, and PNG browser exports.
- Added a Docker-only CadQuery/OCP solid STEP exporter with a drag/drop Windows launcher for SolidWorks outer-block solids.
- Kept the Docker solid exporter compatible with normal saved `.wavecad.json` projects without a redundant browser output button.
- Added DFM panel exports for six flat-workholding panel solids, including Smooth STEP plus OBJ/STL debug downloads.
- Removed DFM interference with flat-cap butt-joint sizing: full-size top/bottom caps own their perimeter joints, and all four walls fit between the cap inner faces.
- Restored top-panel relief inside an adjustable flat perimeter with a separate smooth blend width; the bottom remains completely planar.
- Changed top STEP output to one spline relief face with a mathematically flat border while retaining five analytic boundary/underside planes.
- Added twelve-joint ownership, overlap, and mating-plane geometry checks.
- Added assembled, transparent panel-split, and exploded panel preview modes with clickable panel property overlays.
- Added per-panel export selection and separate labeled STEP/OBJ/STL files written into a project output folder when the browser supports directory access.
- Changed DFM STEP flat undersides and boundary faces to analytic STEP planes for stronger SolidWorks face recognition.
- Consolidated project load/save controls and moved assembly/DFM export actions into one streamlined Output section.
- Reworked the app into a console-style CAD interface with monospace typography and compact engineering status colors.
- Added contextual File, Build, Driver Source Config, Panels, and Export tool tabs with active fill states and a fully collapsible right dock.
- Moved display overlays, live deviation statistics, and isometric reset into a bottom-left View Tools drawer.
- Added center-anchored and SolidWorks-style cursor-anchored wheel zoom modes.
- Added independent show/hide controls for all six DFM panels in Panel Split and Exploded views.
- Made source and exploded-panel viewport picks automatically open their matching tool context.
- Added continuous viewer resize tracking so opening or closing the tool dock cannot leave a stale or blank Three.js canvas.
- Added browser smoke test page and dependency-free solid-exporter geometry tests.
- Reduced CI to static checks only.

### Retired Prototype Tracks

- Removed the Electron/React/Vite desktop shell from the active path.
- Removed automatic Windows packaged-app workflows during early development.
- Removed the Python/Docker STEP exporter implementation from normal launch; STEP is now a documented future tool.
- Retired portable Node/npm launcher repair logic because the prototype no longer needs package installation.

## 0.1.0 - 2026-05-28

- Established the V2 repository structure on `main` and `experimental`.
- Added a continuous cuboid shell preview mesh with driver-based wave sources.
- Added seam-continuity tests for front-to-side wave relief.
- Added exporter fallback outputs for preview mesh JSON, OBJ, STL, and separated panel meshes.
- Added an OpenCascade/OCP STEP export path for Docker/WSL Linux environments.
