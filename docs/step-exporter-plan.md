# STEP Exporter Plan

STEP export is intentionally outside the static prototype. The browser app must stay dependency-free and stable.

## Goal

```text
WaveGen3D .wavecad.json
  -> Docker STEP exporter
  -> full cabinet STEP
  -> separated panel STEP files
```

## Proposed Runtime

- Linux Docker image.
- OpenCascade/OCP, FreeCAD CLI, or another real CAD kernel.
- No dependency on Windows native CAD DLLs.
- No dependency on browser app launch.

## Inputs

- `.wavecad.json` project exported from the static app.
- Optional export settings such as mesh resolution, panel inclusion, and surface fitting tolerance.

## Outputs

- Full cabinet STEP surface/body.
- Separated panel STEP files with matched relief edges.
- Optional OBJ/STL preview files for comparison.
- Export report with warnings and geometry stats.

## Non-Goals For Prototype

- No browser-generated STEP.
- No fake STEP files that are really mesh exports in disguise.
- No Docker requirement to open or preview the app.

