# Speaker 3D Wave CAD Generator

Desktop CAD-style generator for speaker enclosures with continuous 3D wave-interference relief. The app is designed for hardwood CNC workflows where a full cabinet preview can be split into routable panels without losing the visual wave continuity at the corners.

## What this version builds

- Electron + React + Three.js desktop app for live preview and parameter editing.
- Shared geometry core that computes wave relief on a 3D cabinet shell.
- Versioned `*.wavecad.json` project format.
- Linux-oriented exporter CLI for STEP-first CAD output, with STL/OBJ preview fallbacks.
- Docker/WSL export path so Windows UI development does not depend on blocked OpenCascade DLLs.
- Unit tests for schema validation, wave math, preview mesh generation, and seam continuity.

## Repository layout

```text
apps/desktop        Electron desktop app and Three.js viewport
packages/core       Shared schema, defaults, wave math, cabinet sampling, preview mesh
exporter            Python CLI and Docker image for CAD/export generation
examples            Sample .wavecad.json projects
scripts             Helper scripts for Docker/WSL exporter runs
docs                Architecture and CAD export notes
```

Project tracking docs:

- [Changelog](CHANGELOG.md)
- [Development notes](docs/development-notes.md)

## Quick start

### Best Windows option: portable app

For testing and normal use, prefer the portable Windows app. It is not an installer, so there is nothing to uninstall. Delete the app folder to remove that version.

1. Open the GitHub repo.
2. Go to **Actions**.
3. Run **Windows Packaged App** on the `experimental` branch.
4. Download the `WaveGen3D-windows-portable-exe` artifact.
5. Run the downloaded WaveGen3D portable executable.

Node.js is required to build the app, but it is bundled inside the packaged Electron app. The target PC should not need Node/npm installed.

Portable behavior:

- no system Node.js install required
- no npm install on the target PC
- no Windows installer or uninstall step
- app data/cache stored beside the app in `WaveGen3D-user-data/`
- switching versions means replacing the folder or executable
- deleting the folder removes the app and its local test data

An installer can be added later when the app is stable, but it is not the recommended testing workflow.

### Source portable bundle

For a source-style folder that includes portable Node.js and `node_modules`, use the portable Windows bundle from GitHub Actions:

1. Open the GitHub repo.
2. Go to **Actions**.
3. Run **Windows Portable Bundle** on the `experimental` branch.
4. Download the `WaveGen3D-windows-portable` artifact.
5. Unzip it and double-click `Launch-WaveGen3D.bat`.

That zip includes portable Node.js and installed app dependencies. It is useful for debugging or development-style launches, but the portable app above is the cleaner end-user option.

To build the portable bundle yourself on a Windows machine with internet:

```powershell
.\scripts\build-portable-windows.ps1
```

Output:

```text
dist\WaveGen3D-windows-portable.zip
```

### Source-code launch

After cloning the repo, double-click:

```text
Launch-WaveGen3D.bat
```

The source-code launcher checks for Node.js/npm, installs app dependencies on the first run, then opens the Electron desktop app. Leave the launcher window open while the app is running.

If Node.js is not installed, the launcher downloads a portable Node.js LTS runtime into `.runtime/` automatically. The first run needs internet access. Later launches reuse `.runtime/` and `node_modules/` from the project folder.

Manual PowerShell launch:

```powershell
.\Launch-WaveGen3D.bat
```

If the automatic portable runtime download fails, install the current LTS version from <https://nodejs.org> and run the launcher again.

Docker is used for the Linux CAD exporter, not for the regular desktop GUI. Running the GUI inside Docker on Windows adds display-driver and file-sharing friction, while a local Electron app behaves like a normal desktop program.

### Developer launch

```bash
npm install
npm run dev
```

The renderer starts through Vite and Electron opens the desktop shell.

Run dependency-light tests:

```bash
npm test
```

Run the exporter locally:

```bash
python -m pip install -e exporter
python -m wavecad_exporter --config examples/default-speaker.wavecad.json --out exports --format all --panel-mode separated
```

For STEP output, use the Docker/WSL exporter path on Linux with OpenCascade/OCP available:

```bash
docker build -f exporter/Dockerfile -t speaker-wave-exporter .
docker run --rm -v "%cd%:/work" speaker-wave-exporter --config /work/examples/default-speaker.wavecad.json --out /work/exports --format all --panel-mode separated
```

## Design direction

The wave field is evaluated on the actual cabinet shell, not on independent flat panels. Panel exports are derived from that shell, which keeps matching relief heights along shared edges. Driver centers are the default wave sources, and manual point sources can be added for tuning.

STEP is the preferred manufacturing exchange format. STL and OBJ are included for preview, fallback, and inspection, but they are not treated as the primary CAD workflow.
