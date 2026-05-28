from __future__ import annotations

import argparse
import json
from pathlib import Path

from .geometry import generate_panel_meshes, generate_preview_mesh, mesh_summary
from .io import write_mesh_json, write_obj, write_stl
from .step import write_step_exports


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Export Speaker Wave CAD geometry.")
    parser.add_argument("--config", required=True, help="Path to a .wavecad.json project file.")
    parser.add_argument("--out", required=True, help="Output directory.")
    parser.add_argument(
        "--format",
        default="all",
        choices=["all", "step", "stl", "obj"],
        help="Export format. all writes every supported output.",
    )
    parser.add_argument(
        "--panel-mode",
        default="separated",
        choices=["separated", "full"],
        help="Whether to write separated panel meshes in addition to the cabinet mesh.",
    )
    parser.add_argument(
        "--require-step",
        action="store_true",
        help="Exit with an error if STEP export cannot be completed.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config_path = Path(args.config).resolve()
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    project = json.loads(config_path.read_text(encoding="utf-8"))
    mesh = generate_preview_mesh(project)
    panels = generate_panel_meshes(project) if args.panel_mode == "separated" else {}
    warnings: list[str] = []
    written: list[str] = []

    preview_path = out_dir / "preview_mesh.json"
    write_mesh_json(preview_path, mesh)
    written.append(str(preview_path))

    if args.format in ("all", "obj"):
        obj_path = out_dir / "cabinet_preview.obj"
        write_obj(obj_path, mesh, name="cabinet_preview")
        written.append(str(obj_path))

    if args.format in ("all", "stl"):
        stl_path = out_dir / "cabinet_preview.stl"
        write_stl(stl_path, mesh, name="cabinet_preview")
        written.append(str(stl_path))

    if panels and args.format in ("all", "obj", "stl"):
        panel_dir = out_dir / "panels"
        panel_dir.mkdir(parents=True, exist_ok=True)
        for face, panel_mesh in panels.items():
            if args.format in ("all", "obj"):
                panel_obj = panel_dir / f"{face}_panel.obj"
                write_obj(panel_obj, panel_mesh, name=f"{face}_panel")
                written.append(str(panel_obj))
            if args.format in ("all", "stl"):
                panel_stl = panel_dir / f"{face}_panel.stl"
                write_stl(panel_stl, panel_mesh, name=f"{face}_panel")
                written.append(str(panel_stl))

    if args.format in ("all", "step"):
        step_result = write_step_exports(out_dir, mesh, panels)
        warnings.extend(step_result["warnings"])
        written.extend(step_result["written"])
        if args.require_step and not step_result["ok"]:
            report = write_report(out_dir, project, mesh, panels, warnings, written, ok=False)
            print(json.dumps(report, indent=2))
            return 2

    report = write_report(out_dir, project, mesh, panels, warnings, written, ok=True)
    print(json.dumps(report, indent=2))
    return 0


def write_report(
    out_dir: Path,
    project: dict,
    mesh: dict,
    panels: dict[str, dict],
    warnings: list[str],
    written: list[str],
    ok: bool,
) -> dict:
    report = {
        "ok": ok,
        "project": project.get("project", {}).get("name", "Untitled wave speaker"),
        "summary": mesh_summary(mesh),
        "panels": {face: mesh_summary(panel_mesh) for face, panel_mesh in panels.items()},
        "warnings": warnings,
        "written": written,
    }
    report_path = out_dir / "export_report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    raise SystemExit(main())

