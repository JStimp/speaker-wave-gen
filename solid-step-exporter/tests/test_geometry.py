import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from wavegen_solid_exporter.geometry import (  # noqa: E402
    compute_wave_displacement,
    convert_grid_units,
    dimensions,
    generate_surface_grids,
    load_project,
    point_on_face,
)


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    project = load_project(Path(__file__).resolve().parents[2] / "examples" / "default-speaker.wavecad.json")
    dims = dimensions(project)
    grids = generate_surface_grids(project, resolution="draft", control_limit=12)
    converted = convert_grid_units(grids, 25.4 if project["units"] == "in" else 1)

    front = point_on_face("front", 1, 0.42, dims, project)
    right = point_on_face("right", 0, 0.42, dims, project)
    front_height = compute_wave_displacement(front, project)["displacement"]
    right_height = compute_wave_displacement(right, project)["displacement"]
    front_bottom = point_on_face("front", 0.37, 0, dims, project)
    bottom_center = point_on_face("bottom", 0.5, 0.5, dims, project)

    check(project["units"] == "in", "default project should use inches")
    check(abs(front_height - right_height) < 1e-9, "front/right seam heights should match")
    check(front_bottom.position["y"] < dims["depth"] / 2, "bottom perimeter should round inward")
    check(front_bottom.position["z"] > 0, "bottom perimeter should round upward")
    check(abs(bottom_center.position["z"]) < 1e-12, "bottom contact patch should stay on Z0")
    check(grids["summary"]["deviation"] > 0, "summary should include relief deviation")
    check(abs(converted["summary"]["bottomCenterZ"]) < 1e-9, "converted bottom contact patch should stay on Z0")
    check(converted["summary"]["frontBottomZ"] > 0, "converted lower perimeter should stay lifted")

    print(json.dumps({"ok": True, "deviation": grids["summary"]["deviation"], "frontBottomZ": grids["summary"]["frontBottomZ"]}))


if __name__ == "__main__":
    main()
