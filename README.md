# Speaker 3D Wave CAD Generator

WaveGen3D is now a static browser prototype for speaker enclosures with continuous 3D wave-interference relief. It defaults to inches and runs from local files: no Node.js, npm, Vite, Rollup, Electron, install step, server, or package manager.

## Launch

Double-click:

```text
Launch-WaveGen3D.bat
```

The launcher opens:

```text
app/index.html
```

You can also open `app/index.html` directly in a browser.

## Current Prototype

- Rectangular speaker cabinet preview.
- CAD-style coordinates: X width, Y depth, Z height, with the origin at the floor center and the bottom on `Z=0`.
- Continuous wave relief across the active waved faces, with an optional flat bottom that keeps the contact surface on `Z=0` while the lower perimeter rounds inward and upward.
- Corner wrap control for smoother wave continuity around softened cabinet edges.
- Unit selection for inches or millimeters.
- Driver/source add/remove controls with selectable source chips and a focused source editor.
- Advanced source controls for position, diameter, amplitude, wavelength, phase, and falloff.
- Relief depth, flat-bottom, bias, normalization, preview resolution, export quality, and overlay controls.
- Visual helpers for the origin, XYZ axes, outline box, floor grid, live dimension guides, and min/max relief analysis planes.
- Orbit/pan/zoom 3D viewport using vendored Three.js files.
- Browser downloads for `.wavecad.json`, `.obj`, `.stl`, solid browser `.step`, optional Docker STEP project `.wavecad.json`, and preview `.png`.
- OBJ/STL/browser STEP exports use a separate output quality setting, so they can be higher resolution than the live preview.
- Higher default preview/detail settings for inspecting wave relief without immediately changing controls.
- Docker-based SolidWorks export through `Export-Solid-Step.bat`, which remains available as a separate experiment.

## Repository Layout

```text
app/                 Static browser prototype
app/vendor/          Vendored Three.js browser files
solid-step-exporter/ Docker-only CAD-kernel STEP solid exporter
examples/            Sample .wavecad.json projects
docs/                Architecture and exporter notes
.github/workflows/   Lightweight static checks only
```

Project tracking docs:

- [Changelog](CHANGELOG.md)
- [Development notes](docs/development-notes.md)
- [STEP exporter plan](docs/step-exporter-plan.md)
- [Third party notices](app/vendor/THIRD_PARTY_NOTICES.md)

## Smoke Test

Open:

```text
app/smoke-test.html
```

It checks that the default project loads, mesh vertices are finite, rounded front/right seam heights match, flat-bottom floor relief behaves correctly, the export mesh is higher resolution than the preview mesh, and OBJ/STL/STEP exporters produce text.

## STEP Direction

The static app defaults to the browser solid STEP output because that path is currently the useful SolidWorks import target. The spline-surface STEP mode and Docker exporter are still available as experiments:

```text
Export-Solid-Step.bat
```

From the browser, use `Export STEP` for the default solid browser STEP. `Docker JSON` downloads a `.solid-step.wavecad.json` file for `Export-Solid-Step.bat`. The first solid target is an outer block only; hollow walls, cutouts, and separated panels are later steps.
