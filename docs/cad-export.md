# CAD Export Notes

## Current Prototype

The static app exports:

- `.wavecad.json`
- `.obj`
- `.stl`
- Smooth surface browser `.step`
- DFM panel Smooth surface browser `.step`
- DFM panel `.obj` and `.stl`
- Solid STEP project `.wavecad.json`
- `.png` preview screenshot

OBJ and STL are mesh exports for inspection and rough CAM experiments. They are not editable CAD surfaces. Mesh coordinates use the selected project units.

OBJ, STL, and STEP exports rebuild from the selected export quality rather than the live preview resolution. The exported geometry follows settings such as corner wrap and flat-bottom mode. In flat-bottom mode, the underside contact patch stays on `Z=0` and the lower perimeter rounds inward and upward so the exported body closes without an outward base flange.

## STEP

The browser app includes two in-house STEP modes:

- Smooth surface STEP: the default hand-written BREP built from spline surface faces for lower-entity SolidWorks tests.
- Faceted solid fallback: a triangular BREP retained for troubleshooting import problems.

For the separate CAD-kernel path, click `Docker JSON` in the browser, then drag the downloaded `.solid-step.wavecad.json` onto `Export-Solid-Step.bat`. That Docker path runs OpenCascade-based sewing and validation and writes `exports/outer-solid.step` plus `exports/outer-solid.report.json`.

## Panel Strategy

The surface is generated as a full cuboid shell first. DFM panel export then derives six flat-workholding panel bodies from the same wave field.

The fixed first-pass split gives each panel no more than two routed curved edges. The other two local edges stay square for mating and workholding. The STEP panel export writes six named smooth BREP bodies in one file; OBJ and STL panel exports are kept as preview/debug outputs.

This DFM path intentionally does not add rabbets, screw holes, driver cutouts, internal clearances, or final assembly joinery yet.
