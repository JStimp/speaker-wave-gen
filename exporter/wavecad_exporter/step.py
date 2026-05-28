from __future__ import annotations

from pathlib import Path


def write_step_exports(out_dir: Path, mesh: dict, panels: dict[str, dict]) -> dict:
    try:
        from OCP.BRep import BRep_Builder
        from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
        from OCP.GeomAPI import GeomAPI_PointsToBSplineSurface
        from OCP.IFSelect import IFSelect_RetDone
        from OCP.STEPControl import STEPControl_AsIs, STEPControl_Writer
        from OCP.TColgp import TColgp_Array2OfPnt
        from OCP.TopoDS import TopoDS_Compound
        from OCP.gp import gp_Pnt
    except Exception as exc:  # pragma: no cover - depends on Linux CAD runtime
        return {
            "ok": False,
            "warnings": [
                "STEP export skipped because OCP/OpenCascade is unavailable. "
                f"Run through the Docker/WSL exporter with CAD dependencies installed. Detail: {exc}"
            ],
            "written": [],
        }

    try:  # pragma: no cover - depends on Linux CAD runtime
        full_path = out_dir / "cabinet_wave_surface.step"
        full_shape = _compound_from_mesh(mesh, BRep_Builder, TopoDS_Compound, TColgp_Array2OfPnt, gp_Pnt, GeomAPI_PointsToBSplineSurface, BRepBuilderAPI_MakeFace)
        _write_shape(full_path, full_shape, STEPControl_Writer, STEPControl_AsIs, IFSelect_RetDone)
        written = [str(full_path)]

        if panels:
            step_panel_dir = out_dir / "step_panels"
            step_panel_dir.mkdir(parents=True, exist_ok=True)
            for face, panel_mesh in panels.items():
                panel_path = step_panel_dir / f"{face}_panel.step"
                panel_shape = _compound_from_mesh(panel_mesh, BRep_Builder, TopoDS_Compound, TColgp_Array2OfPnt, gp_Pnt, GeomAPI_PointsToBSplineSurface, BRepBuilderAPI_MakeFace)
                _write_shape(panel_path, panel_shape, STEPControl_Writer, STEPControl_AsIs, IFSelect_RetDone)
                written.append(str(panel_path))

        return {"ok": True, "warnings": [], "written": written}
    except Exception as exc:
        return {
            "ok": False,
            "warnings": [f"STEP export failed while building B-spline surfaces: {exc}"],
            "written": [],
        }


def _compound_from_mesh(
    mesh: dict,
    brep_builder,
    compound_type,
    point_array_type,
    point_type,
    spline_builder_type,
    face_builder_type,
):
    builder = brep_builder()
    compound = compound_type()
    builder.MakeCompound(compound)

    for face_range in mesh["faceRanges"].values():
        start = face_range["startVertex"]
        columns = face_range["columns"]
        rows = face_range["rows"]
        points = point_array_type(1, rows + 1, 1, columns + 1)

        for row in range(rows + 1):
            for column in range(columns + 1):
                vertex_index = start + row * (columns + 1) + column
                offset = vertex_index * 3
                x = mesh["vertices"][offset]
                y = mesh["vertices"][offset + 1]
                z = mesh["vertices"][offset + 2]
                points.SetValue(row + 1, column + 1, point_type(x, y, z))

        surface = spline_builder_type(points).Surface()
        face = face_builder_type(surface, 1.0e-6).Face()
        builder.Add(compound, face)

    return compound


def _write_shape(path: Path, shape, writer_type, mode, success_code) -> None:
    writer = writer_type()
    writer.Transfer(shape, mode)
    status = writer.Write(str(path))
    if status != success_code:
        raise RuntimeError(f"OpenCascade returned STEP write status {status}")

