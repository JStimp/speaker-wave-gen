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
- Continuous wave relief around the four vertical cabinet walls and inside an adjustable flat perimeter on the top; the bottom remains planar.
- Vertical corner blend control for wall-to-wall continuity. The blend fades out before the flat cap seams.
- Unit selection for inches or millimeters.
- Driver/source add/remove controls with selectable source chips, duplicate/copy/paste settings, a sidebar editor, and a floating click-to-edit overlay.
- Advanced source controls for position, diameter, amplitude, wavelength, phase, and falloff.
- Relief depth, bias, normalization, preview resolution, export quality, and overlay controls.
- Visual helpers for a floor origin marker, offset XYZ direction triad, outline box, floor grid, slim dimension guides, and min/max relief analysis planes.
- Three CAD viewing modes: assembled model, transparent panel-split ghosts, and a selectable exploded six-panel view.
- Clickable exploded panels with a compact properties window for blank size, thickness, routed edges, square mating edges, and export inclusion.
- Console-style CAD interface with monospace engineering typography and phosphor, amber, cyan, and axis-color status accents.
- Contextual top tool tabs for File, Build, Driver Source Config, Panels, and Export. The right tool dock can close completely to restore the full viewport.
- Bottom-left View Tools drawer for display overlays, relief statistics, isometric reset, and center- or cursor-anchored wheel zoom.
- Per-panel visibility controls for Panel Split and Exploded modes; viewport picks automatically open the matching Sources or Panels tool context.
- Hover tooltips on controls, including STEP-specific notes for export quality and spline controls.
- Orbit/pan/zoom 3D viewport using vendored Three.js files.
- Browser downloads for `.wavecad.json`, `.obj`, `.stl`, Smooth surface STEP, and preview `.png`.
- Selectable DFM exports that create separately named STEP/OBJ/STL files for the chosen panels. Chromium browsers can write them into an automatically named project folder.
- Flat-cap DFM butt joints: top and bottom remain full width/depth, while all four walls are shortened by two material thicknesses to fit between them. Front/back own the remaining vertical corners so side panels do not overlap.
- DFM wall and inset-top STEP files use one spline relief face and five analytic planar faces. The bottom panel uses six analytic planar faces.
- OBJ/STL/browser STEP exports use a separate output quality setting, so they can be higher resolution or smoother than the live preview.
- Higher default preview/detail settings for inspecting wave relief without immediately changing controls.
- Default STEP export uses Smooth surface STEP. Faceted solid STEP remains available as a fallback when troubleshooting CAD imports.
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

It checks that the default project loads, mesh vertices are finite, front/right wall relief matches, the top border and both cap seams stay flat, exactly five panels receive waves, the bottom remains planar, all twelve DFM joints have one owner with zero modeled overlap, individual panel STEP files contain one solid, and OBJ/STL/STEP exporters produce text.

## STEP Direction

The static app defaults to Smooth surface STEP because that is the production-direction browser output: fewer CAD entities than a triangle-per-face export, with a real BREP shell/solid structure for SolidWorks tests. Smooth reliable solid STEP remains the overall goal, and the Docker exporter remains a separate CAD-kernel experiment:

```text
Export-Solid-Step.bat
```

From the Output section, use `STEP` for the assembled Smooth surface STEP reference. Select the required faces and use `Selected STEP` to create one labeled solid file per DFM panel. Switch `STEP type` to Faceted solid fallback only when you need a compatibility test for the assembled reference body. A saved `.wavecad.json` can still be passed to `Export-Solid-Step.bat`; that Docker path remains an outer-block experiment.
