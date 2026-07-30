# STEP Solid Exporter

The static prototype now defaults to Smooth surface STEP from the browser because that is the production-direction SolidWorks test output. Smooth, reliable SolidWorks solid STEP is still the overall CAD goal. The faceted browser STEP remains a fallback while the Docker/CAD-kernel path works toward stronger validation.

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
- The browser Smooth surface STEP button is the current primary prototype output. The Docker path is optional while the CAD-kernel approach is proven out.
- Very dense faceted STEP files can import slowly because each triangle becomes a CAD face. Use higher faceted export settings only when testing final surface fidelity.

## Windows Launcher

Use `Save Project` in the browser, then drag the downloaded `.wavecad.json` onto `Export-Solid-Step.bat`. The batch file also opens a file picker when no file is dropped onto it.

## Acceptance Target

- `outer-solid.report.json` has `success: true`.
- `freeEdges` is `0`.
- `validSolid` is `true`.
- `importedSolidCount` is `1`.
- SolidWorks imports `outer-solid.step` as one Solid Bodies item, not separate Surface Bodies.
- Export report with warnings and geometry stats.

## Non-Goals For Prototype

- No claim that browser-generated fallback faceted STEP is the final smooth/editable manufacturing CAD.
- The long-term target is a validated smooth solid BREP with matched boundary curves/surfaces, zero free edges, and reliable SolidWorks import as one solid body.
- No Docker requirement to open or preview the app.

## Current Browser STEP

- Runs fully in `app/exporters.js`.
- Rebuilds from the selected export quality.
- Default mode writes a Smooth surface BREP STEP from spline surface faces.
- Optional faceted fallback writes a triangular BREP for CAD import troubleshooting.
- Intended as the active prototype STEP output until the analytic exporter proves it can produce a better validated smooth solid.
