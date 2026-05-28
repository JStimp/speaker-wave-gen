# Exporter

The exporter is a Python CLI intended to run on Linux through Docker or WSL. It avoids loading OpenCascade/OCP in the Windows desktop app.

```bash
python -m pip install -e exporter
python -m wavecad_exporter --config examples/default-speaker.wavecad.json --out exports --format all --panel-mode separated
```

Outputs always include a JSON report and preview mesh. STL/OBJ are generated without external dependencies. STEP export is attempted when OCP is available.
