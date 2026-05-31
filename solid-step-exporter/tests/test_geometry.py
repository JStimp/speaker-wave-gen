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
    generate_faceted_mesh,
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
    mesh = generate_faceted_mesh(project, resolution="draft")
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
    check(mesh["summary"]["triangleCount"] > 0, "faceted fallback mesh should include triangles")
    check(mesh["summary"]["minZ"] >= -1e-9, "faceted fallback mesh should not dip below Z0")
    check(all(math.isfinite(value) for vertex in mesh["vertices"] for value in vertex.values()), "faceted fallback mesh vertices should be finite")
    check_mesh_is_closed(mesh)

    print(json.dumps({
        "ok": True,
        "deviation": grids["summary"]["deviation"],
        "frontBottomZ": grids["summary"]["frontBottomZ"],
        "facetedTriangles": mesh["summary"]["triangleCount"],
    }))


def check_mesh_is_closed(mesh):
    vertices = mesh["vertices"]
    edge_counts = {}

    def key(index):
        point = vertices[index]
        return (round(point["x"], 10), round(point["y"], 10), round(point["z"], 10))

    for triangle in mesh["triangles"]:
        for a, b in ((triangle[0], triangle[1]), (triangle[1], triangle[2]), (triangle[2], triangle[0])):
            edge = tuple(sorted((key(a), key(b))))
            edge_counts[edge] = edge_counts.get(edge, 0) + 1

    boundary_edges = [edge for edge, count in edge_counts.items() if count == 1]
    nonmanifold_edges = [edge for edge, count in edge_counts.items() if count > 2]
    check(not boundary_edges, "faceted fallback mesh should not have boundary edges")
    check(not nonmanifold_edges, "faceted fallback mesh should not have non-manifold edges")
    check_edges_are_consistently_oriented(mesh)


def check_edges_are_consistently_oriented(mesh):
    vertices = mesh["vertices"]
    edge_balance = {}

    def key(index):
        point = vertices[index]
        return (round(point["x"], 10), round(point["y"], 10), round(point["z"], 10))

    for triangle in mesh["triangles"]:
        for a, b in ((triangle[0], triangle[1]), (triangle[1], triangle[2]), (triangle[2], triangle[0])):
            start = key(a)
            end = key(b)
            edge = tuple(sorted((start, end)))
            edge_balance[edge] = edge_balance.get(edge, 0) + (1 if (start, end) == edge else -1)

    bad_edges = [edge for edge, balance in edge_balance.items() if balance != 0]
    check(not bad_edges, "faceted fallback mesh edges should have opposite winding across neighbors")


if __name__ == "__main__":
    main()
