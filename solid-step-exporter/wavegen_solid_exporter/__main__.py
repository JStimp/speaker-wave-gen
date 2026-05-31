import argparse
import json
import sys
from pathlib import Path


def main(argv=None):
    parser = argparse.ArgumentParser(description="Export a WaveGen3D project as a CAD-kernel solid STEP.")
    parser.add_argument("project", help="Input .wavecad.json project")
    parser.add_argument("--output-dir", default="/output", help="Directory for outer-solid.step and report")
    parser.add_argument("--resolution", default=None, help="Sampling resolution preset: high, ultra, fine, production")
    parser.add_argument("--surface-controls", type=int, default=None, help="Maximum spline control points per face direction")
    parser.add_argument("--tolerance", type=float, default=None, help="Sewing tolerance in STEP units after unit conversion")
    parser.add_argument("--debug-surfaces", action="store_true", help="Always write outer-surfaces-debug.step")
    parser.add_argument("--report-only", action="store_true", help="Generate geometry summary without loading OCP")
    args = parser.parse_args(argv)

    if args.report_only:
        from .geometry import convert_grid_units, generate_surface_grids, load_project

        project = load_project(args.project)
        factor = 25.4 if project.get("units") == "in" else 1
        grids = convert_grid_units(generate_surface_grids(project, resolution=args.resolution, control_limit=args.surface_controls), factor)
        print(json.dumps({"success": True, "stepUnits": "mm", "geometrySummary": grids["summary"]}, indent=2))
        return 0

    from .ocp_export import export_outer_solid

    try:
        report = export_outer_solid(
            args.project,
            Path(args.output_dir),
            resolution=args.resolution,
            control_limit=args.surface_controls,
            tolerance=args.tolerance,
            debug_surfaces=args.debug_surfaces,
        )
    except Exception as error:
        print(f"WaveGen3D solid STEP export failed: {error}", file=sys.stderr)
        return 2

    print(json.dumps(report, indent=2))
    return 0 if report.get("success") else 2


if __name__ == "__main__":
    raise SystemExit(main())
