from __future__ import annotations

import json
import math
from pathlib import Path


def write_mesh_json(path: Path, mesh: dict) -> None:
    path.write_text(json.dumps(mesh, indent=2) + "\n", encoding="utf-8")


def write_obj(path: Path, mesh: dict, name: str) -> None:
    lines = [f"o {name}"]
    vertices = mesh["vertices"]
    normals = mesh["normals"]
    indices = mesh["indices"]

    for index in range(0, len(vertices), 3):
        lines.append(f"v {vertices[index]:.6f} {vertices[index + 1]:.6f} {vertices[index + 2]:.6f}")

    for index in range(0, len(normals), 3):
        lines.append(f"vn {normals[index]:.6f} {normals[index + 1]:.6f} {normals[index + 2]:.6f}")

    for index in range(0, len(indices), 3):
        a = indices[index] + 1
        b = indices[index + 1] + 1
        c = indices[index + 2] + 1
        lines.append(f"f {a}//{a} {b}//{b} {c}//{c}")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_stl(path: Path, mesh: dict, name: str) -> None:
    vertices = mesh["vertices"]
    indices = mesh["indices"]
    lines = [f"solid {name}"]

    for index in range(0, len(indices), 3):
        a = vertex(vertices, indices[index])
        b = vertex(vertices, indices[index + 1])
        c = vertex(vertices, indices[index + 2])
        normal = triangle_normal(a, b, c)
        lines.append(f"  facet normal {normal[0]:.6f} {normal[1]:.6f} {normal[2]:.6f}")
        lines.append("    outer loop")
        lines.append(f"      vertex {a[0]:.6f} {a[1]:.6f} {a[2]:.6f}")
        lines.append(f"      vertex {b[0]:.6f} {b[1]:.6f} {b[2]:.6f}")
        lines.append(f"      vertex {c[0]:.6f} {c[1]:.6f} {c[2]:.6f}")
        lines.append("    endloop")
        lines.append("  endfacet")

    lines.append(f"endsolid {name}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def vertex(vertices: list[float], index: int) -> tuple[float, float, float]:
    offset = index * 3
    return vertices[offset], vertices[offset + 1], vertices[offset + 2]


def triangle_normal(
    a: tuple[float, float, float],
    b: tuple[float, float, float],
    c: tuple[float, float, float],
) -> tuple[float, float, float]:
    ab = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    ac = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
    cross = (
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
    )
    length = math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2)
    if length <= 0:
        return 0, 0, 0
    return cross[0] / length, cross[1] / length, cross[2] / length

