# CAD Export Notes

## Current Prototype

The static app exports:

- `.wavecad.json`
- `.obj`
- `.stl`
- `.step`
- `.png` preview screenshot

OBJ and STL are mesh exports for inspection and rough CAM experiments. They are not editable CAD surfaces. Mesh coordinates use the selected project units.

OBJ, STL, and STEP exports rebuild from the selected export quality rather than the live preview resolution. The exported geometry follows settings such as corner wrap and flat-bottom mode. In flat-bottom mode, the bottom surface stays on `Z=0` and side relief fades to zero at the floor edge so the exported body closes cleanly.

## STEP

The static prototype includes two in-house STEP modes:

- Smooth surface solid: a BREP shell built from spline surface faces. This is the default and should be much friendlier in SolidWorks than triangle-facet STEP.
- Faceted solid fallback: a triangular BREP retained for troubleshooting import problems.

This is not the final analytic CAD target. Clean editable CAD surfaces and separated panel STEP files still need a CAD-kernel exporter. See [STEP exporter plan](step-exporter-plan.md).

## Panel Strategy

The surface is generated as a full cuboid shell first. Panels can be derived later from face samples, which preserves matched relief along shared edges.
