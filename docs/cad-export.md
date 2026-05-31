# CAD Export Notes

## Current Prototype

The static app exports:

- `.wavecad.json`
- `.obj`
- `.stl`
- experimental browser `.step`
- `.png` preview screenshot

OBJ and STL are mesh exports for inspection and rough CAM experiments. They are not editable CAD surfaces. Mesh coordinates use the selected project units.

OBJ, STL, and STEP exports rebuild from the selected export quality rather than the live preview resolution. The exported geometry follows settings such as corner wrap and flat-bottom mode. In flat-bottom mode, the underside contact patch stays on `Z=0` and the lower perimeter rounds inward and upward so the exported body closes without an outward base flange.

## STEP

The browser app includes two in-house STEP modes:

- Experimental spline surfaces: a hand-written BREP shell built from spline surface faces. SolidWorks may import this as surface bodies.
- Faceted solid fallback: a triangular BREP retained for troubleshooting import problems.

For SolidWorks solid-body import, use `Export-Solid-Step.bat`. That Docker path runs a real OpenCascade-based sewing and validation step and writes `exports/outer-solid.step` plus `exports/outer-solid.report.json`.

## Panel Strategy

The surface is generated as a full cuboid shell first. Panels can be derived later from face samples, which preserves matched relief along shared edges.
