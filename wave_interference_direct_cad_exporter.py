#!/usr/bin/env python3
from __future__ import annotations

import csv
import math
import os
import sys
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

import tkinter as tk
from tkinter import ttk, messagebox, filedialog

import numpy as np

# Optional preview dependency
try:
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
    MATPLOTLIB_OK = True
except Exception:
    MATPLOTLIB_OK = False

# Optional CAD export dependency
try:
    from OCP.TColgp import TColgp_Array2OfPnt
    from OCP.gp import gp_Pnt, gp_Dir, gp_Vec
    from OCP.GeomAPI import GeomAPI_PointsToBSplineSurface
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
    from OCP.BRepOffsetAPI import BRepOffsetAPI_MakeThickSolid
    from OCP.TopTools import TopTools_ListOfShape
    from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
    from OCP.IGESControl import IGESControl_Writer
    from OCP.Interface import Interface_Static
    from OCP.IFSelect import IFSelect_RetDone

    OCP_OK = True
    OCP_IMPORT_ERROR = ""
except Exception as exc:
    OCP_OK = False
    OCP_IMPORT_ERROR = str(exc)


APP_TITLE = "Wave Interference Direct CAD Exporter"


@dataclass
class WaveSource:
    x: float
    y: float
    amplitude: float
    wavelength: float
    phase_deg: float = 0.0

    @property
    def phase_rad(self) -> float:
        return math.radians(self.phase_deg)


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def safe_float(text: str, name: str) -> float:
    try:
        return float(text)
    except ValueError:
        raise ValueError(f"{name} must be a number.")


def safe_int(text: str, name: str) -> int:
    try:
        return int(text)
    except ValueError:
        raise ValueError(f"{name} must be an integer.")


def build_grid(width: float, height: float, nx: int, ny: int) -> Tuple[np.ndarray, np.ndarray]:
    if width <= 0:
        raise ValueError("Width must be greater than zero.")
    if height <= 0:
        raise ValueError("Height must be greater than zero.")
    if nx < 2:
        raise ValueError("Grid X must be at least 2.")
    if ny < 2:
        raise ValueError("Grid Y must be at least 2.")

    x = np.linspace(-width / 2.0, width / 2.0, nx)
    y = np.linspace(-height / 2.0, height / 2.0, ny)
    return np.meshgrid(x, y)


def radial_falloff(X: np.ndarray, Y: np.ndarray, strength: float) -> np.ndarray:
    if strength <= 0:
        return np.ones_like(X)
    radius = np.sqrt(X * X + Y * Y)
    return np.exp(-strength * radius)


def compute_surface(
    X: np.ndarray,
    Y: np.ndarray,
    sources: Sequence[WaveSource],
    z_scale: float,
    falloff_strength: float,
    normalize: bool,
    clip_z: Optional[float],
) -> np.ndarray:
    if not sources:
        raise ValueError("At least one source is required.")

    Z = np.zeros_like(X, dtype=float)

    for src in sources:
        if src.wavelength <= 0:
            raise ValueError("Every source wavelength must be greater than zero.")
        r = np.sqrt((X - src.x) ** 2 + (Y - src.y) ** 2)
        k = 2.0 * math.pi / src.wavelength
        Z += src.amplitude * np.sin(k * r + src.phase_rad)

    Z *= radial_falloff(X, Y, falloff_strength)
    Z *= z_scale

    if normalize:
        max_abs = float(np.max(np.abs(Z)))
        if max_abs > 1e-12:
            peak_amp = max(max(abs(s.amplitude), 1e-9) for s in sources)
            Z = (Z / max_abs) * peak_amp * z_scale

    if clip_z is not None and clip_z > 0:
        Z = np.clip(Z, -clip_z, clip_z)

    return Z


def write_png_preview(filepath: Path, X: np.ndarray, Y: np.ndarray, Z: np.ndarray, sources: Sequence[WaveSource]) -> None:
    if not MATPLOTLIB_OK:
        raise RuntimeError("matplotlib is not installed.")

    fig, ax = plt.subplots(figsize=(8, 5))
    im = ax.imshow(
        Z,
        origin="lower",
        extent=[float(X.min()), float(X.max()), float(Y.min()), float(Y.max())],
        aspect="auto",
    )
    ax.set_title("Wave Interference Preview")
    ax.set_xlabel("X")
    ax.set_ylabel("Y")

    sx = [s.x for s in sources]
    sy = [s.y for s in sources]
    ax.scatter(sx, sy, marker="x", s=80)

    cbar = fig.colorbar(im, ax=ax)
    cbar.set_label("Z height")

    fig.tight_layout()
    fig.savefig(filepath, dpi=180)
    plt.close(fig)


def write_csv_points(filepath: Path, X: np.ndarray, Y: np.ndarray, Z: np.ndarray, z_offset: float = 0.0) -> None:
    with filepath.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["x", "y", "z"])
        for x, y, z in zip(X.ravel(), Y.ravel(), (Z + z_offset).ravel()):
            writer.writerow([f"{x:.6f}", f"{y:.6f}", f"{z:.6f}"])


def write_xyz_points(filepath: Path, X: np.ndarray, Y: np.ndarray, Z: np.ndarray, z_offset: float = 0.0) -> None:
    with filepath.open("w", encoding="utf-8", newline="\n") as f:
        for x, y, z in zip(X.ravel(), Y.ravel(), (Z + z_offset).ravel()):
            f.write(f"{x:.6f} {y:.6f} {z:.6f}\n")


def write_ascii_stl(filepath: Path, X: np.ndarray, Y: np.ndarray, Z: np.ndarray, z_offset: float = 0.0) -> None:
    top = np.stack([X, Y, Z + z_offset], axis=-1)
    ny, nx, _ = top.shape

    def tri_normal(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
        n = np.cross(b - a, c - a)
        mag = np.linalg.norm(n)
        if mag < 1e-12:
            return np.array([0.0, 0.0, 0.0])
        return n / mag

    with filepath.open("w", encoding="utf-8", newline="\n") as f:
        f.write("solid wave_surface\n")
        for j in range(ny - 1):
            for i in range(nx - 1):
                p00 = top[j, i]
                p10 = top[j, i + 1]
                p01 = top[j + 1, i]
                p11 = top[j + 1, i + 1]

                for a, b, c in ((p00, p10, p11), (p00, p11, p01)):
                    n = tri_normal(a, b, c)
                    f.write(f"  facet normal {n[0]:.8e} {n[1]:.8e} {n[2]:.8e}\n")
                    f.write("    outer loop\n")
                    f.write(f"      vertex {a[0]:.8e} {a[1]:.8e} {a[2]:.8e}\n")
                    f.write(f"      vertex {b[0]:.8e} {b[1]:.8e} {b[2]:.8e}\n")
                    f.write(f"      vertex {c[0]:.8e} {c[1]:.8e} {c[2]:.8e}\n")
                    f.write("    endloop\n")
                    f.write("  endfacet\n")

        f.write("endsolid wave_surface\n")


def build_bspline_face(
    X: np.ndarray,
    Y: np.ndarray,
    Z: np.ndarray,
    z_offset: float = 0.0,
):
    if not OCP_OK:
        raise RuntimeError(f"OCP is not available: {OCP_IMPORT_ERROR}")

    ny, nx = Z.shape
    pts = TColgp_Array2OfPnt(1, ny, 1, nx)

    for row in range(ny):
        for col in range(nx):
            pts.SetValue(
                row + 1,
                col + 1,
                gp_Pnt(float(X[row, col]), float(Y[row, col]), float(Z[row, col] + z_offset)),
            )

    # Degree / continuity are left to OpenCascade defaults for robustness.
    bspline_builder = GeomAPI_PointsToBSplineSurface(pts)
    surf = bspline_builder.Surface()

    face_maker = BRepBuilderAPI_MakeFace(surf, 1e-6)
    face = face_maker.Face()
    return face


def export_step_surface(filepath: Path, face) -> None:
    if not OCP_OK:
        raise RuntimeError(f"OCP is not available: {OCP_IMPORT_ERROR}")

    Interface_Static.SetCVal_s("write.step.schema", "AP214")
    writer = STEPControl_Writer()
    status = writer.Transfer(face, STEPControl_AsIs)
    if status != IFSelect_RetDone:
        raise RuntimeError("STEP transfer failed.")
    status = writer.Write(str(filepath))
    if status != IFSelect_RetDone:
        raise RuntimeError("STEP write failed.")


def export_iges_surface(filepath: Path, face) -> None:
    if not OCP_OK:
        raise RuntimeError(f"OCP is not available: {OCP_IMPORT_ERROR}")

    writer = IGESControl_Writer()
    writer.AddShape(face)
    ok = writer.Write(str(filepath))
    if not ok:
        raise RuntimeError("IGES write failed.")


class ToolTip:
    def __init__(self, widget, text: str):
        self.widget = widget
        self.text = text
        self.tip_window = None
        self.widget.bind("<Enter>", self.show)
        self.widget.bind("<Leave>", self.hide)

    def show(self, _event=None):
        if self.tip_window or not self.text:
            return
        x = self.widget.winfo_rootx() + 18
        y = self.widget.winfo_rooty() + self.widget.winfo_height() + 4
        self.tip_window = tw = tk.Toplevel(self.widget)
        tw.wm_overrideredirect(True)
        tw.wm_geometry(f"+{x}+{y}")

        label = tk.Label(
            tw,
            text=self.text,
            justify="left",
            background="#fff9db",
            relief="solid",
            borderwidth=1,
            padx=8,
            pady=5,
            wraplength=320,
        )
        label.pack()

    def hide(self, _event=None):
        if self.tip_window:
            self.tip_window.destroy()
            self.tip_window = None


class SourceFrame(ttk.LabelFrame):
    def __init__(self, master, index: int, remove_callback):
        super().__init__(master, text=f"Source {index + 1}")
        self.index = index
        self.remove_callback = remove_callback

        self.var_x = tk.StringVar(value="-60" if index == 0 else "60")
        self.var_y = tk.StringVar(value="0")
        self.var_amp = tk.StringVar(value="3")
        self.var_wave = tk.StringVar(value="40")
        self.var_phase = tk.StringVar(value="0")

        self.columnconfigure(1, weight=1)
        self.columnconfigure(3, weight=1)

        self._make_row(0, "X position", self.var_x, "Source X position. Negative values are allowed.")
        self._make_row(1, "Y position", self.var_y, "Source Y position. Negative values are allowed.")
        self._make_row(2, "Amplitude", self.var_amp, "Wave height contribution from this source.")
        self._make_row(3, "Wavelength *", self.var_wave, "Distance between ripple peaks. Must be greater than zero.")
        self._make_row(4, "Phase (deg)", self.var_phase, "Phase offset in degrees.")

        self.btn_remove = ttk.Button(self, text="Remove this source", command=self._remove_me)
        self.btn_remove.grid(row=5, column=0, columnspan=4, sticky="e", padx=6, pady=(6, 4))

    def _make_row(self, row: int, label_text: str, variable: tk.StringVar, tooltip: str):
        lbl = ttk.Label(self, text=label_text)
        lbl.grid(row=row, column=0, sticky="w", padx=(8, 6), pady=4)
        ent = ttk.Entry(self, textvariable=variable)
        ent.grid(row=row, column=1, sticky="ew", padx=(0, 10), pady=4)
        ToolTip(lbl, tooltip)
        ToolTip(ent, tooltip)

    def _remove_me(self):
        self.remove_callback(self)

    def get_source(self) -> WaveSource:
        x = safe_float(self.var_x.get(), f"Source {self.index + 1} X position")
        y = safe_float(self.var_y.get(), f"Source {self.index + 1} Y position")
        amplitude = safe_float(self.var_amp.get(), f"Source {self.index + 1} amplitude")
        wavelength = safe_float(self.var_wave.get(), f"Source {self.index + 1} wavelength")
        phase_deg = safe_float(self.var_phase.get(), f"Source {self.index + 1} phase")
        if wavelength <= 0:
            raise ValueError(f"Source {self.index + 1} wavelength must be greater than zero.")
        return WaveSource(x=x, y=y, amplitude=amplitude, wavelength=wavelength, phase_deg=phase_deg)

    def refresh_title(self, index: int, allow_remove: bool):
        self.index = index
        self.configure(text=f"Source {index + 1}")
        self.btn_remove.configure(state=("normal" if allow_remove else "disabled"))


class PreviewWindow(tk.Toplevel):
    def __init__(self, master, X: np.ndarray, Y: np.ndarray, Z: np.ndarray, sources: Sequence[WaveSource]):
        super().__init__(master)
        self.title("Preview")
        self.geometry("900x620")

        if not MATPLOTLIB_OK:
            ttk.Label(self, text="matplotlib is not installed, so preview is unavailable.").pack(padx=20, pady=20)
            return

        fig, ax = plt.subplots(figsize=(8, 5))
        im = ax.imshow(
            Z,
            origin="lower",
            extent=[float(X.min()), float(X.max()), float(Y.min()), float(Y.max())],
            aspect="auto",
        )
        ax.set_title("Wave Interference Preview")
        ax.set_xlabel("X")
        ax.set_ylabel("Y")
        ax.scatter([s.x for s in sources], [s.y for s in sources], marker="x", s=80)
        fig.colorbar(im, ax=ax, label="Z height")
        fig.tight_layout()

        canvas = FigureCanvasTkAgg(fig, master=self)
        canvas.draw()
        canvas.get_tk_widget().pack(fill="both", expand=True)


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("1180x860")
        self.minsize(1000, 760)

        self.sources: List[SourceFrame] = []

        self.var_width = tk.StringVar(value="400")
        self.var_height = tk.StringVar(value="220")
        self.var_nx = tk.StringVar(value="120")
        self.var_ny = tk.StringVar(value="80")
        self.var_z_scale = tk.StringVar(value="1.0")
        self.var_falloff = tk.StringVar(value="0.004")
        self.var_clip_z = tk.StringVar(value="4")
        self.var_use_clip = tk.BooleanVar(value=True)
        self.var_normalize = tk.BooleanVar(value=False)
        self.var_z_offset = tk.StringVar(value="0")
        self.var_solid_thickness = tk.StringVar(value="10")

        self.var_export_png = tk.BooleanVar(value=True)
        self.var_export_stl = tk.BooleanVar(value=False)
        self.var_export_csv = tk.BooleanVar(value=False)
        self.var_export_xyz = tk.BooleanVar(value=False)
        self.var_export_step_surface = tk.BooleanVar(value=True)
        self.var_export_iges_surface = tk.BooleanVar(value=False)

        self.var_output_folder = tk.StringVar(value=str((Path.cwd() / "exports").resolve()))
        self.var_base_name = tk.StringVar(value="wave_surface")

        self._build_ui()
        self.add_source()
        self.add_source()
        self._update_cad_status()

    def _build_ui(self):
        outer = ttk.Frame(self, padding=10)
        outer.pack(fill="both", expand=True)

        outer.columnconfigure(0, weight=1)
        outer.columnconfigure(1, weight=0)
        outer.rowconfigure(0, weight=1)

        left = ttk.Frame(outer)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 10))
        left.columnconfigure(0, weight=1)

        right = ttk.Frame(outer)
        right.grid(row=0, column=1, sticky="ns")

        # Geometry
        geo = ttk.LabelFrame(left, text="Geometry")
        geo.grid(row=0, column=0, sticky="ew", pady=(0, 10))
        geo.columnconfigure(1, weight=1)
        geo.columnconfigure(3, weight=1)

        self._labeled_entry(geo, 0, 0, "Width *", self.var_width, "Panel width.")
        self._labeled_entry(geo, 0, 2, "Height *", self.var_height, "Panel height.")
        self._labeled_entry(geo, 1, 0, "Grid X *", self.var_nx, "Number of sample points across width.")
        self._labeled_entry(geo, 1, 2, "Grid Y *", self.var_ny, "Number of sample points across height.")
        self._labeled_entry(geo, 2, 0, "Z offset", self.var_z_offset, "Adds this amount to all Z values before export.")
        self._labeled_entry(geo, 2, 2, "Solid thickness", self.var_solid_thickness, "Reserved for future solid body operations.")

        # Surface shaping
        surf = ttk.LabelFrame(left, text="Surface shaping")
        surf.grid(row=1, column=0, sticky="ew", pady=(0, 10))
        surf.columnconfigure(1, weight=1)
        surf.columnconfigure(3, weight=1)

        self._labeled_entry(surf, 0, 0, "Z scale", self.var_z_scale, "Global multiplier on height.")
        self._labeled_entry(surf, 0, 2, "Falloff strength", self.var_falloff, "Edge fade amount. 0 disables falloff.")
        self._labeled_entry(surf, 1, 0, "Clip Z", self.var_clip_z, "Clamp relief height to +/- this value.")
        chk_clip = ttk.Checkbutton(surf, text="Use Clip Z", variable=self.var_use_clip)
        chk_clip.grid(row=1, column=2, columnspan=2, sticky="w", padx=8, pady=6)
        ToolTip(chk_clip, "Enable or disable height clipping.")
        chk_norm = ttk.Checkbutton(surf, text="Normalize combined wave", variable=self.var_normalize)
        chk_norm.grid(row=2, column=0, columnspan=2, sticky="w", padx=8, pady=6)
        ToolTip(chk_norm, "Normalize the combined wave before final scaling.")

        # Sources
        src_wrap = ttk.LabelFrame(left, text="Wave sources")
        src_wrap.grid(row=2, column=0, sticky="nsew", pady=(0, 10))
        src_wrap.columnconfigure(0, weight=1)
        left.rowconfigure(2, weight=1)

        btn_add_src = ttk.Button(src_wrap, text="Add source", command=self.add_source)
        btn_add_src.grid(row=0, column=0, sticky="w", padx=8, pady=(8, 4))

        self.sources_container = ttk.Frame(src_wrap)
        self.sources_container.grid(row=1, column=0, sticky="nsew", padx=6, pady=6)
        self.sources_container.columnconfigure(0, weight=1)

        # Export outputs
        out = ttk.LabelFrame(left, text="Outputs")
        out.grid(row=3, column=0, sticky="ew", pady=(0, 10))
        out.columnconfigure(1, weight=1)

        self._labeled_entry(out, 0, 0, "Base name *", self.var_base_name, "Base filename used for all exports.")
        self._labeled_entry(out, 1, 0, "Output folder *", self.var_output_folder, "Folder where exports are written.")

        btn_browse = ttk.Button(out, text="Browse...", command=self._browse_output_folder)
        btn_browse.grid(row=1, column=2, sticky="w", padx=6, pady=4)

        fmt = ttk.Frame(out)
        fmt.grid(row=2, column=0, columnspan=3, sticky="ew", padx=6, pady=8)
        for i in range(3):
            fmt.columnconfigure(i, weight=1)

        self.chk_png = ttk.Checkbutton(fmt, text="PNG preview", variable=self.var_export_png)
        self.chk_stl = ttk.Checkbutton(fmt, text="STL mesh", variable=self.var_export_stl)
        self.chk_csv = ttk.Checkbutton(fmt, text="CSV points", variable=self.var_export_csv)
        self.chk_xyz = ttk.Checkbutton(fmt, text="XYZ points", variable=self.var_export_xyz)
        self.chk_step = ttk.Checkbutton(fmt, text="STEP surface", variable=self.var_export_step_surface)
        self.chk_iges = ttk.Checkbutton(fmt, text="IGES surface", variable=self.var_export_iges_surface)

        self.chk_png.grid(row=0, column=0, sticky="w", padx=4, pady=3)
        self.chk_stl.grid(row=0, column=1, sticky="w", padx=4, pady=3)
        self.chk_csv.grid(row=0, column=2, sticky="w", padx=4, pady=3)
        self.chk_xyz.grid(row=1, column=0, sticky="w", padx=4, pady=3)
        self.chk_step.grid(row=1, column=1, sticky="w", padx=4, pady=3)
        self.chk_iges.grid(row=1, column=2, sticky="w", padx=4, pady=3)

        ToolTip(self.chk_step, "Exports a true fitted CAD surface as STEP if OCP is available.")
        ToolTip(self.chk_iges, "Exports a true fitted CAD surface as IGES if OCP is available.")

        # Right panel
        info = ttk.LabelFrame(right, text="Status / Notes")
        info.pack(fill="x")

        self.status_text = tk.Text(info, width=36, height=28, wrap="word")
        self.status_text.pack(fill="both", expand=True, padx=8, pady=8)
        self.status_text.insert(
            "1.0",
            "This tool computes an interference surface directly from the wave inputs and can export:\n\n"
            "- STEP surface\n"
            "- IGES surface\n"
            "- STL mesh\n"
            "- PNG preview\n"
            "- CSV/XYZ point data\n\n"
            "STEP is the preferred direct CAD export when OCP works.\n",
        )
        self.status_text.configure(state="disabled")

        self.cad_status = ttk.Label(right, text="", foreground="#8a3b00", wraplength=260, justify="left")
        self.cad_status.pack(fill="x", pady=(10, 10))

        actions = ttk.Frame(right)
        actions.pack(fill="x", pady=(10, 0))

        btn_preview = ttk.Button(actions, text="Preview", command=self.preview)
        btn_export = ttk.Button(actions, text="Export", command=self.export)
        btn_quit = ttk.Button(actions, text="Quit", command=self.destroy)

        btn_preview.pack(fill="x", pady=4)
        btn_export.pack(fill="x", pady=4)
        btn_quit.pack(fill="x", pady=4)

    def _browse_output_folder(self):
        folder = filedialog.askdirectory(initialdir=self.var_output_folder.get() or str(Path.cwd()))
        if folder:
            self.var_output_folder.set(folder)

    def _labeled_entry(self, parent, row, col, label_text, var, tooltip):
        lbl = ttk.Label(parent, text=label_text)
        lbl.grid(row=row, column=col, sticky="w", padx=(8, 6), pady=4)
        ent = ttk.Entry(parent, textvariable=var)
        ent.grid(row=row, column=col + 1, sticky="ew", padx=(0, 8), pady=4)
        ToolTip(lbl, tooltip)
        ToolTip(ent, tooltip)

    def add_source(self):
        idx = len(self.sources)
        sf = SourceFrame(self.sources_container, idx, self.remove_source)
        sf.grid(row=idx, column=0, sticky="ew", pady=6)
        self.sources.append(sf)
        self._refresh_sources()

    def remove_source(self, src_frame: SourceFrame):
        if len(self.sources) <= 1:
            return
        self.sources.remove(src_frame)
        src_frame.destroy()
        self._refresh_sources()

    def _refresh_sources(self):
        for i, src in enumerate(self.sources):
            src.grid(row=i, column=0, sticky="ew", pady=6)
            src.refresh_title(i, allow_remove=(len(self.sources) > 1))

    def _update_cad_status(self):
        if OCP_OK:
            self.cad_status.configure(
                text="CAD export backend detected. STEP and IGES export should be available.",
                foreground="#0a6f2a",
            )
        else:
            self.cad_status.configure(
                text=(
                    "CAD export backend not available.\n\n"
                    "STEP and IGES export will fail until OCP is installed in this environment.\n\n"
                    f"Import error:\n{OCP_IMPORT_ERROR}"
                ),
                foreground="#8a3b00",
            )

    def _collect_inputs(self):
        width = safe_float(self.var_width.get(), "Width")
        height = safe_float(self.var_height.get(), "Height")
        nx = safe_int(self.var_nx.get(), "Grid X")
        ny = safe_int(self.var_ny.get(), "Grid Y")
        z_scale = safe_float(self.var_z_scale.get(), "Z scale")
        falloff = safe_float(self.var_falloff.get(), "Falloff strength")
        z_offset = safe_float(self.var_z_offset.get(), "Z offset")
        _solid_thickness = safe_float(self.var_solid_thickness.get(), "Solid thickness")

        clip_z = None
        if self.var_use_clip.get():
            clip_z = safe_float(self.var_clip_z.get(), "Clip Z")
            if clip_z <= 0:
                raise ValueError("Clip Z must be greater than zero if enabled.")

        output_folder = Path(self.var_output_folder.get().strip())
        base_name = self.var_base_name.get().strip()
        if not base_name:
            raise ValueError("Base name is required.")

        sources = [src.get_source() for src in self.sources]

        return {
            "width": width,
            "height": height,
            "nx": nx,
            "ny": ny,
            "z_scale": z_scale,
            "falloff": falloff,
            "clip_z": clip_z,
            "normalize": self.var_normalize.get(),
            "z_offset": z_offset,
            "output_folder": output_folder,
            "base_name": base_name,
            "sources": sources,
            "export_png": self.var_export_png.get(),
            "export_stl": self.var_export_stl.get(),
            "export_csv": self.var_export_csv.get(),
            "export_xyz": self.var_export_xyz.get(),
            "export_step_surface": self.var_export_step_surface.get(),
            "export_iges_surface": self.var_export_iges_surface.get(),
        }

    def _generate_surface(self):
        cfg = self._collect_inputs()
        X, Y = build_grid(cfg["width"], cfg["height"], cfg["nx"], cfg["ny"])
        Z = compute_surface(
            X,
            Y,
            cfg["sources"],
            z_scale=cfg["z_scale"],
            falloff_strength=cfg["falloff"],
            normalize=cfg["normalize"],
            clip_z=cfg["clip_z"],
        )
        return cfg, X, Y, Z

    def preview(self):
        try:
            cfg, X, Y, Z = self._generate_surface()
            PreviewWindow(self, X, Y, Z, cfg["sources"])
        except Exception as exc:
            messagebox.showerror("Preview error", str(exc))

    def export(self):
        try:
            cfg, X, Y, Z = self._generate_surface()
            ensure_dir(cfg["output_folder"])

            if not (
                cfg["export_png"]
                or cfg["export_stl"]
                or cfg["export_csv"]
                or cfg["export_xyz"]
                or cfg["export_step_surface"]
                or cfg["export_iges_surface"]
            ):
                raise ValueError("Select at least one export format.")

            base = cfg["output_folder"] / cfg["base_name"]
            exported = []

            if cfg["export_png"]:
                png_path = base.with_suffix(".png")
                write_png_preview(png_path, X, Y, Z, cfg["sources"])
                exported.append(png_path.name)

            if cfg["export_stl"]:
                stl_path = base.with_suffix(".stl")
                write_ascii_stl(stl_path, X, Y, Z, z_offset=cfg["z_offset"])
                exported.append(stl_path.name)

            if cfg["export_csv"]:
                csv_path = base.with_suffix(".csv")
                write_csv_points(csv_path, X, Y, Z, z_offset=cfg["z_offset"])
                exported.append(csv_path.name)

            if cfg["export_xyz"]:
                xyz_path = base.with_suffix(".xyz")
                write_xyz_points(xyz_path, X, Y, Z, z_offset=cfg["z_offset"])
                exported.append(xyz_path.name)

            need_cad = cfg["export_step_surface"] or cfg["export_iges_surface"]
            face = None
            if need_cad:
                face = build_bspline_face(X, Y, Z, z_offset=cfg["z_offset"])

            if cfg["export_step_surface"]:
                step_path = base.with_suffix(".step")
                export_step_surface(step_path, face)
                exported.append(step_path.name)

            if cfg["export_iges_surface"]:
                iges_path = base.with_suffix(".igs")
                export_iges_surface(iges_path, face)
                exported.append(iges_path.name)

            messagebox.showinfo(
                "Export complete",
                "Exported files:\n\n" + "\n".join(exported) + f"\n\nFolder:\n{cfg['output_folder']}",
            )

        except Exception as exc:
            tb = traceback.format_exc()
            messagebox.showerror("Export error", f"{exc}\n\nDetails:\n{tb}")


def main():
    app = App()
    app.mainloop()


if __name__ == "__main__":
    main()