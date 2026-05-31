# STEP Solid Exporter

The static prototype now defaults to the browser solid STEP path because that is the current useful SolidWorks output. This Docker exporter remains a separate experiment for a later analytic/CAD-kernel solid path.

## Goal

```text
WaveGen3D .wavecad.json
  -> CAD-kernel STEP exporter
  -> exports/outer-solid.step
  -> exports/outer-solid.report.json
```

## Runtime

- Dependency-isolated Linux Docker image in `solid-step-exporter/`.
- CadQuery/OCP/OpenCascade provides spline faces, sewing, solid creation, validation, STEP write, and STEP re-import checking.
- The static browser app should stay able to launch without this runtime.

## Inputs

- `.wavecad.json` project exported from the static app.
- Optional exporter flags for resolution, surface control count, sewing tolerance, and debug surface output.

## Outputs

- `outer-solid.step`: first target is one outer block solid.
- `outer-solid.report.json`: success flag, free-edge count, validation result, re-import solid count, and geometry stats.
- `outer-surfaces-debug.step`: optional or failure-path sewn surface debug file.

## Current Limits

- Outer solid block only.
- Hollow wall thickness, driver cutouts, and separated panel STEP exports are later stages.
- The browser solid STEP button is the current primary prototype output. The Docker path is optional while the CAD-kernel approach is proven out.

## Windows Launcher

Click `Docker JSON` in the browser to download a `.solid-step.wavecad.json`, then drag it onto `Export-Solid-Step.bat`. The batch file also supports ordinary `.wavecad.json` files and opens a file picker when no file is dropped onto it.

## Acceptance Target

- `outer-solid.report.json` has `success: true`.
- `freeEdges` is `0`.
- `validSolid` is `true`.
- `importedSolidCount` is `1`.
- SolidWorks imports `outer-solid.step` as one Solid Bodies item, not separate Surface Bodies.
- Export report with warnings and geometry stats.

## Non-Goals For Prototype

- No claim that browser-generated faceted STEP is the final smooth/editable manufacturing CAD.
- No Docker requirement to open or preview the app.

## Current Browser STEP

- Runs fully in `app/exporters.js`.
- Rebuilds from the selected export quality.
- Default mode writes a faceted BREP STEP from triangular faces because it is currently importing as a solid body.
- Optional spline mode writes a BREP shell from spline surface faces for continued experiments.
- Intended as the active prototype STEP output until the analytic exporter proves it can produce a better smooth solid.
