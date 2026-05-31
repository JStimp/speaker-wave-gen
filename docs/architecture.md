# Architecture

## Goals

WaveGen3D is a static browser prototype. The first priority is a stable app that opens from a cloned folder without installing anything.

## Major Systems

- Static browser UI in `app/`.
- Vendored Three.js files in `app/vendor/`.
- Browser-side geometry math in `app/geometry.js`.
- Browser-side JSON/OBJ/STL/experimental STEP exporters in `app/exporters.js`.
- Docker-only CAD-kernel STEP solid exporter in `solid-step-exporter/`.

## Data Flow

```text
User edits controls
  -> project object updates in memory
  -> geometry mesh rebuilds in the browser
  -> Three.js preview redraws
  -> user downloads JSON, OBJ, STL, browser STEP, or PNG
  -> optional saved JSON goes through Docker solid STEP exporter
```

## Geometry Model

The prototype supports a rectangular enclosure. Coordinates follow a CAD-style floor origin:

- X is cabinet width, centered on the origin.
- Y is cabinet depth, centered on the origin.
- Z is cabinet height, with the bottom surface on `Z=0`.

The wave field is evaluated on the full cuboid shell before any panel thinking, so shared edges use the same relief height.

Front-mounted sources use a cuboid-unfolding distance model on sharp cabinets. When corner wrap is enabled, the wave field switches to the rounded 3D surface positions at wrapped edges so adjacent faces keep matched relief.

Corner wrap is not a simple hard fillet. It progressively softens the vertical, upper, and lower perimeter edges. In flat-bottom mode, the central underside stays planar on `Z=0` while the perimeter rounds inward and upward away from the contact patch.

Relief depth is clipped by the requested relief depth and by the cabinet wall thickness minus the configured minimum remaining wall. This keeps aggressive settings from previewing an impossible carve depth.

When flat bottom is enabled, the bottom face receives zero wave displacement and the lower perimeter is guarded against outward flaring. Positive outward relief near the floor transitions inward, while the actual contact surface stays closed and planar on `Z=0`.

## Units

Projects default to inches. Switching between inches and millimeters converts cabinet dimensions, driver/source lengths, wave lengths, relief depths, and falloff values so the design keeps the same physical size.

## Preview Aids

The viewer can draw an original-size outline box, RGB XYZ origin axes, a floor grid on `Z=0`, live dimension guide lines, and relief analysis planes. The width, depth, and height controls are keyed to those same axis colors so it is clear which model direction will change.

Analysis planes show the current min/max relief offsets around the cabinet, while the View Tools panel reports total deviation, max outward, max inward, and max absolute relief in the active units.

Sources are edited through compact selectable chips plus one focused editor. Clicking a source marker in the preview also selects that source, so source changes do not require scrolling through every driver.

Preview mesh resolution and output mesh quality are separate. The preview can stay responsive while OBJ, STL, and browser STEP exports rebuild from a denser mesh.

## Stability Boundary

The active browser prototype has no Node, npm, Vite, Rollup, Electron, Python, Docker, or CAD-kernel dependency. SolidWorks solid STEP export is a separate Docker path that reads saved `.wavecad.json` files and writes `outer-solid.step`.
