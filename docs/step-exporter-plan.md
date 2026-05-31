# STEP Solid Exporter

The static prototype includes an experimental browser STEP export plus a faceted fallback. SolidWorks can import that path as surface bodies, so this Docker exporter uses a real OpenCascade-backed CAD kernel to sew surfaces, create one solid, validate it, and write a STEP intended to import as a SolidWorks solid body.

## Goal

```text
WaveGen3D .wavecad.json
  -> CAD-kernel STEP exporter
  -> exports/outer-solid.step
  -> exports/outer-solid.report.json
```

## Runtime

- Dependency-isolated Linux Docker image in `solid-step-exporter/`.
- CadQuery/OCP/OpenCascade provides spline faces, sewing, faceted fallback faces, solid creation, validation, STEP write, and STEP re-import checking.
- The static browser app should stay able to launch without this runtime.

## Inputs

- `.wavecad.json` project exported from the static app.
- Optional exporter flags for resolution, surface control count, sewing tolerance, and debug surface output.

## Outputs

- `outer-solid.step`: first target is one outer block solid.
- `outer-solid.report.json`: success flag, free-edge count, validation result, re-import solid count, and geometry stats.
- `outer-surfaces-debug.step`: optional or failure-path sewn surface debug file.
- `outer-faceted-debug.step`: failure-path faceted sew debug file if the fallback also fails.

## Current Limits

- Outer solid block only.
- Auto mode may write a faceted solid fallback when smooth spline surfaces do not sew into a closed valid shell. This is intended to import as one SolidWorks solid body, but it is not the final editable smooth-surface CAD target.
- Hollow wall thickness, driver cutouts, and separated panel STEP exports are later stages.
- The browser STEP button remains experimental and should not be used as the primary SolidWorks solid-body path.

## Windows Launcher

Click `Solid STEP Project` in the browser to download a `.solid-step.wavecad.json`, then drag it onto `Export-Solid-Step.bat`. The batch file also supports ordinary `.wavecad.json` files and opens a file picker when no file is dropped onto it.

The static browser app cannot directly launch Docker or the batch file from a button because it runs from local files under normal browser security rules. A one-click Solid STEP button would require a local helper service, protocol handler, or desktop shell, which is intentionally outside the stable prototype launch path for now.

## Acceptance Target

- `outer-solid.report.json` has `success: true`.
- `freeEdges` is `0`.
- `validSolid` is `true`.
- `importedSolidCount` is `1`.
- SolidWorks imports `outer-solid.step` as one Solid Bodies item, not separate Surface Bodies.
- Export report with warnings and geometry stats.
- If `mode` is `facetedFallback`, the first solid-body milestone passed, but smooth-surface work is still pending.

## Non-Goals For Prototype

- No claim that browser-generated faceted STEP is final manufacturing CAD.
- No Docker requirement to open or preview the app.

## Current Browser STEP

- Runs fully in `app/exporters.js`.
- Rebuilds from the selected export quality.
- Default mode writes a BREP shell from spline surface faces.
- Fallback mode writes a faceted BREP STEP from triangular faces.
- Intended for CAD import experiments before the analytic exporter exists.
