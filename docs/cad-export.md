# CAD Export Notes

## Current Prototype

The static app exports:

- `.wavecad.json`
- `.obj`
- `.stl`
- `.png` preview screenshot

OBJ and STL are mesh exports for inspection and rough CAM experiments. They are not editable CAD surfaces.

The exported mesh follows the current preview settings that affect geometry, including the flat-bottom option.

## STEP

STEP is not generated in the static prototype. Real STEP output needs a CAD kernel and belongs in a separate Docker exporter. See [STEP exporter plan](step-exporter-plan.md).

## Panel Strategy

The surface is generated as a full cuboid shell first. Panels can be derived later from face samples, which preserves matched relief along shared edges.
