# Architecture

## Goals

WaveGen3D is a static browser prototype. The first priority is a stable app that opens from a cloned folder without installing anything.

## Major Systems

- Static browser UI in `app/`.
- Vendored Three.js files in `app/vendor/`.
- Browser-side geometry math in `app/geometry.js`.
- Browser-side JSON/OBJ/STL exporters in `app/exporters.js`.
- Future STEP export documented separately in `docs/step-exporter-plan.md`.

## Data Flow

```text
User edits controls
  -> project object updates in memory
  -> geometry mesh rebuilds in the browser
  -> Three.js preview redraws
  -> user downloads JSON, OBJ, STL, or PNG
```

## Geometry Model

The prototype supports a rectangular enclosure. The wave field is evaluated on the full cuboid shell before any panel thinking, so shared edges use the same relief height.

Front-mounted sources use a cuboid-unfolding distance model. That keeps front-to-side, front-to-top, and front-to-bottom seams visually continuous.

Relief depth is clipped by the requested relief depth and by the cabinet wall thickness minus the configured minimum remaining wall. This keeps aggressive settings from previewing an impossible carve depth.

## Stability Boundary

The active prototype has no Node, npm, Vite, Rollup, Electron, Python, Docker, or CAD-kernel dependency. STEP export is a future Docker tool and must not be required to preview the app.
