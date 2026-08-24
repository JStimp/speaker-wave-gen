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

OBJ, STL, and STEP exports rebuild from the selected export quality rather than the live preview resolution. Relief is generated on the four walls and inside the top panel's adjustable flat border. The bottom remains planar, and wall relief fades to zero at both cap seams.

## STEP

The browser app includes two in-house STEP modes:

- Smooth surface STEP: the default hand-written BREP built from spline surface faces for lower-entity SolidWorks tests.
- Faceted solid fallback: a triangular BREP retained for troubleshooting import problems.

For the separate CAD-kernel path, save the project JSON and drag the `.wavecad.json` onto `Export-Solid-Step.bat`. That Docker path runs OpenCascade-based sewing and validation and writes `exports/outer-solid.step` plus `exports/outer-solid.report.json`.

## Panel Strategy

The shared relief field generates four waved wall bodies, one inset-wave top body, and one planar bottom body.

Top and bottom keep the full cabinet width and depth and own all eight cap-to-wall joints. Every wall is shortened by one cap thickness at each end. Front and back own the four vertical wall corners; left and right are shortened by one thickness at their front and back edges. The resulting butt-joint envelopes meet at the owner's inner plane rather than overlapping. Wave sample coordinates remain tied to the assembled cabinet, so shortening a blank crops the relief instead of stretching it.

The Output section lets the user select any combination of panels and creates a separate labeled file for each selection. On browsers with directory access, WaveGen3D creates a `<project>-dfm-panels` folder inside the chosen location; otherwise it falls back to individual browser downloads.

Each DFM STEP file contains one named `MANIFOLD_SOLID_BREP`. A wall panel has one spline relief face plus five explicit STEP `PLANE` surfaces. The top also has one spline face, whose border control points remain flat, plus five planes. The bottom has six `PLANE` surfaces. The single top spline favors watertight solid import over separately recognized planar trim faces.

This DFM path uses zero-clearance flush butt joints. It intentionally does not add rabbets, screw holes, driver cutouts, glue gaps, machining tolerances, or internal clearances yet.
