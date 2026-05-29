# CAD Export Notes

## Current Prototype

The static app exports:

- `.wavecad.json`
- `.obj`
- `.stl`
- `.png` preview screenshot

OBJ and STL are mesh exports for inspection and rough CAM experiments. They are not editable CAD surfaces. Mesh coordinates use the selected project units.

The exported mesh follows the current preview settings that affect geometry, including the flat-bottom option. In flat-bottom mode, the bottom surface stays on `Z=0`.

## STEP

STEP is not generated in the static prototype. Real STEP output needs a CAD kernel and belongs in a separate Docker exporter. See [STEP exporter plan](step-exporter-plan.md).

## Panel Strategy

The surface is generated as a full cuboid shell first. Panels can be derived later from face samples, which preserves matched relief along shared edges.
