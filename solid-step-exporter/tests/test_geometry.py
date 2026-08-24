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
    normalize_project,
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
    top_center = point_on_face("top", 0.5, 0.5, dims, project)
    top_border = point_on_face("top", 0.02, 0.5, dims, project)
    top_blend_mid = point_on_face(
        "top", (project["waves"]["topFlatBorder"] + project["waves"]["topWaveBlend"] / 2) / dims["width"], 0.5, dims, project
    )
    lower_cap_seam = point_on_face("front", 0.5, dims["wallThickness"] / dims["height"], dims, project)
    upper_cap_seam = point_on_face("front", 0.5, 1 - dims["wallThickness"] / dims["height"], dims, project)
    unmasked_top_project = json.loads(json.dumps(project))
    unmasked_top_project["waves"]["topFlatBorder"] = 0
    unmasked_top_project["waves"]["topWaveBlend"] = 0
    oversized_border_project = json.loads(json.dumps(project))
    oversized_border_project["waves"]["topFlatBorder"] = 100000
    oversized_border_project["waves"]["topWaveBlend"] = 100000
    migrated_project = normalize_project({"waves": {"surfaceMode": "fourWallFlatCaps"}})
    top_center_height = compute_wave_displacement(top_center, project)["displacement"]
    top_border_height = compute_wave_displacement(top_border, project)["displacement"]
    top_blend_mid_height = compute_wave_displacement(top_blend_mid, project)["displacement"]
    unmasked_top_blend_mid_height = compute_wave_displacement(top_blend_mid, unmasked_top_project)["displacement"]
    oversized_border_height = compute_wave_displacement(top_center, oversized_border_project)["displacement"]

    check(project["units"] == "in", "default project should use inches")
    check(abs(front_height - right_height) < 1e-9, "front/right seam heights should match")
    check(project["waves"]["surfaceMode"] == "fourWallsInsetTop", "surface mode should use an inset waved top")
    check(migrated_project["waves"]["surfaceMode"] == "fourWallsInsetTop", "legacy flat-cap mode should migrate")
    check(abs(front_bottom.position["y"] - dims["depth"] / 2) < 1e-12, "wall should stay square at bottom cap")
    check(abs(front_bottom.position["z"]) < 1e-12, "wall should meet the bottom plane")
    check(abs(bottom_center.position["z"]) < 1e-12, "bottom contact patch should stay on Z0")
    check(abs(top_center.position["z"] - dims["height"]) < 1e-12, "top cap should stay planar")
    check(abs(compute_wave_displacement(bottom_center, project)["displacement"]) < 1e-12, "bottom cap should have no waves")
    check(abs(top_center_height) > 1e-5, "top center should receive waves")
    check(abs(top_border_height) < 1e-12, "top perimeter should stay flat")
    check(abs(top_blend_mid_height) > 1e-5, "top transition should receive partial waves")
    check(abs(top_blend_mid_height) < abs(unmasked_top_blend_mid_height), "top transition should attenuate waves")
    check(math.isfinite(oversized_border_height) and abs(oversized_border_height) < 1e-12, "oversized border should clamp flat")
    check(abs(compute_wave_displacement(lower_cap_seam, project)["displacement"]) < 1e-12, "lower cap seam should be flush")
    check(abs(compute_wave_displacement(upper_cap_seam, project)["displacement"]) < 1e-12, "upper cap seam should be flush")
    check(grids["summary"]["deviation"] > 0, "summary should include relief deviation")
    check(abs(converted["summary"]["bottomCenterZ"]) < 1e-9, "converted bottom contact patch should stay on Z0")
    check(abs(converted["summary"]["frontBottomZ"]) < 1e-9, "converted wall should meet the bottom plane")

    print(json.dumps({"ok": True, "deviation": grids["summary"]["deviation"], "frontBottomZ": grids["summary"]["frontBottomZ"]}))


if __name__ == "__main__":
    main()
