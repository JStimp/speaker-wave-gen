# CAD Export Notes

## Current Prototype

The static app exports:

- `.wavecad.json`
- `.obj`
- `.stl`
- `.step`
- `.png` preview screenshot

OBJ and STL are mesh exports for inspection and rough CAM experiments. They are not editable CAD surfaces. Mesh coordinates use the selected project units.

OBJ, STL, and STEP exports rebuild from the selected export quality rather than the live preview resolution. The exported mesh follows geometry settings such as flat-bottom mode. In flat-bottom mode, the bottom surface stays on `Z=0`.

## STEP

The static prototype includes an experimental in-house faceted STEP export. It writes a STEP BREP made from triangular faces, which is useful for testing CAD import and workflow expectations.

This is not the final analytic CAD target. Clean editable CAD surfaces and separated panel STEP files still need a CAD-kernel exporter. See [STEP exporter plan](step-exporter-plan.md).

## Panel Strategy

The surface is generated as a full cuboid shell first. Panels can be derived later from face samples, which preserves matched relief along shared edges.
