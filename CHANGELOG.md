# Changelog

## Unreleased

- Added Windows packaged-app build support through `electron-builder` so end users can run a portable executable without installing Node.js.
- Added a GitHub Actions workflow that uploads a packaged Windows portable executable.
- Updated packaged-app resource resolution so exporter scripts can be found from an Electron build.
- Changed Electron user data/cache to live beside the app for portable testing instead of relying on global AppData locations.
- Added a portable Windows bundle workflow so WaveGen3D can be distributed as a zip with portable Node.js and dependencies included.
- Added `Launch-WaveGen3D.bat` and Windows launcher scripts for double-click startup.
- Improved the launcher to download portable Node.js when Node is missing.
- Improved the launcher to detect and repair incomplete Electron installs.
- Improved Electron repair to run npm lifecycle scripts and Electron's binary installer directly when needed.
- Pinned source-mode launcher setup to portable Node.js 20 and stopped using global Node 24 by default.
- Added browser preview fallback when Electron's binary install is blocked in source mode.
- Added CI for core tests, exporter tests, desktop build, Docker exporter build, and portable Windows bundle creation.
- Added the V2 app scaffold: Electron, React, Three.js viewport, shared geometry core, Python exporter, docs, and sample project file.
- Replaced the v1 2D surface prototype files with the new 3D cabinet-shell architecture.

## 0.1.0 - 2026-05-28

- Established the V2 repository structure on `main` and `experimental`.
- Added a continuous cuboid shell preview mesh with driver-based wave sources.
- Added seam-continuity tests for front-to-side wave relief.
- Added exporter fallback outputs for preview mesh JSON, OBJ, STL, and separated panel meshes.
- Added an OpenCascade/OCP STEP export path for Docker/WSL Linux environments.
