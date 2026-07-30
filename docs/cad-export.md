# CAD Export Notes

## Current Prototype

The static app exports:

- `.wavecad.json`
- `.obj`
- `.stl`
- Smooth surface browser `.step`
- Selected DFM panels as separately named browser `.step`, `.obj`, and `.stl` files
- Solid STEP project `.wavecad.json`
- `.png` preview screenshot

OBJ and STL are mesh exports for inspection and rough CAM experiments. They are not editable CAD surfaces. Mesh coordinates use the selected project units.

OBJ, STL, and STEP exports rebuild from the selected export quality rather than the live preview resolution. The exported geometry follows settings such as corner wrap and flat-bottom mode. In flat-bottom mode, the underside contact patch stays on `Z=0` and the lower perimeter rounds inward and upward so the exported body closes without an outward base flange.

## STEP

The browser app includes two in-house STEP modes:

- Smooth surface STEP: the default hand-written BREP built from spline surface faces for lower-entity SolidWorks tests.
- Faceted solid fallback: a triangular BREP retained for troubleshooting import problems.

For the separate CAD-kernel path, save the project JSON and drag the `.wavecad.json` onto `Export-Solid-Step.bat`. That Docker path runs OpenCascade-based sewing and validation and writes `exports/outer-solid.step` plus `exports/outer-solid.report.json`.

## Panel Strategy

The surface is generated as a full cuboid shell first. DFM panel export then derives six flat-workholding panel bodies from the same wave field.

The fixed split gives each panel no more than two routed curved edges. The other two local edges stay square for mating and workholding. Routed edge owners keep the full cabinet-face extent; each neighboring square edge is inset by exactly one wall thickness. The resulting flush butt-joint envelopes meet at the owner's inner plane rather than overlapping through the corner. The wave sample coordinates remain tied to the assembled cabinet, so shortening a blank crops the relief instead of stretching it.

The Output section lets the user select any combination of panels and creates a separate labeled file for each selection. On browsers with directory access, WaveGen3D creates a `<project>-dfm-panels` folder inside the chosen location; otherwise it falls back to individual browser downloads.

Each DFM STEP file contains one named `MANIFOLD_SOLID_BREP`. Its sculpted top is a spline surface, while its flat underside and four boundary faces are explicit STEP `PLANE` surfaces so SolidWorks can recognize the machinable flats directly.

This DFM path uses zero-clearance flush butt joints. It intentionally does not add rabbets, screw holes, driver cutouts, glue gaps, machining tolerances, or internal clearances yet.
