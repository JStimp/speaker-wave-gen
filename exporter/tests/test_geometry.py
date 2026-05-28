import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from wavecad_exporter.__main__ import main
from wavecad_exporter.geometry import (
    compute_wave_displacement,
    dimensions,
    generate_preview_mesh,
    point_on_face,
)


def load_example():
    example_path = Path(__file__).resolve().parents[2] / "examples" / "default-speaker.wavecad.json"
    return json.loads(example_path.read_text(encoding="utf-8"))


class GeometryTests(unittest.TestCase):
    def test_front_right_edge_continuity(self):
        project = load_example()
        dims = dimensions(project)
        front = point_on_face("front", 1, 0.42, dims)
        right = point_on_face("right", 0, 0.42, dims)

        front_height = compute_wave_displacement(front, project)["displacement"]
        right_height = compute_wave_displacement(right, project)["displacement"]

        self.assertAlmostEqual(front_height, right_height, places=9)

    def test_preview_mesh_is_finite(self):
        project = load_example()
        mesh = generate_preview_mesh(project, resolution="draft")

        self.assertGreater(mesh["summary"]["vertexCount"], 0)
        self.assertGreater(mesh["summary"]["triangleCount"], 0)
        self.assertTrue(all(isinstance(value, (int, float)) for value in mesh["vertices"]))

    def test_cli_writes_fallback_outputs(self):
        project_path = Path(__file__).resolve().parents[2] / "examples" / "default-speaker.wavecad.json"

        with TemporaryDirectory() as temp:
            code = main(["--config", str(project_path), "--out", temp, "--format", "obj", "--panel-mode", "separated"])
            out_dir = Path(temp)

            self.assertEqual(code, 0)
            self.assertTrue((out_dir / "preview_mesh.json").exists())
            self.assertTrue((out_dir / "cabinet_preview.obj").exists())
            self.assertTrue((out_dir / "panels" / "front_panel.obj").exists())
            self.assertTrue((out_dir / "export_report.json").exists())


if __name__ == "__main__":
    unittest.main()

