# Changelog

## Unreleased

### Static Prototype Rebuild

- Rebuilt the active prototype as a dependency-free static browser app.
- Removed Node/npm/Vite/Rollup/Electron from the normal launch path.
- Added vendored Three.js browser files and a local-file launcher.
- Added continuous six-face cuboid wave relief with seam-matched front/side/top/bottom distance math.
- Added side-panel controls for cabinet dimensions, wall limits, drivers, point sources, relief settings, preview resolution, and overlays.
- Added JSON, OBJ, STL, and PNG browser exports.
- Added browser smoke test page.
- Documented STEP as a separate future Docker exporter.
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
