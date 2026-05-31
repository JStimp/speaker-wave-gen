# Changelog

## Unreleased

### Static Prototype Rebuild

- Rebuilt the active prototype as a dependency-free static browser app.
- Removed Node/npm/Vite/Rollup/Electron from the normal launch path.
- Added vendored Three.js browser files and a local-file launcher.
- Added continuous six-face cuboid wave relief with seam-matched front/side/top/bottom distance math.
- Added side-panel controls for cabinet dimensions, wall limits, drivers, point sources, relief settings, preview resolution, and overlays.
- Added flat-bottom geometry mode with a planar underside contact patch and a lower perimeter that rounds inward and upward instead of flaring outward.
- Added preview helpers for XYZ origin, outline box, floor grid, front-facing reset view, dimension guides, and relief analysis planes.
- Changed coordinates to X width, Y depth, Z height with the origin at floor center and bottom on `Z=0`.
- Added inch/mm unit selection with inches as the default.
- Added focused source editing with selectable source chips and click-to-select preview markers.
- Improved wave height visualization with computed preview normals and contrast color modes.
- Added independent export quality so outputs can be denser than preview.
- Added corner wrap geometry for smoother wave continuity around softened cabinet edges.
- Added JSON, OBJ, STL, experimental spline STEP, faceted STEP fallback, and PNG browser exports.
- Added a Docker-only CadQuery/OCP solid STEP exporter with a drag/drop Windows launcher for SolidWorks outer-block solids.
- Added an automatic Docker exporter fallback that writes a watertight faceted STEP solid when smooth spline surface sewing reports free edges.
- Added a Solid STEP Project browser export that saves the `.wavecad.json` intended for the Docker solid exporter.
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
