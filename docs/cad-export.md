# CAD Export Notes

## Preferred workflow

```text
.wavecad.json
  -> Linux exporter
  -> full cabinet STEP
  -> separated panel STEP files
  -> SolidWorks or Mastercam
```

STEP is the primary target because it preserves topology better than STL and is more reliable for SolidWorks/Mastercam workflows.

## Fallback workflow

When OpenCascade/OCP is unavailable, the exporter still writes:

- preview mesh JSON
- cabinet OBJ
- cabinet STL
- separated panel OBJ/STL files
- export report with warnings

These mesh outputs are useful for preview and fit checks, but they are not a replacement for editable CAD surfaces.

## Panel strategy

The core surface is generated first. Panels are derived from face samples after wave evaluation, so shared edges receive the same relief height. This avoids the v1 problem where independently generated panels did not meet visually at corners.

## Imported geometry

- STEP imports are the preferred route for editable CAD bodies.
- STL imports are supported as reference/preview geometry first.
- Complex STL-to-STEP reconstruction is explicitly treated as a later capability because clean CAD surfaces matter more than mesh conversion.

