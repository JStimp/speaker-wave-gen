# STEP Exporter Plan

The static prototype now includes an in-house spline-surface STEP export plus a faceted fallback. That is useful for SolidWorks import testing, but it is still generated from sampled browser geometry. This document tracks the later analytic CAD-kernel exporter.

## Goal

```text
WaveGen3D .wavecad.json
  -> CAD-kernel STEP exporter
  -> clean full cabinet STEP
  -> separated panel STEP files with matched edges
```

## Proposed Runtime

- Preferred: dependency-isolated Linux Docker image.
- Candidate kernels: OpenCascade/OCP, FreeCAD CLI, or another real CAD kernel.
- The static browser app should stay able to launch without this runtime.

## Inputs

- `.wavecad.json` project exported from the static app.
- Optional export settings such as mesh resolution, panel inclusion, and surface fitting tolerance.

## Outputs

- Full cabinet STEP surface/body.
- Separated panel STEP files with matched relief edges.
- Optional OBJ/STL preview files for comparison.
- Export report with warnings and geometry stats.

## Non-Goals For Prototype

- No claim that browser-generated faceted STEP is final manufacturing CAD.
- No Docker requirement to open or preview the app.

## Current Browser STEP

- Runs fully in `app/exporters.js`.
- Rebuilds from the selected export quality.
- Default mode writes a BREP shell from spline surface faces.
- Fallback mode writes a faceted BREP STEP from triangular faces.
- Intended for CAD import experiments before the analytic exporter exists.
