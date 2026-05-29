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
- Continuous wave relief across the active waved faces, with an optional flat bottom that keeps the base closed on `Z=0`.
- Corner wrap control for smoother wave continuity around softened cabinet edges.
- Unit selection for inches or millimeters.
- Driver/source add/remove controls with selectable source chips and a focused source editor.
- Advanced source controls for position, diameter, amplitude, wavelength, phase, and falloff.
- Relief depth, flat-bottom, bias, normalization, preview resolution, export quality, and overlay controls.
- Visual helpers for the origin, XYZ axes, outline box, floor grid, and live dimension guides.
- Orbit/pan/zoom 3D viewport using vendored Three.js files.
- Browser downloads for `.wavecad.json`, `.obj`, `.stl`, smooth spline `.step`, and preview `.png`.
- OBJ/STL/STEP exports use a separate output quality setting, so they can be higher resolution than the live preview.

## Repository Layout

```text
app/                 Static browser prototype
app/vendor/          Vendored Three.js browser files
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

It checks that the default project loads, mesh vertices are finite, rounded front/right seam heights match, the export mesh is higher resolution than the preview mesh, and OBJ/STL/STEP exporters produce text.

## STEP Direction

The static app includes an in-house smooth spline STEP export plus a faceted fallback. A later CAD-kernel exporter can still improve this into cleaner analytic solids and separated panels.
