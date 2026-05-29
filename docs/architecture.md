# Architecture

## Goals

WaveGen3D is a static browser prototype. The first priority is a stable app that opens from a cloned folder without installing anything.

## Major Systems

- Static browser UI in `app/`.
- Vendored Three.js files in `app/vendor/`.
- Browser-side geometry math in `app/geometry.js`.
- Browser-side JSON/OBJ/STL/STEP exporters in `app/exporters.js`.
- Future CAD-kernel STEP direction documented separately in `docs/step-exporter-plan.md`.

## Data Flow

```text
User edits controls
  -> project object updates in memory
  -> geometry mesh rebuilds in the browser
  -> Three.js preview redraws
  -> user downloads JSON, OBJ, STL, STEP, or PNG
```

## Geometry Model

The prototype supports a rectangular enclosure. Coordinates follow a CAD-style floor origin:

- X is cabinet width, centered on the origin.
- Y is cabinet depth, centered on the origin.
- Z is cabinet height, with the bottom surface on `Z=0`.

The wave field is evaluated on the full cuboid shell before any panel thinking, so shared edges use the same relief height.

Front-mounted sources use a cuboid-unfolding distance model. That keeps front-to-side, front-to-top, and, when flat-bottom mode is off, front-to-bottom seams visually continuous.

Relief depth is clipped by the requested relief depth and by the cabinet wall thickness minus the configured minimum remaining wall. This keeps aggressive settings from previewing an impossible carve depth.

When flat bottom is enabled, only the bottom face receives zero wave displacement so the cabinet can sit on a real surface. The back, sides, front, and top continue to use the wave field.

## Units

Projects default to inches. Switching between inches and millimeters converts cabinet dimensions, driver/source lengths, wave lengths, relief depths, and falloff values so the design keeps the same physical size.

## Preview Aids

The viewer can draw an original-size outline box, RGB XYZ origin axes, a floor grid on `Z=0`, and live dimension guide lines. The width, depth, and height controls are keyed to those same axis colors so it is clear which model direction will change.

Sources are edited through compact selectable chips plus one focused editor. Clicking a source marker in the preview also selects that source, so source changes do not require scrolling through every driver.

Preview mesh resolution and output mesh quality are separate. The preview can stay responsive while OBJ, STL, and experimental STEP exports rebuild from a denser mesh.

## Stability Boundary

The active prototype has no Node, npm, Vite, Rollup, Electron, Python, Docker, or CAD-kernel dependency. The built-in STEP export is faceted mesh STEP; analytic STEP solids remain a future CAD-kernel track.
