# WaveGen3D Solid STEP Exporter

This is the Docker-only CAD-kernel export path for SolidWorks. The normal browser app still opens directly with `Launch-WaveGen3D.bat` and does not require Docker.

## Output

The exporter reads a `.wavecad.json` project and writes:

- `exports/outer-solid.step`
- `exports/outer-solid.report.json`
- `exports/outer-surfaces-debug.step` when sewing or validation needs inspection
- `exports/outer-faceted-debug.step` if the fallback path also needs inspection

The exporter runs in `auto` mode by default: it tries the smoother spline-surface sew first, then writes a watertight faceted solid fallback if the smooth shell has free edges or does not re-import as one solid. The first implementation targets one outer solid block. Hollow wall thickness, driver cutouts, and separated CNC panels are later steps.

## Windows Use

Double-click `Export-Solid-Step.bat`, or drag a `.wavecad.json` file onto it.

The script builds a local Docker image named `wavegen3d-solid-step:latest` and runs the exporter with the selected project mounted read-only.

## Direct Docker Use

```powershell
docker build -t wavegen3d-solid-step:latest -f solid-step-exporter/Dockerfile solid-step-exporter
docker run --rm -v "${PWD}\examples:/input:ro" -v "${PWD}\exports:/output" wavegen3d-solid-step:latest /input/default-speaker.wavecad.json --output-dir /output --debug-surfaces --mode auto
```

## Report Meaning

- `success`: true only when OpenCascade validates one solid and the written STEP re-imports as one solid.
- `mode`: `smooth` means the spline sew worked; `facetedFallback` means the exported STEP is a solid body made from planar facets.
- `freeEdges`: should be zero. Any nonzero value means SolidWorks may import surfaces.
- `validSolid`: OpenCascade's solid validity result before STEP write.
- `importedSolidCount`: solid count after re-reading the generated STEP inside the exporter container.
