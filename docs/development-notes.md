# Development Notes

This file tracks the practical work being done in the repo so the project has a readable handoff trail beyond commit messages.

## Current Direction

- Build a desktop CAD-style app for configuring a speaker enclosure with continuous 3D wave-interference relief.
- Treat the cabinet as a full 3D shell first, then derive routable panels from that shared surface so corner boundaries match.
- Keep the Windows GUI independent of OpenCascade/OCP because the v1 handoff identified native CAD DLL blocking on Windows.
- Use Docker/WSL Linux for STEP export and keep STL/OBJ as preview or fallback formats.
- Prefer a portable Windows Electron executable for end users and testing; use the source launcher only for development or debugging.

## Implemented So Far

- Created the Electron + React + Three.js desktop shell.
- Created a shared JavaScript core package for schema defaults, validation, wave math, cabinet face sampling, preview mesh generation, driver overlays, and seam overlays.
- Created a Python exporter that mirrors the core mesh generation and writes preview JSON, OBJ, STL, panel exports, and STEP through OCP when available.
- Added an example `default-speaker.wavecad.json` project.
- Added GitHub Actions for tests, desktop build, Docker exporter build, and portable Windows bundle generation.
- Added a Windows launcher that can install portable Node.js, install npm dependencies, and repair a broken Electron install.
- Added Electron Builder packaging so CI can produce a portable Windows executable that does not require Node/npm on the target PC.
- Configured Electron user data/cache to stay beside the app, making version swaps and cleanup folder-based.

## Launcher Behavior

- `Launch-WaveGen3D.bat` calls `scripts/launch-windows.ps1`.
- The launcher first looks for a bundled `.runtime/node-*-win-*` folder.
- Source-mode launch is pinned to Node.js 20 because CI uses Node 20 and Electron install scripts are less fragile there than under newer global Node/npm pairs.
- If no Node 20 runtime exists, it downloads portable Node.js 20 into `.runtime/`.
- If Node 20 setup fails, it can fall back to system Node/npm, but that path is less preferred.
- It installs dependencies when `node_modules/` is missing.
- It checks for `node_modules/electron/dist/electron.exe` and repairs dependencies if Electron is incomplete.
- Electron repair clears common skip-download flags, runs `npm rebuild electron`, and can run Electron's installer script directly.
- If Electron still cannot install, source launch falls back to browser preview mode instead of failing completely.

## Packaging Direction

- Node/npm are build tools for the current Electron/React stack.
- End users should use the packaged Windows executable from the **Windows Packaged App** GitHub Action.
- The packaged app embeds the Electron runtime, so the target PC does not need a separate Node.js install.
- The packaged app should stay portable during testing. Avoid installer targets until the app is stable.
- Runtime user data should live in `WaveGen3D-user-data/` beside the app, so deleting the test folder removes local app state.
- The source launcher remains useful when working from a Git clone, but it is not the final distribution format.
- The most stable stack for this project remains React/Three.js plus packaged Electron for the GUI, with Docker/WSL reserved for CAD export.

## Known Limits

- The source-code launch path still needs internet on first setup unless using the portable zip artifact.
- The current GUI is a usable scaffold, not a finished CAD product.
- Built-in rectangular cabinet geometry is the first fully implemented shape; other presets are schema placeholders.
- STEP export depends on the Docker/WSL Linux exporter having OCP/OpenCascade available.
- Imported STEP/STL cabinet support is planned in the schema and architecture, but not finished as a production workflow.

## Verification Run By Codex

- PowerShell syntax checks for launcher scripts.
- Node core tests for schema and mesh seam continuity.
- Python exporter tests for geometry and fallback outputs.
- Exporter dry runs with the bundled Codex Python runtime.
