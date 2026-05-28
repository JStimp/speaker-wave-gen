# Architecture

## Goals

The generator is built around a true 3D enclosure model. The UI edits speaker-box parameters, the core package generates a continuous relief field over the cabinet shell, and the exporter turns the project into CAD/CAM-friendly artifacts.

The v1 project generated 2D panel surfaces. V2 intentionally changes the architecture so the surface field is evaluated before panel splitting. That means the same wave function drives the front, sides, top, bottom, and back, and panel boundaries inherit matching relief values.

## Major systems

- Desktop shell: Electron hosts a React app with a Three.js viewport.
- Shared core: project schema, defaults, shape presets, source handling, wave math, and preview mesh generation.
- Exporter: Python CLI designed to run under Docker/WSL Linux for OpenCascade/OCP-based STEP generation.
- Project files: versioned `*.wavecad.json` files are the durable interface between UI, tests, and exporter.

## Data flow

```text
User edits parameters
  -> React state validates through shared schema
  -> Core builds preview mesh and overlays
  -> Electron backend saves/loads project files
  -> Export job sends project JSON to Docker/WSL exporter
  -> Exporter writes STEP/STL/OBJ/report artifacts
```

## Geometry model

The first release treats built-in cabinets as shell presets. A rectangular enclosure is implemented first because it gives predictable panels and clear CNC behavior. Wedge, rounded, and curved presets are schema-supported and reserved for the next geometry pass.

Wave sources are driver-based by default. Driver centers are placed on the baffle and converted into source definitions. Manual extra sources can be added to bias the pattern.

The current core evaluates surface distances for front-mounted driver sources with a cuboid unfolding model. That gives continuous values along front-to-side, front-to-top, and front-to-bottom seams. Imported CAD bodies will use a sampled mesh surface path in later iterations.

## Windows CAD-kernel boundary

The Windows desktop app does not import OCP, OpenCascade, CadQuery, or pythonOCC. The handoff identified Windows Application Control blocking native CAD DLLs, so native CAD generation lives in the Linux exporter only.

