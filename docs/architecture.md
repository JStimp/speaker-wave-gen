# Architecture

## Goals

WaveGen3D is a static browser prototype. The first priority is a stable app that opens from a cloned folder without installing anything.

## Major Systems

- Static browser UI in `app/`.
- Vendored Three.js files in `app/vendor/`.
- Browser-side geometry math in `app/geometry.js`.
- Browser-side JSON/OBJ/STL/Smooth surface STEP and DFM panel exporters in `app/exporters.js`.
- Docker-only CAD-kernel STEP solid exporter in `solid-step-exporter/`.

## Data Flow

```text
User edits controls
  -> project object updates in memory
  -> geometry mesh rebuilds in the browser
  -> Three.js preview redraws as assembled, panel-split, or exploded geometry
  -> user downloads JSON, OBJ, STL, assembled browser STEP, selected per-panel files, or PNG
  -> optional saved JSON goes through Docker solid STEP exporter
```

## Geometry Model

The prototype supports a rectangular enclosure. Coordinates follow a CAD-style floor origin:

- X is cabinet width, centered on the origin.
- Y is cabinet depth, centered on the origin.
- Z is cabinet height, with the bottom surface on `Z=0`.

The wave field is evaluated around the four vertical walls before panel splitting, so front/right/back/left edges share the same relief. The same source-distance field continues onto the top, where a nearest-edge mask holds a uniform perimeter flat and smoothly fades relief into the center. The bottom is excluded from the wave field and remains planar.

DFM panel export derives six flat-workholding panel solids. Top and bottom are full `width x depth` cap panels. Front and back retain the full cabinet width but are shortened by two material thicknesses in height. Left and right are shortened by two thicknesses in both depth and height, fitting between the caps and the front/back corner owners without occupying the same volume.

Shortened panels retain their original assembled-face UV range. The wave field is cropped at the joint instead of being rescaled across the smaller blank, preserving alignment with the shared cabinet design.

The viewer can transform those same panel meshes back into cabinet coordinates for a transparent ownership overlay or move them outward along their face normals for an exploded assembly view. Panel meshes carry face IDs for viewport picking and the focused DFM properties overlay.

Each wall-panel STEP contains one sculpted spline top and five analytic planar faces. The top cap uses one spline face with a geometrically flat perimeter plus five analytic faces; the bottom cap uses six analytic planar faces. Export selection is stored in the project schema so chosen manufacturing parts survive save/load.

Front-mounted sources use a cuboid-unfolding distance model across the four walls. When vertical corner blend is enabled, the wave field switches to rounded 3D wall positions at those edges so adjacent wall faces keep matched relief.

Vertical corner blend is not a simple hard fillet. It progressively softens only the four upright wall corners and fades to zero before the top and bottom cap seams. The cap outlines therefore remain rectangular and easy to fixture.

Relief depth is clipped by the requested relief depth and by the cabinet wall thickness minus the configured minimum remaining wall. This keeps aggressive settings from previewing an impossible carve depth.

Wall relief fades to zero at the cap inner-face elevations, producing straight exterior seam lines without a wavy overhang or corner flange. The top perimeter also remains at zero displacement; only the inset center receives relief. The bottom always receives zero displacement.

## Units

Projects default to inches. Switching between inches and millimeters converts cabinet dimensions, driver/source lengths, wave lengths, relief depths, top border/blend widths, and falloff values so the design keeps the same physical size.

## Preview Aids

The viewer can draw an original-size outline box, a small floor origin marker, an offset RGB XYZ direction triad, a floor grid on `Z=0`, live dimension guide lines, and relief analysis planes. The width, depth, and height controls are keyed to those same axis colors so it is clear which model direction will change.

Analysis planes show the current min/max relief offsets around the cabinet, while the View Tools panel reports total deviation, max outward, max inward, and max absolute relief in the active units.

Sources are edited through compact selectable chips plus one focused editor. Clicking a source marker in the preview also selects that source, so source changes do not require scrolling through every driver.

In exploded mode, source markers are hidden and clicking a panel opens its machined dimensions, thickness, routed/square edge ownership, flush-joint rule, and export inclusion.

## Interface Shell

The top application bar selects one right-dock context at a time: File, Build, Driver Source Config, Panels, or Export. Closing the dock removes its grid column and a `ResizeObserver` keeps the WebGL canvas matched to the expanding viewport.

Display-only controls live in a separate bottom-left View Tools drawer. This keeps overlays and camera behavior available while the parameter dock is closed. Wheel zoom can use the orbit target as its center or intersect the pointer ray with the target plane for cursor-anchored navigation.

Panel visibility is separate from panel export selection. It affects only Panel Split and Exploded preview modes and is stored in the project preview state.

Preview mesh resolution and output mesh quality are separate. The preview can stay responsive while OBJ, STL, browser STEP, and DFM panel exports rebuild from denser geometry.

## Stability Boundary

The active browser prototype has no Node, npm, Vite, Rollup, Electron, Python, Docker, or CAD-kernel dependency. Smooth surface browser STEP is available directly in the app. The separate Docker CAD-kernel path reads saved `.wavecad.json` files and writes `outer-solid.step`.
