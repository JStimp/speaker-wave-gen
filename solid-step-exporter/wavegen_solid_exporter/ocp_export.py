import json
import math
from pathlib import Path

from .geometry import (
    convert_grid_units,
    convert_mesh_units,
    generate_faceted_mesh,
    generate_surface_grids,
    load_project,
)


def export_outer_solid(
    input_path,
    output_dir,
    resolution=None,
    control_limit=None,
    tolerance=None,
    debug_surfaces=False,
    mode="auto",
    facet_resolution=None,
):
    try:
        from OCP.BRepBuilderAPI import (
            BRepBuilderAPI_MakeFace,
            BRepBuilderAPI_MakePolygon,
            BRepBuilderAPI_MakeSolid,
            BRepBuilderAPI_Sewing,
        )
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
        try:
            from OCP.ShapeFix import ShapeFix_Solid
        except ImportError:
            ShapeFix_Solid = None
    except ImportError as error:
        raise RuntimeError("The solid exporter requires the Docker image with CadQuery/OCP installed.") from error

    if mode not in ("auto", "smooth", "faceted"):
        raise ValueError("mode must be auto, smooth, or faceted")

    input_path = Path(input_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    step_path = output_dir / "outer-solid.step"
    report_path = output_dir / "outer-solid.report.json"
    smooth_debug_path = output_dir / "outer-surfaces-debug.step"
    faceted_debug_path = output_dir / "outer-faceted-debug.step"

    project = load_project(input_path)
    source_units = project.get("units") or "in"
    unit_factor = 25.4 if source_units == "in" else 1.0
    step_units = "mm"
    tolerance = float(tolerance if tolerance is not None else (0.05 if source_units == "mm" else 0.005) * unit_factor)
    smooth_resolution = resolution or project.get("export", {}).get("solidResolution") or project.get("export", {}).get("resolution") or "fine"
    facet_resolution = (
        facet_resolution
        or project.get("export", {}).get("solidFacetResolution")
        or project.get("export", {}).get("solidResolution")
        or project.get("export", {}).get("resolution")
        or "fine"
    )
    control_limit = int(control_limit or project.get("export", {}).get("solidSurfaceControlLimit") or 34)

    ocp = {
        "BRepBuilderAPI_MakeFace": BRepBuilderAPI_MakeFace,
        "BRepBuilderAPI_MakePolygon": BRepBuilderAPI_MakePolygon,
        "BRepBuilderAPI_MakeSolid": BRepBuilderAPI_MakeSolid,
        "BRepBuilderAPI_Sewing": BRepBuilderAPI_Sewing,
        "BRepCheck_Analyzer": BRepCheck_Analyzer,
        "GeomAPI_PointsToBSplineSurface": GeomAPI_PointsToBSplineSurface,
        "GeomAbs_C2": GeomAbs_C2,
        "gp_Pnt": gp_Pnt,
        "IFSelect_RetDone": IFSelect_RetDone,
        "STEPControl_AsIs": STEPControl_AsIs,
        "STEPControl_Reader": STEPControl_Reader,
        "STEPControl_Writer": STEPControl_Writer,
        "TColgp_Array2OfPnt": TColgp_Array2OfPnt,
        "TopAbs_SHELL": TopAbs_SHELL,
        "TopAbs_SOLID": TopAbs_SOLID,
        "TopExp_Explorer": TopExp_Explorer,
        "TopoDS": TopoDS,
        "ShapeFix_Solid": ShapeFix_Solid,
    }

    attempts = []
    selected = None

    if mode in ("auto", "smooth"):
        smooth = build_smooth_attempt(project, unit_factor, smooth_resolution, control_limit, tolerance, ocp)
        attempts.append(strip_shape(smooth))
        if debug_surfaces or not smooth["readyForWrite"]:
            write_step(smooth["debugShape"], smooth_debug_path, ocp)
        if smooth["readyForWrite"]:
            imported_solid_count = write_and_reimport(smooth["solid"], step_path, ocp)
            smooth["importedSolidCount"] = imported_solid_count
            smooth["success"] = imported_solid_count == 1
            attempts[-1] = strip_shape(smooth)
            selected = smooth if smooth["success"] else None

    if selected is None and mode in ("auto", "faceted"):
        faceted = build_faceted_attempt(project, unit_factor, facet_resolution, tolerance, ocp)
        imported_solid_count = 0
        if faceted["readyForWrite"]:
            imported_solid_count = write_and_reimport(faceted["solid"], step_path, ocp)
            faceted["importedSolidCount"] = imported_solid_count
            faceted["success"] = imported_solid_count == 1
        else:
            write_step(faceted["debugShape"], faceted_debug_path, ocp)
        attempts.append(strip_shape(faceted))
        selected = faceted if faceted.get("success") else None

    if selected is None:
        failed = attempts[-1] if attempts else {}
        geometry_summary = failed.get("geometrySummary") or {}
        final_report = base_report(
            success=False,
            input_path=input_path,
            step_path=step_path,
            smooth_debug_path=smooth_debug_path,
            faceted_debug_path=faceted_debug_path,
            source_units=source_units,
            step_units=step_units,
            unit_factor=unit_factor,
            smooth_resolution=smooth_resolution,
            facet_resolution=facet_resolution,
            control_limit=control_limit,
            tolerance=tolerance,
            selected_mode="none",
            selected_attempt=failed,
            attempts=attempts,
            geometry_summary=geometry_summary,
            warnings=["No exporter mode produced a STEP that re-imported as one solid. See debug STEP files and attempts."],
        )
    else:
        warnings = warnings_for_selected(selected, attempts)
        final_report = base_report(
            success=True,
            input_path=input_path,
            step_path=step_path,
            smooth_debug_path=smooth_debug_path,
            faceted_debug_path=faceted_debug_path,
            source_units=source_units,
            step_units=step_units,
            unit_factor=unit_factor,
            smooth_resolution=smooth_resolution,
            facet_resolution=facet_resolution,
            control_limit=control_limit,
            tolerance=tolerance,
            selected_mode=selected["mode"],
            selected_attempt=strip_shape(selected),
            attempts=attempts,
            geometry_summary=selected["geometrySummary"],
            warnings=warnings,
        )

    report_path.write_text(json.dumps(final_report, indent=2) + "\n", encoding="utf-8")
    return final_report


def build_smooth_attempt(project, unit_factor, resolution, control_limit, tolerance, ocp):
    raw_grids = generate_surface_grids(project, resolution=resolution, control_limit=control_limit)
    grids = convert_grid_units(raw_grids, unit_factor)
    faces = []
    for face_name in ["front", "right", "back", "left", "top", "bottom"]:
        faces.append(make_bspline_face(grids["faces"][face_name]["points"], tolerance, ocp))

    sewed_shape, sewing = sew_faces(faces, tolerance, ocp)
    solid = solid_from_sewed(sewed_shape, ocp)
    valid_solid = is_valid_solid(solid, ocp)
    solid_count = count_shapes(solid, ocp["TopAbs_SOLID"], ocp["TopExp_Explorer"]) if solid is not None else 0
    free_edges = safe_call_int(sewing, "NbFreeEdges")

    return {
        "mode": "smooth",
        "success": False,
        "readyForWrite": valid_solid and solid_count == 1 and free_edges == 0,
        "solid": solid,
        "debugShape": sewed_shape,
        "faceCount": len(faces),
        "freeEdges": free_edges,
        "multipleEdges": safe_call_int(sewing, "NbMultipleEdges"),
        "degeneratedEdges": safe_call_int(sewing, "NbDegeneratedShapes"),
        "validSolid": valid_solid,
        "solidCount": solid_count,
        "importedSolidCount": 0,
        "geometrySummary": grids["summary"],
        "warnings": warnings_for_attempt(valid_solid, solid_count, 0, free_edges),
    }


def build_faceted_attempt(project, unit_factor, resolution, tolerance, ocp):
    raw_mesh = generate_faceted_mesh(project, resolution=resolution)
    mesh = convert_mesh_units(raw_mesh, unit_factor)
    faces = []
    skipped = 0
    for triangle in mesh["triangles"]:
        try:
            face = make_triangle_face(mesh["vertices"], triangle, ocp)
            if face is None:
                skipped += 1
            else:
                faces.append(face)
        except Exception:
            skipped += 1

    sewed_shape, sewing = sew_faces(faces, tolerance, ocp)
    solid = solid_from_sewed(sewed_shape, ocp)
    valid_solid = is_valid_solid(solid, ocp)
    solid_count = count_shapes(solid, ocp["TopAbs_SOLID"], ocp["TopExp_Explorer"]) if solid is not None else 0
    free_edges = safe_call_int(sewing, "NbFreeEdges")

    return {
        "mode": "facetedFallback",
        "success": False,
        "readyForWrite": valid_solid and solid_count == 1 and free_edges == 0,
        "solid": solid,
        "debugShape": sewed_shape,
        "faceCount": len(faces),
        "skippedTriangles": skipped,
        "freeEdges": free_edges,
        "multipleEdges": safe_call_int(sewing, "NbMultipleEdges"),
        "degeneratedEdges": safe_call_int(sewing, "NbDegeneratedShapes"),
        "validSolid": valid_solid,
        "solidCount": solid_count,
        "importedSolidCount": 0,
        "geometrySummary": mesh["summary"],
        "warnings": warnings_for_attempt(valid_solid, solid_count, 0, free_edges),
    }


def make_bspline_face(points, tolerance, ocp):
    row_count = len(points)
    column_count = len(points[0])
    array = ocp["TColgp_Array2OfPnt"](1, column_count, 1, row_count)
    for row_index, row in enumerate(points, start=1):
        for column_index, point in enumerate(row, start=1):
            array.SetValue(column_index, row_index, ocp["gp_Pnt"](point["x"], point["y"], point["z"]))
    surface = ocp["GeomAPI_PointsToBSplineSurface"](array, 1, 3, ocp["GeomAbs_C2"], tolerance).Surface()
    return ocp["BRepBuilderAPI_MakeFace"](surface, tolerance).Face()


def make_triangle_face(vertices, triangle, ocp):
    a, b, c = [vertices[index] for index in triangle]
    if triangle_area(a, b, c) <= 1e-10:
        return None
    polygon = ocp["BRepBuilderAPI_MakePolygon"]()
    polygon.Add(ocp["gp_Pnt"](a["x"], a["y"], a["z"]))
    polygon.Add(ocp["gp_Pnt"](b["x"], b["y"], b["z"]))
    polygon.Add(ocp["gp_Pnt"](c["x"], c["y"], c["z"]))
    polygon.Close()
    return ocp["BRepBuilderAPI_MakeFace"](polygon.Wire()).Face()


def triangle_area(a, b, c):
    ab = (b["x"] - a["x"], b["y"] - a["y"], b["z"] - a["z"])
    ac = (c["x"] - a["x"], c["y"] - a["y"], c["z"] - a["z"])
    cross = (
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
    )
    return 0.5 * math.sqrt(cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2])


def sew_faces(faces, tolerance, ocp):
    sewer = ocp["BRepBuilderAPI_Sewing"](tolerance)
    for face in faces:
        sewer.Add(face)
    sewer.Perform()
    return sewer.SewedShape(), sewer


def solid_from_sewed(sewed_shape, ocp):
    shell = first_shape(sewed_shape, ocp["TopAbs_SHELL"], ocp["TopoDS"].Shell_s, ocp["TopExp_Explorer"])
    if shell is None:
        try:
            shell = ocp["TopoDS"].Shell_s(sewed_shape)
        except Exception:
            return None
    try:
        solid = ocp["BRepBuilderAPI_MakeSolid"](shell).Solid()
    except Exception:
        return None
    fixer = ocp.get("ShapeFix_Solid")
    if fixer is not None:
        try:
            fixed = fixer(solid)
            fixed.Perform()
            candidate = fixed.Solid()
            if candidate is not None and not candidate.IsNull():
                solid = candidate
        except Exception:
            pass
    return solid


def is_valid_solid(solid, ocp):
    if solid is None:
        return False
    try:
        return bool(ocp["BRepCheck_Analyzer"](solid).IsValid())
    except Exception:
        return False


def write_and_reimport(shape, path, ocp):
    write_step(shape, path, ocp)
    return import_solid_count(path, ocp)


def first_shape(shape, shape_type, caster, explorer_type):
    if shape.ShapeType() == shape_type:
        return caster(shape)
    explorer = explorer_type(shape, shape_type)
    if explorer.More():
        return caster(explorer.Current())
    return None


def count_shapes(shape, shape_type, explorer_type):
    if shape is None:
        return 0
    count = 0
    explorer = explorer_type(shape, shape_type)
    while explorer.More():
        count += 1
        explorer.Next()
    return count


def write_step(shape, path, ocp):
    writer = ocp["STEPControl_Writer"]()
    writer.Transfer(shape, ocp["STEPControl_AsIs"])
    status = writer.Write(str(path))
    if status != ocp["IFSelect_RetDone"]:
        raise RuntimeError(f"STEP writer failed for {path}")


def import_solid_count(path, ocp):
    reader = ocp["STEPControl_Reader"]()
    status = reader.ReadFile(str(path))
    if status != ocp["IFSelect_RetDone"]:
        return 0
    reader.TransferRoots()
    shape = reader.OneShape()
    return count_shapes(shape, ocp["TopAbs_SOLID"], ocp["TopExp_Explorer"])


def safe_call_int(target, method_name):
    method = getattr(target, method_name, None)
    if method is None:
        return -1
    try:
        return int(method())
    except Exception:
        return -1


def strip_shape(attempt):
    return {key: value for key, value in attempt.items() if key not in ("solid", "debugShape")}


def base_report(
    success,
    input_path,
    step_path,
    smooth_debug_path,
    faceted_debug_path,
    source_units,
    step_units,
    unit_factor,
    smooth_resolution,
    facet_resolution,
    control_limit,
    tolerance,
    selected_mode,
    selected_attempt,
    attempts,
    geometry_summary,
    warnings,
):
    return {
        "success": success,
        "mode": selected_mode,
        "input": str(input_path),
        "outputStep": str(step_path),
        "debugSurfaceStep": str(smooth_debug_path) if smooth_debug_path.exists() else None,
        "debugFacetedStep": str(faceted_debug_path) if faceted_debug_path.exists() else None,
        "sourceUnits": source_units,
        "stepUnits": step_units,
        "unitScaleToStep": unit_factor,
        "resolution": smooth_resolution,
        "facetResolution": facet_resolution,
        "surfaceControlLimit": control_limit,
        "sewingTolerance": tolerance,
        "faceCount": selected_attempt.get("faceCount"),
        "freeEdges": selected_attempt.get("freeEdges"),
        "multipleEdges": selected_attempt.get("multipleEdges"),
        "degeneratedEdges": selected_attempt.get("degeneratedEdges"),
        "validSolid": selected_attempt.get("validSolid"),
        "solidCount": selected_attempt.get("solidCount"),
        "importedSolidCount": selected_attempt.get("importedSolidCount"),
        "skippedTriangles": selected_attempt.get("skippedTriangles"),
        "geometrySummary": geometry_summary,
        "attempts": attempts,
        "warnings": warnings,
    }


def warnings_for_attempt(valid_solid, solid_count, imported_solid_count, free_edges):
    warnings = []
    if free_edges:
        warnings.append("Sewing reported free edges; SolidWorks may import surfaces instead of one solid.")
    if not valid_solid:
        warnings.append("OpenCascade did not validate the sewn shape as a solid.")
    if solid_count != 1:
        warnings.append(f"Exporter produced {solid_count} solids instead of one.")
    if imported_solid_count not in (0, 1):
        warnings.append(f"STEP re-import found {imported_solid_count} solids instead of one.")
    return warnings


def warnings_for_selected(selected, attempts):
    warnings = list(selected.get("warnings") or [])
    if selected["mode"] == "facetedFallback":
        warnings.append("Smooth spline sewing did not produce a valid closed solid, so outer-solid.step uses a watertight faceted solid fallback.")
        warnings.append("The fallback should import as one SolidWorks solid body, but its surface is made from planar facets rather than editable NURBS faces.")
    for attempt in attempts:
        if attempt.get("mode") == "smooth" and attempt.get("freeEdges"):
            warnings.append(f"Smooth attempt had {attempt.get('freeEdges')} free edges; see outer-surfaces-debug.step.")
    return warnings
