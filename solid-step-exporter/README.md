# WaveGen3D Solid STEP Exporter

This is the Docker-only CAD-kernel export experiment. The normal browser app still opens directly with `Launch-WaveGen3D.bat`, does not require Docker, and currently uses the browser solid STEP path as the primary prototype output.

## Output

The exporter reads a `.wavecad.json` project and writes:

- `exports/outer-solid.step`
- `exports/outer-solid.report.json`
- `exports/outer-surfaces-debug.step` when sewing or validation needs inspection

The first implementation targets one outer solid block. Hollow wall thickness, driver cutouts, and separated CNC panels are later steps.

## Windows Use

Double-click `Export-Solid-Step.bat`, or drag a `.wavecad.json` file onto it.

The script builds a local Docker image named `wavegen3d-solid-step:latest` and runs the exporter with the selected project mounted read-only.

## Direct Docker Use

```powershell
docker build -t wavegen3d-solid-step:latest -f solid-step-exporter/Dockerfile solid-step-exporter
docker run --rm -v "${PWD}\examples:/input:ro" -v "${PWD}\exports:/output" wavegen3d-solid-step:latest /input/default-speaker.wavecad.json --output-dir /output --debug-surfaces
```

## Report Meaning

- `success`: true only when OpenCascade validates one solid and the written STEP re-imports as one solid.
- `freeEdges`: should be zero. Any nonzero value means SolidWorks may import surfaces.
- `validSolid`: OpenCascade's solid validity result before STEP write.
- `importedSolidCount`: solid count after re-reading the generated STEP inside the exporter container.
