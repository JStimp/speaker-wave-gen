import copy
import json
import math
from dataclasses import dataclass
from pathlib import Path


FACE_NAMES = ["front", "back", "left", "right", "top", "bottom"]
FACE_OUTWARD_NORMALS = {
    "front": (0, 1, 0),
    "back": (0, -1, 0),
    "left": (-1, 0, 0),
    "right": (1, 0, 0),
    "top": (0, 0, 1),
    "bottom": (0, 0, -1),
}
RESOLUTION_PRESETS = {
    "draft": 10,
    "low": 16,
    "medium": 24,
    "high": 36,
    "ultra": 56,
    "fine": 80,
    "production": 112,
}

DEFAULT_PROJECT = {
    "schemaVersion": 1,
    "units": "in",
    "project": {"name": "Default two-driver wave speaker", "notes": "Static browser prototype."},
    "cabinet": {
        "preset": "rectangular",
        "cornerWrap": 0.18,
        "dimensions": {"width": 20.5, "height": 30, "depth": 13.5, "wallThickness": 0.75},
    },
    "drivers": [
        {
            "id": "woofer",
            "label": "Woofer",
            "face": "front",
            "center": {"x": 0, "z": 10.25},
            "diameter": 8.5,
            "source": {"enabled": True, "amplitude": 0.14, "wavelength": 4.65, "phase": 0, "falloff": 0.046},
        },
        {
            "id": "tweeter",
            "label": "Tweeter",
            "face": "front",
            "center": {"x": 0, "z": 22},
            "diameter": 3.6,
            "source": {"enabled": True, "amplitude": 0.07, "wavelength": 2.85, "phase": 0.75, "falloff": 0.056},
        },
    ],
    "manualSources": [],
    "waves": {
        "baseAmplitude": 1,
        "normalization": "softClip",
        "reliefDepth": 0.22,
        "reliefBias": 0,
        "flatBottom": True,
        "minThickness": 0.47,
    },
    "preview": {"resolution": "high"},
    "export": {"resolution": "production", "solidResolution": "fine", "solidSurfaceControlLimit": 34},
}


@dataclass
class SurfacePoint:
    face: str
    u: float
    v: float
    position: dict
    normal: dict
    corner_wrapped: bool = False


def load_project(path):
    return normalize_project(json.loads(Path(path).read_text(encoding="utf-8")))


def normalize_project(project):
    result = merge_deep(copy.deepcopy(DEFAULT_PROJECT), project or {})
    result["drivers"] = result["drivers"] if isinstance(result.get("drivers"), list) else []
    result["manualSources"] = result["manualSources"] if isinstance(result.get("manualSources"), list) else []
    dims = dimensions(result)
    for driver in result["drivers"]:
        normalize_source_center(driver.get("center"), dims)
    for source in result["manualSources"]:
        normalize_source_center(source.get("center"), dims)
    return result


def normalize_source_center(center, dims):
    if not isinstance(center, dict):
        return
    if not is_finite(center.get("z")):
        center["z"] = float(center.get("y", 0)) + dims["height"] / 2 if is_finite(center.get("y")) else dims["height"] / 2
    center["x"] = float(center.get("x") or 0)
    center["z"] = float(center.get("z") or 0)


def merge_deep(base, patch):
    if not isinstance(patch, dict):
        return base
    for key, value in patch.items():
        if isinstance(base.get(key), dict) and isinstance(value, dict):
            base[key] = merge_deep(base[key], value)
        else:
            base[key] = value
    return base


def dimensions(project):
    dims = project["cabinet"]["dimensions"]
    return {
        "width": float(dims["width"]),
        "height": float(dims["height"]),
        "depth": float(dims["depth"]),
        "wallThickness": float(dims["wallThickness"]),
    }


def point_on_face(face, u, v, dims, project):
    width = dims["width"]
    height = dims["height"]
    depth = dims["depth"]
    x_linear = (u - 0.5) * width
    z_linear = v * height
    y_from_front = depth / 2 - u * depth
    y_from_front_by_v = depth / 2 - v * depth

    if face == "front":
        return apply_corner_wrap(make_point(face, u, v, x_linear, depth / 2, z_linear, [0, 1, 0]), dims, project)
    if face == "back":
        return apply_corner_wrap(make_point(face, u, v, (0.5 - u) * width, -depth / 2, z_linear, [0, -1, 0]), dims, project)
    if face == "right":
        return apply_corner_wrap(make_point(face, u, v, width / 2, y_from_front, z_linear, [1, 0, 0]), dims, project)
    if face == "left":
        return apply_corner_wrap(make_point(face, u, v, -width / 2, y_from_front, z_linear, [-1, 0, 0]), dims, project)
    if face == "top":
        return apply_corner_wrap(make_point(face, u, v, x_linear, y_from_front_by_v, height, [0, 0, 1]), dims, project)
    if face == "bottom":
        return apply_corner_wrap(make_point(face, u, v, x_linear, y_from_front_by_v, 0, [0, 0, -1]), dims, project)
    raise ValueError(f"Unknown face: {face}")


def apply_corner_wrap(point, dims, project):
    wrap = clamp01(float(project.get("cabinet", {}).get("cornerWrap") or 0))
    radius = max(0, min(dims["width"], dims["depth"], dims["height"]) * 0.22) * wrap
    if radius <= 0.000001:
        return point

    p = point.position
    hx = dims["width"] / 2
    hy = dims["depth"] / 2
    h = dims["height"]
    qx = clamp(p["x"], -hx + radius, hx - radius)
    qy = clamp(p["y"], -hy + radius, hy - radius)
    qz = clamp(p["z"], radius, h - radius)
    vx = p["x"] - qx
    vy = p["y"] - qy
    vz = p["z"] - qz
    length = math.sqrt(vx * vx + vy * vy + vz * vz)
    if length <= 0.000001:
        return point

    effective_radius = min(length, radius)
    nx = vx / length
    ny = vy / length
    nz = vz / length
    point.position = {"x": qx + nx * effective_radius, "y": qy + ny * effective_radius, "z": qz + nz * effective_radius}
    point.normal = {"x": nx, "y": ny, "z": nz}
    point.corner_wrapped = True
    return point


def make_point(face, u, v, x, y, z, normal):
    return SurfacePoint(face=face, u=u, v=v, position={"x": x, "y": y, "z": z}, normal={"x": normal[0], "y": normal[1], "z": normal[2]})


def face_size(face, dims):
    if face in ("front", "back"):
        return {"width": dims["width"], "height": dims["height"]}
    if face in ("left", "right"):
        return {"width": dims["depth"], "height": dims["height"]}
    if face in ("top", "bottom"):
        return {"width": dims["width"], "height": dims["depth"]}
    raise ValueError(f"Unknown face: {face}")


def collect_sources(project):
    sources = []
    for index, driver in enumerate(project.get("drivers", [])):
        source = driver.get("source") or {}
        if not source.get("enabled", False):
            continue
        center = driver.get("center") or {}
        sources.append({
            "key": f"driver:{index}",
            "kind": "driver",
            "face": driver.get("face") or "front",
            "center": {"x": float(center.get("x") or 0), "z": float(center.get("z") or 0)},
            "amplitude": float(source.get("amplitude") or 0),
            "wavelength": max(0.001, float(source.get("wavelength") or 1)),
            "phase": float(source.get("phase") or 0),
            "falloff": max(0, float(source.get("falloff") or 0)),
        })
    for index, source in enumerate(project.get("manualSources", [])):
        if source.get("enabled", True) is False:
            continue
        center = source.get("center") or {}
        sources.append({
            "key": f"manual:{index}",
            "kind": "manual",
            "face": source.get("face") or "front",
            "center": {"x": float(center.get("x") or 0), "z": float(center.get("z") or 0)},
            "amplitude": float(source.get("amplitude") or 0),
            "wavelength": max(0.001, float(source.get("wavelength") or 1)),
            "phase": float(source.get("phase") or 0),
            "falloff": max(0, float(source.get("falloff") or 0)),
        })
    return sources


def surface_distance_to_source(point, source, dims):
    if (source.get("face") or "front") != "front":
        center = source["center"]
        return distance3(point.position, {"x": center.get("x", 0), "y": center.get("y", 0), "z": center.get("z", 0)})
    if point.corner_wrapped:
        center = source["center"]
        return distance3(point.position, {"x": center["x"], "y": dims["depth"] / 2, "z": center["z"]})
    return front_source_cuboid_distance(point, source, dims)


def front_source_cuboid_distance(point, source, dims):
    half_w = dims["width"] / 2
    half_d = dims["depth"] / 2
    sx = source["center"]["x"]
    sz = source["center"]["z"]
    p = point.position
    depth_from_front = half_d - p["y"]
    if point.face == "front":
        return distance2(p["x"] - sx, p["z"] - sz)
    if point.face == "right":
        return distance2(half_w + depth_from_front - sx, p["z"] - sz)
    if point.face == "left":
        return distance2(-half_w - depth_from_front - sx, p["z"] - sz)
    if point.face == "top":
        return distance2(p["x"] - sx, dims["height"] + depth_from_front - sz)
    if point.face == "bottom":
        return distance2(p["x"] - sx, -depth_from_front - sz)
    if point.face == "back":
        return min(
            distance2(half_w + dims["depth"] + (half_w - p["x"]) - sx, p["z"] - sz),
            distance2(-half_w - dims["depth"] - (p["x"] + half_w) - sx, p["z"] - sz),
            distance2(p["x"] - sx, dims["height"] + dims["depth"] + (dims["height"] - p["z"]) - sz),
            distance2(p["x"] - sx, -dims["depth"] - p["z"] - sz),
        )
    return distance3(p, {"x": sx, "y": half_d, "z": sz})


def compute_wave_displacement(point, project):
    dims = dimensions(project)
    waves = project["waves"]
    if point.face == "bottom" and waves.get("flatBottom"):
        return {"raw": 0, "displacement": 0}

    raw = 0
    for source in collect_sources(project):
        distance = max(0.0001, surface_distance_to_source(point, source, dims))
        attenuation = math.exp(-source["falloff"] * distance)
        raw += source["amplitude"] * math.sin((math.pi * 2 * distance) / source["wavelength"] + source["phase"]) * attenuation
    raw *= float(waves.get("baseAmplitude") or 1)

    requested_limit = max(0.001, float(waves.get("reliefDepth") or 1))
    wall_limit = max(0.001, dims["wallThickness"] - float(waves.get("minThickness") or 0))
    limit = min(requested_limit, wall_limit)
    displacement = raw + float(waves.get("reliefBias") or 0)
    if waves.get("normalization") == "softClip":
        displacement = math.tanh(displacement / limit) * limit
    elif waves.get("normalization") == "clamp":
        displacement = clamp(displacement, -limit, limit)

    if waves.get("flatBottom"):
        displacement = apply_flat_bottom_transition(point, dims, displacement, limit)
    return {"raw": raw, "displacement": displacement}


def apply_flat_bottom_transition(point, dims, displacement, limit):
    fade_height = min(dims["height"] * 0.12, max(limit * 2.5, dims["wallThickness"] * 0.5 or limit))
    floor_blend = smoothstep(0, fade_height, point.position["z"])
    if point.face in ("bottom", "top"):
        return displacement * floor_blend
    if displacement <= 0:
        return displacement * floor_blend
    lift_blend = smoothstep(0, max(fade_height * 0.35, 0.0001), point.position["z"])
    inward_curl = math.sin(math.pi * floor_blend) * lift_blend
    return displacement * floor_blend * floor_blend - abs(displacement) * inward_curl * 0.55


def generate_surface_grids(project, resolution=None, control_limit=None):
    normalized = normalize_project(project)
    dims = dimensions(normalized)
    resolution = resolution or normalized.get("export", {}).get("solidResolution") or normalized.get("export", {}).get("resolution") or "fine"
    base_cells = resolution if isinstance(resolution, int) else RESOLUTION_PRESETS.get(str(resolution), RESOLUTION_PRESETS["fine"])
    control_limit = int(control_limit or normalized.get("export", {}).get("solidSurfaceControlLimit") or 34)
    grids = {}
    heights = []
    for face in FACE_NAMES:
        grid = grid_for_face(face, dims, base_cells)
        sampled_columns = sample_indices(grid["columns"], control_limit)
        sampled_rows = sample_indices(grid["rows"], control_limit)
        points = []
        face_heights = []
        for row in sampled_rows:
            point_row = []
            height_row = []
            for column in sampled_columns:
                point = point_on_face(face, column / grid["columns"], row / grid["rows"], dims, normalized)
                wave = compute_wave_displacement(point, normalized)
                displaced = displace_point(point, wave["displacement"])
                point_row.append(displaced)
                height_row.append(wave["displacement"])
                heights.append(wave["displacement"])
            points.append(point_row)
            face_heights.append(height_row)
        grids[face] = {
            "points": points,
            "heights": face_heights,
            "columns": len(sampled_columns) - 1,
            "rows": len(sampled_rows) - 1,
            "sourceColumns": grid["columns"],
            "sourceRows": grid["rows"],
        }
    return {"project": normalized, "dimensions": dims, "faces": grids, "summary": summarize(grids, heights)}


def generate_faceted_mesh(project, resolution=None):
    normalized = normalize_project(project)
    dims = dimensions(normalized)
    resolution = (
        resolution
        or normalized.get("export", {}).get("solidFacetResolution")
        or normalized.get("export", {}).get("solidResolution")
        or normalized.get("export", {}).get("resolution")
        or "fine"
    )
    base_cells = resolution if isinstance(resolution, int) else RESOLUTION_PRESETS.get(str(resolution), RESOLUTION_PRESETS["fine"])
    vertices = []
    triangles = []
    heights = []
    face_ranges = {}

    for face in FACE_NAMES:
        grid = grid_for_face(face, dims, base_cells)
        start_vertex = len(vertices)
        face_ranges[face] = {"startVertex": start_vertex, "columns": grid["columns"], "rows": grid["rows"]}

        for row in range(grid["rows"] + 1):
            for column in range(grid["columns"] + 1):
                point = point_on_face(face, column / grid["columns"], row / grid["rows"], dims, normalized)
                wave = compute_wave_displacement(point, normalized)
                vertices.append(displace_point(point, wave["displacement"]))
                heights.append(wave["displacement"])

        for row in range(grid["rows"]):
            for column in range(grid["columns"]):
                a = start_vertex + row * (grid["columns"] + 1) + column
                b = a + 1
                c = a + grid["columns"] + 1
                d = c + 1
                add_oriented_triangle(triangles, vertices, a, c, b, face)
                add_oriented_triangle(triangles, vertices, b, c, d, face)

    add_bottom_transition_faces(triangles, vertices, face_ranges)

    return {
        "project": normalized,
        "dimensions": dims,
        "vertices": vertices,
        "triangles": triangles,
        "faceRanges": face_ranges,
        "summary": summarize_faceted_mesh(vertices, triangles, heights),
    }


def add_oriented_triangle(triangles, vertices, a, b, c, face):
    expected = FACE_OUTWARD_NORMALS[face]
    normal = triangle_normal(vertices[a], vertices[b], vertices[c])
    if dot3(normal, expected) < 0:
        triangles.append([a, c, b])
    else:
        triangles.append([a, b, c])


def add_bottom_transition_faces(triangles, vertices, ranges):
    bottom = ranges["bottom"]
    front = ranges["front"]
    back = ranges["back"]
    left = ranges["left"]
    right = ranges["right"]

    add_transition_strip(
        triangles,
        vertices,
        edge_indices(front, 0, "row"),
        edge_indices(bottom, 0, "row"),
        "front",
    )
    add_transition_strip(
        triangles,
        vertices,
        edge_indices(back, 0, "row"),
        list(reversed(edge_indices(bottom, bottom["rows"], "row"))),
        "back",
    )
    add_transition_strip(
        triangles,
        vertices,
        edge_indices(left, 0, "row"),
        edge_indices(bottom, 0, "column"),
        "left",
    )
    add_transition_strip(
        triangles,
        vertices,
        edge_indices(right, 0, "row"),
        edge_indices(bottom, bottom["columns"], "column"),
        "right",
    )


def edge_indices(face_range, fixed_index, direction):
    if direction == "row":
        return [vertex_index(face_range, fixed_index, column) for column in range(face_range["columns"] + 1)]
    return [vertex_index(face_range, row, fixed_index) for row in range(face_range["rows"] + 1)]


def vertex_index(face_range, row, column):
    return face_range["startVertex"] + row * (face_range["columns"] + 1) + column


def add_transition_strip(triangles, vertices, side_edge, bottom_edge, face):
    count = min(len(side_edge), len(bottom_edge))
    for index in range(count - 1):
        side_a = side_edge[index]
        side_b = side_edge[index + 1]
        bottom_a = bottom_edge[index]
        bottom_b = bottom_edge[index + 1]
        add_oriented_triangle(triangles, vertices, side_a, bottom_a, side_b, face)
        add_oriented_triangle(triangles, vertices, side_b, bottom_a, bottom_b, face)


def triangle_normal(a, b, c):
    ab = {"x": b["x"] - a["x"], "y": b["y"] - a["y"], "z": b["z"] - a["z"]}
    ac = {"x": c["x"] - a["x"], "y": c["y"] - a["y"], "z": c["z"] - a["z"]}
    return {
        "x": ab["y"] * ac["z"] - ab["z"] * ac["y"],
        "y": ab["z"] * ac["x"] - ab["x"] * ac["z"],
        "z": ab["x"] * ac["y"] - ab["y"] * ac["x"],
    }


def dot3(a, b):
    return a["x"] * b[0] + a["y"] * b[1] + a["z"] * b[2]


def summarize_faceted_mesh(vertices, triangles, heights):
    min_height = min(heights) if heights else 0
    max_height = max(heights) if heights else 0
    min_z = min(point["z"] for point in vertices) if vertices else 0
    max_z = max(point["z"] for point in vertices) if vertices else 0
    return {
        "vertexCount": len(vertices),
        "triangleCount": len(triangles),
        "minHeight": min_height,
        "maxHeight": max_height,
        "deviation": max_height - min_height,
        "minZ": min_z,
        "maxZ": max_z,
    }


def sample_indices(cell_count, control_limit):
    point_count = cell_count + 1
    target_count = max(4, min(control_limit, point_count))
    if target_count == point_count:
        return list(range(point_count))
    return sorted({round((i / (target_count - 1)) * cell_count) for i in range(target_count)})


def grid_for_face(face, dims, base_cells):
    size = face_size(face, dims)
    longest = max(dims["width"], dims["height"], dims["depth"])
    return {
        "columns": max(3, round((size["width"] / longest) * base_cells)),
        "rows": max(3, round((size["height"] / longest) * base_cells)),
    }


def displace_point(point, displacement):
    return {
        "x": point.position["x"] + point.normal["x"] * displacement,
        "y": point.position["y"] + point.normal["y"] * displacement,
        "z": point.position["z"] + point.normal["z"] * displacement,
    }


def summarize(grids, heights):
    min_height = min(heights) if heights else 0
    max_height = max(heights) if heights else 0
    all_points = [point for grid in grids.values() for row in grid["points"] for point in row]
    min_z = min(point["z"] for point in all_points)
    bottom_center = grids["bottom"]["points"][len(grids["bottom"]["points"]) // 2][len(grids["bottom"]["points"][0]) // 2]
    front_bottom = grids["front"]["points"][0][len(grids["front"]["points"][0]) // 2]
    return {
        "faceCount": len(grids),
        "pointCount": len(all_points),
        "minHeight": min_height,
        "maxHeight": max_height,
        "deviation": max_height - min_height,
        "minZ": min_z,
        "bottomCenterZ": bottom_center["z"],
        "frontBottomY": front_bottom["y"],
        "frontBottomZ": front_bottom["z"],
    }


def convert_grid_units(grids, factor):
    converted = copy.deepcopy(grids)
    for grid in converted["faces"].values():
        for row in grid["points"]:
            for point in row:
                point["x"] *= factor
                point["y"] *= factor
                point["z"] *= factor
    converted["dimensions"] = {key: value * factor for key, value in converted["dimensions"].items()}
    summary = converted["summary"]
    for key in ("minHeight", "maxHeight", "deviation", "minZ", "bottomCenterZ", "frontBottomY", "frontBottomZ"):
        summary[key] *= factor
    return converted


def convert_mesh_units(mesh, factor):
    converted = copy.deepcopy(mesh)
    for point in converted["vertices"]:
        point["x"] *= factor
        point["y"] *= factor
        point["z"] *= factor
    converted["dimensions"] = {key: value * factor for key, value in converted["dimensions"].items()}
    summary = converted["summary"]
    for key in ("minHeight", "maxHeight", "deviation", "minZ", "maxZ"):
        summary[key] *= factor
    return converted


def distance2(dx, dy):
    return math.sqrt(dx * dx + dy * dy)


def distance3(a, b):
    dx = (a.get("x") or 0) - (b.get("x") or 0)
    dy = (a.get("y") or 0) - (b.get("y") or 0)
    dz = (a.get("z") or 0) - (b.get("z") or 0)
    return math.sqrt(dx * dx + dy * dy + dz * dz)


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def clamp01(value):
    return clamp(value, 0, 1)


def smoothstep(edge0, edge1, value):
    if edge0 == edge1:
        return 1 if value >= edge1 else 0
    t = clamp01((value - edge0) / (edge1 - edge0))
    return t * t * (3 - 2 * t)


def is_finite(value):
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False
