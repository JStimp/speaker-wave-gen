import copy
import json
import math
from dataclasses import dataclass
from pathlib import Path


FACE_NAMES = ["front", "back", "left", "right", "top", "bottom"]
RESOLUTION_PRESETS = {
    "draft": 10,
    "low": 20,
    "medium": 36,
    "high": 64,
    "ultra": 96,
    "inspection": 128,
    "fine": 160,
    "production": 192,
}

DEFAULT_PROJECT = {
    "schemaVersion": 1,
    "units": "in",
    "project": {"name": "Wave wrapped hardwood speaker", "notes": "Static browser prototype."},
    "cabinet": {
        "preset": "rectangular",
        "cornerWrap": 0.22,
        "dimensions": {"width": 18, "height": 32, "depth": 14, "wallThickness": 0.875},
    },
    "drivers": [
        {
            "id": "woofer",
            "label": "Woofer",
            "face": "front",
            "center": {"x": 0, "z": 11.25},
            "diameter": 8.5,
            "source": {"enabled": True, "amplitude": 0.19, "wavelength": 4.9, "phase": 0.12, "falloff": 0.031},
        },
        {
            "id": "tweeter",
            "label": "Tweeter",
            "face": "front",
            "center": {"x": 0, "z": 24},
            "diameter": 3.6,
            "source": {"enabled": True, "amplitude": 0.105, "wavelength": 2.85, "phase": 0.68, "falloff": 0.043},
        },
    ],
    "manualSources": [],
    "waves": {
        "baseAmplitude": 1.08,
        "normalization": "softClip",
        "reliefDepth": 0.34,
        "reliefBias": 0,
        "surfaceMode": "fourWallsInsetTop",
        "topFlatBorder": 1.5,
        "topWaveBlend": 0.75,
        "minThickness": 0.5,
    },
    "preview": {"resolution": "ultra"},
    "export": {"resolution": "high", "solidResolution": "fine", "solidSurfaceControlLimit": 34, "stepMode": "smoothSurfaceStep"},
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
    if result["waves"].get("surfaceMode") == "fourWallFlatCaps":
        result["waves"]["surfaceMode"] = "fourWallsInsetTop"
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
    if point.face in ("top", "bottom"):
        return point

    wrap = clamp01(float(project.get("cabinet", {}).get("cornerWrap") or 0))
    requested_radius = max(0, min(dims["width"], dims["depth"], dims["height"]) * 0.22) * wrap
    cap_thickness = max(0.001, dims["wallThickness"])
    cap_blend_distance = max(requested_radius, cap_thickness)
    cap_blend = smoothstep(cap_thickness, cap_thickness + cap_blend_distance, point.position["z"]) * smoothstep(
        cap_thickness, cap_thickness + cap_blend_distance, dims["height"] - point.position["z"]
    )
    radius = requested_radius * cap_blend
    if radius <= 0.000001:
        return point

    p = point.position
    hx = dims["width"] / 2
    hy = dims["depth"] / 2
    qx = clamp(p["x"], -hx + radius, hx - radius)
    qy = clamp(p["y"], -hy + radius, hy - radius)
    vx = p["x"] - qx
    vy = p["y"] - qy
    length = math.sqrt(vx * vx + vy * vy)
    if length <= 0.000001:
        return point

    effective_radius = min(length, radius)
    nx = vx / length
    ny = vy / length
    point.position = {"x": qx + nx * effective_radius, "y": qy + ny * effective_radius, "z": p["z"]}
    point.normal = {"x": nx, "y": ny, "z": 0}
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
    if point.face == "bottom":
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

    if point.face == "top":
        displacement = apply_top_wave_mask(point, dims, waves, displacement)
    else:
        displacement = apply_flat_cap_transition(point, dims, displacement, limit)
    return {"raw": raw, "displacement": displacement}


def apply_flat_cap_transition(point, dims, displacement, limit):
    cap_thickness = max(0.001, dims["wallThickness"])
    fade_height = min(dims["height"] * 0.18, max(cap_thickness * 1.5, limit * 2.5))
    bottom_blend = smoothstep(cap_thickness, cap_thickness + fade_height, point.position["z"])
    top_blend = smoothstep(cap_thickness, cap_thickness + fade_height, dims["height"] - point.position["z"])
    return displacement * bottom_blend * top_blend


def apply_top_wave_mask(point, dims, waves, displacement):
    half_minimum_span = max(0, min(dims["width"], dims["depth"]) / 2)
    border = clamp(float(waves.get("topFlatBorder") or 0), 0, half_minimum_span)
    remaining_span = max(0, half_minimum_span - border)
    blend = clamp(float(waves.get("topWaveBlend") or 0), 0, remaining_span)
    u = clamp01(point.u)
    v = clamp01(point.v)
    edge_distance = min(u * dims["width"], (1 - u) * dims["width"], v * dims["depth"], (1 - v) * dims["depth"])

    if remaining_span <= 0.000001:
        return 0
    if blend <= 0.000001:
        return displacement if edge_distance > border else 0
    return displacement * smootherstep(border, border + blend, edge_distance)


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


def smootherstep(edge0, edge1, value):
    if edge0 == edge1:
        return 1 if value >= edge1 else 0
    t = clamp01((value - edge0) / (edge1 - edge0))
    return t * t * t * (t * (t * 6 - 15) + 10)


def is_finite(value):
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False
