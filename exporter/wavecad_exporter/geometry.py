from __future__ import annotations

import copy
import math
from typing import Iterable

FACE_NAMES = ["front", "back", "left", "right", "top", "bottom"]
RESOLUTION_PRESETS = {
    "draft": 14,
    "low": 22,
    "medium": 34,
    "high": 54,
    "ultra": 82,
}


def normalize_project(project: dict) -> dict:
    result = copy.deepcopy(project)
    result.setdefault("drivers", [])
    result.setdefault("manualSources", [])
    result.setdefault("preview", {})
    result.setdefault("panelization", {})
    result.setdefault("waves", {})
    result["preview"].setdefault("resolution", "medium")
    result["waves"].setdefault("baseAmplitude", 1)
    result["waves"].setdefault("normalization", "softClip")
    result["waves"].setdefault("reliefDepth", 5.5)
    result["waves"].setdefault("reliefBias", 0)
    return result


def dimensions(project: dict) -> dict:
    return project["cabinet"]["dimensions"]


def point_on_face(face: str, u: float, v: float, dims: dict) -> dict:
    width = dims["width"]
    height = dims["height"]
    depth = dims["depth"]
    x_linear = (u - 0.5) * width
    y_linear = (v - 0.5) * height
    z_from_front = depth / 2 - u * depth
    z_from_front_by_v = depth / 2 - v * depth

    if face == "front":
        return _point(face, u, v, x_linear, y_linear, depth / 2, (0, 0, 1))
    if face == "back":
        return _point(face, u, v, (0.5 - u) * width, y_linear, -depth / 2, (0, 0, -1))
    if face == "right":
        return _point(face, u, v, width / 2, y_linear, z_from_front, (1, 0, 0))
    if face == "left":
        return _point(face, u, v, -width / 2, y_linear, z_from_front, (-1, 0, 0))
    if face == "top":
        return _point(face, u, v, x_linear, height / 2, z_from_front_by_v, (0, 1, 0))
    if face == "bottom":
        return _point(face, u, v, x_linear, -height / 2, z_from_front_by_v, (0, -1, 0))
    raise ValueError(f"Unknown face: {face}")


def _point(face: str, u: float, v: float, x: float, y: float, z: float, normal: tuple[float, float, float]) -> dict:
    return {
        "face": face,
        "uv": {"u": u, "v": v},
        "position": {"x": x, "y": y, "z": z},
        "normal": {"x": normal[0], "y": normal[1], "z": normal[2]},
    }


def collect_sources(project: dict) -> list[dict]:
    sources = []
    for driver in project.get("drivers", []):
        source = driver.get("source", {})
        if not source.get("enabled", False):
            continue
        sources.append(
            {
                "id": driver.get("id"),
                "label": driver.get("label", driver.get("id")),
                "kind": "driver",
                "face": driver.get("face", "front"),
                "center": driver.get("center", {}),
                "amplitude": source.get("amplitude", 0),
                "wavelength": source.get("wavelength", 1),
                "phase": source.get("phase", 0),
                "falloff": source.get("falloff", 0),
            }
        )

    for source in project.get("manualSources", []):
        if source.get("enabled", True) is False:
            continue
        sources.append(source)

    return [
        source
        for source in sources
        if isinstance(source.get("wavelength"), (int, float)) and source.get("wavelength", 0) > 0
    ]


def surface_distance_to_source(point: dict, source: dict, dims: dict) -> float:
    if source.get("face", "front") != "front":
        return euclidean_distance(point["position"], source.get("center", {}))
    return front_source_cuboid_distance(point, source, dims)


def front_source_cuboid_distance(point: dict, source: dict, dims: dict) -> float:
    width = dims["width"]
    height = dims["height"]
    depth = dims["depth"]
    half_w = width / 2
    half_h = height / 2
    half_d = depth / 2
    sx = source["center"].get("x", 0)
    sy = source["center"].get("y", 0)
    pos = point["position"]
    x = pos["x"]
    y = pos["y"]
    z = pos["z"]
    depth_from_front = half_d - z

    if point["face"] == "front":
        return distance2(x - sx, y - sy)
    if point["face"] == "right":
        return distance2(half_w + depth_from_front - sx, y - sy)
    if point["face"] == "left":
        return distance2(-half_w - depth_from_front - sx, y - sy)
    if point["face"] == "top":
        return distance2(x - sx, half_h + depth_from_front - sy)
    if point["face"] == "bottom":
        return distance2(x - sx, -half_h - depth_from_front - sy)
    if point["face"] == "back":
        via_right = distance2(half_w + depth + (half_w - x) - sx, y - sy)
        via_left = distance2(-half_w - depth - (x + half_w) - sx, y - sy)
        via_top = distance2(x - sx, half_h + depth + (half_h - y) - sy)
        via_bottom = distance2(x - sx, -half_h - depth - (y + half_h) - sy)
        return min(via_right, via_left, via_top, via_bottom)
    return euclidean_distance(pos, {"x": sx, "y": sy, "z": half_d})


def compute_wave_displacement(point: dict, project: dict) -> dict:
    dims = dimensions(project)
    waves = project.get("waves", {})
    raw = 0.0

    for source in collect_sources(project):
        distance = max(0.0001, surface_distance_to_source(point, source, dims))
        attenuation = math.exp(-source.get("falloff", 0) * distance)
        raw += (
            source.get("amplitude", 0)
            * math.sin((math.tau * distance) / source.get("wavelength", 1) + source.get("phase", 0))
            * attenuation
        )

    raw *= waves.get("baseAmplitude", 1)
    limit = max(0.001, waves.get("reliefDepth", 1))
    displacement = raw + waves.get("reliefBias", 0)

    if waves.get("normalization") == "softClip":
        displacement = math.tanh(displacement / limit) * limit
    elif waves.get("normalization") == "clamp":
        displacement = max(-limit, min(limit, displacement))

    return {"raw": raw, "displacement": displacement}


def generate_preview_mesh(project: dict, resolution: str | int | None = None, faces: Iterable[str] | None = None) -> dict:
    project = normalize_project(project)
    dims = dimensions(project)
    faces = list(faces or FACE_NAMES)
    resolution_value = resolution or project.get("preview", {}).get("resolution", "medium")
    base_cells = resolution_value if isinstance(resolution_value, int) else RESOLUTION_PRESETS.get(resolution_value, 34)
    vertices: list[float] = []
    normals: list[float] = []
    indices: list[int] = []
    heights: list[float] = []
    face_ids: list[str] = []
    face_ranges: dict[str, dict] = {}

    for face in faces:
        start_vertex = len(vertices) // 3
        columns, rows = grid_for_face(face, dims, base_cells)
        face_ranges[face] = {"startVertex": start_vertex, "columns": columns, "rows": rows}

        for row in range(rows + 1):
            for column in range(columns + 1):
                point = point_on_face(face, column / columns, row / rows, dims)
                wave = compute_wave_displacement(point, project)
                displaced = displace_point(point, wave["displacement"])
                vertices.extend([displaced["x"], displaced["y"], displaced["z"]])
                normals.extend([point["normal"]["x"], point["normal"]["y"], point["normal"]["z"]])
                heights.append(wave["displacement"])
                face_ids.append(face)

        for row in range(rows):
            for column in range(columns):
                a = start_vertex + row * (columns + 1) + column
                b = a + 1
                c = a + (columns + 1)
                d = c + 1
                indices.extend([a, c, b, b, c, d])

    return {
        "vertices": vertices,
        "normals": normals,
        "indices": indices,
        "heights": heights,
        "faceIds": face_ids,
        "faceRanges": face_ranges,
        "summary": mesh_summary({"vertices": vertices, "indices": indices, "heights": heights}),
    }


def generate_panel_meshes(project: dict) -> dict[str, dict]:
    project = normalize_project(project)
    include_back = project.get("panelization", {}).get("includeBack", False)
    faces = FACE_NAMES if include_back else [face for face in FACE_NAMES if face != "back"]
    return {face: generate_preview_mesh(project, faces=[face]) for face in faces}


def mesh_summary(mesh: dict) -> dict:
    heights = mesh.get("heights", [])
    return {
        "vertexCount": len(mesh.get("vertices", [])) // 3,
        "triangleCount": len(mesh.get("indices", [])) // 3,
        "minHeight": min(heights) if heights else 0,
        "maxHeight": max(heights) if heights else 0,
    }


def grid_for_face(face: str, dims: dict, base_cells: int) -> tuple[int, int]:
    face_width, face_height = face_size(face, dims)
    longest = max(dims["width"], dims["height"], dims["depth"])
    columns = max(3, round((face_width / longest) * base_cells))
    rows = max(3, round((face_height / longest) * base_cells))
    return columns, rows


def face_size(face: str, dims: dict) -> tuple[float, float]:
    if face in ("front", "back"):
        return dims["width"], dims["height"]
    if face in ("left", "right"):
        return dims["depth"], dims["height"]
    if face in ("top", "bottom"):
        return dims["width"], dims["depth"]
    raise ValueError(f"Unknown face: {face}")


def displace_point(point: dict, displacement: float) -> dict:
    position = point["position"]
    normal = point["normal"]
    return {
        "x": position["x"] + normal["x"] * displacement,
        "y": position["y"] + normal["y"] * displacement,
        "z": position["z"] + normal["z"] * displacement,
    }


def distance2(dx: float, dy: float) -> float:
    return math.sqrt(dx * dx + dy * dy)


def euclidean_distance(a: dict, b: dict) -> float:
    dx = a.get("x", 0) - b.get("x", 0)
    dy = a.get("y", 0) - b.get("y", 0)
    dz = a.get("z", 0) - b.get("z", 0)
    return math.sqrt(dx * dx + dy * dy + dz * dz)

