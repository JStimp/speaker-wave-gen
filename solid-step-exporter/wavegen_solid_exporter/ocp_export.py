import json
from pathlib import Path

from .geometry import convert_grid_units, generate_surface_grids, load_project


def export_outer_solid(input_path, output_dir, resolution=None, control_limit=None, tolerance=None, debug_surfaces=False):
    try:
        from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace, BRepBuilderAPI_MakeSolid, BRepBuilderAPI_Sewing
        from OCP.BRepCheck import BRepCheck_Analyzer
        from OCP.GeomAPI import GeomAPI_PointsToBSplineSurface
        from OCP.GeomAbs import GeomAbs_C2
        from OCP.gp import gp_Pnt
        from OCP.IFSelect import IFSelect_RetDone
        from OCP.STEPControl import STEPControl_AsIs, STEPControl_Reader, STEPControl_Writer
        from OCP.TColgp import TColgp_Array2OfPnt
        from OCP.TopAbs import TopAbs_SHELL, TopAbs_SOLID
        from OCP.TopExp import TopExp_Explorer
        from OCP.TopoDS import TopoDS
    except ImportError as error:
        raise RuntimeError("The solid exporter requires the Docker image with CadQuery/OCP installed.") from error

    input_path = Path(input_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    step_path = output_dir / "outer-solid.step"
    report_path = output_dir / "outer-solid.report.json"
    debug_path = output_dir / "outer-surfaces-debug.step"

    project = load_project(input_path)
    source_units = project.get("units") or "in"
    unit_factor = 25.4 if source_units == "in" else 1.0
    step_units = "mm"
    tolerance = float(tolerance if tolerance is not None else (0.05 if source_units == "mm" else 0.005) * unit_factor)

    raw_grids = generate_surface_grids(project, resolution=resolution, control_limit=control_limit)
    grids = convert_grid_units(raw_grids, unit_factor)

    faces = []
    for face_name in ["front", "right", "back", "left", "top", "bottom"]:
        faces.append(make_bspline_face(grids["faces"][face_name]["points"], tolerance, TColgp_Array2OfPnt, gp_Pnt, GeomAPI_PointsToBSplineSurface, GeomAbs_C2, BRepBuilderAPI_MakeFace))

    sewer = BRepBuilderAPI_Sewing(tolerance)
    for face in faces:
        sewer.Add(face)
    sewer.Perform()
    sewed_shape = sewer.SewedShape()
    free_edges = safe_call_int(sewer, "NbFreeEdges")
    multiple_edges = safe_call_int(sewer, "NbMultipleEdges")
    degenerated_edges = safe_call_int(sewer, "NbDegeneratedShapes")

    shell = first_shape(sewed_shape, TopAbs_SHELL, TopoDS.Shell_s, TopExp_Explorer)
    if shell is None:
        shell = TopoDS.Shell_s(sewed_shape)

    maker = BRepBuilderAPI_MakeSolid(shell)
    solid = maker.Solid()
    valid_solid = bool(BRepCheck_Analyzer(solid).IsValid())
    solid_count = count_shapes(solid, TopAbs_SOLID, TopExp_Explorer)

    write_step(solid if valid_solid else sewed_shape, step_path, STEPControl_Writer, STEPControl_AsIs, IFSelect_RetDone)
    if debug_surfaces or not valid_solid or free_edges:
        write_step(sewed_shape, debug_path, STEPControl_Writer, STEPControl_AsIs, IFSelect_RetDone)

    imported_solid_count = import_solid_count(step_path, STEPControl_Reader, IFSelect_RetDone, TopAbs_SOLID, TopExp_Explorer)
    success = valid_solid and solid_count == 1 and imported_solid_count == 1 and free_edges == 0
    report = {
        "success": success,
        "input": str(input_path),
        "outputStep": str(step_path),
        "debugSurfaceStep": str(debug_path) if debug_path.exists() else None,
        "sourceUnits": source_units,
        "stepUnits": step_units,
        "unitScaleToStep": unit_factor,
        "resolution": resolution or project.get("export", {}).get("solidResolution") or project.get("export", {}).get("resolution") or "fine",
        "surfaceControlLimit": int(control_limit or project.get("export", {}).get("solidSurfaceControlLimit") or 34),
        "sewingTolerance": tolerance,
        "faceCount": len(faces),
        "freeEdges": free_edges,
        "multipleEdges": multiple_edges,
        "degeneratedEdges": degenerated_edges,
        "validSolid": valid_solid,
        "solidCount": solid_count,
        "importedSolidCount": imported_solid_count,
        "geometrySummary": grids["summary"],
        "warnings": warnings_for_report(valid_solid, solid_count, imported_solid_count, free_edges),
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def make_bspline_face(points, tolerance, array_type, point_type, surface_builder, continuity, face_builder):
    row_count = len(points)
    column_count = len(points[0])
    array = array_type(1, column_count, 1, row_count)
    for row_index, row in enumerate(points, start=1):
        for column_index, point in enumerate(row, start=1):
            array.SetValue(column_index, row_index, point_type(point["x"], point["y"], point["z"]))
    surface = surface_builder(array, 1, 3, continuity, tolerance).Surface()
    return face_builder(surface, tolerance).Face()


def first_shape(shape, shape_type, caster, explorer_type):
    if shape.ShapeType() == shape_type:
        return caster(shape)
    explorer = explorer_type(shape, shape_type)
    if explorer.More():
        return caster(explorer.Current())
    return None


def count_shapes(shape, shape_type, explorer_type):
    count = 0
    explorer = explorer_type(shape, shape_type)
    while explorer.More():
        count += 1
        explorer.Next()
    return count


def write_step(shape, path, writer_type, mode, success_status):
    writer = writer_type()
    writer.Transfer(shape, mode)
    status = writer.Write(str(path))
    if status != success_status:
        raise RuntimeError(f"STEP writer failed for {path}")


def import_solid_count(path, reader_type, success_status, solid_type, explorer_type):
    reader = reader_type()
    status = reader.ReadFile(str(path))
    if status != success_status:
        return 0
    reader.TransferRoots()
    shape = reader.OneShape()
    return count_shapes(shape, solid_type, explorer_type)


def safe_call_int(target, method_name):
    method = getattr(target, method_name, None)
    if method is None:
        return -1
    try:
        return int(method())
    except Exception:
        return -1


def warnings_for_report(valid_solid, solid_count, imported_solid_count, free_edges):
    warnings = []
    if free_edges:
        warnings.append("Sewing reported free edges; SolidWorks may import surfaces instead of one solid.")
    if not valid_solid:
        warnings.append("OpenCascade did not validate the sewn shape as a solid.")
    if solid_count != 1:
        warnings.append(f"Exporter produced {solid_count} solids instead of one.")
    if imported_solid_count != 1:
        warnings.append(f"STEP re-import found {imported_solid_count} solids instead of one.")
    return warnings
