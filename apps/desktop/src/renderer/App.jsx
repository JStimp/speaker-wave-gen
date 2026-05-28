import { useMemo, useState } from "react";
import { Box, Download, FolderOpen, Save, RotateCcw, Waves } from "lucide-react";
import {
  createDefaultProject,
  generatePreviewMesh,
  validateProject
} from "@speaker-wave-gen/core";
import Viewport from "./components/Viewport.jsx";
import { updateAtPath, updateDriver, updateDriverSource } from "./lib/project-state.js";

export default function App() {
  const [project, setProject] = useState(() => createDefaultProject());
  const [projectPath, setProjectPath] = useState(null);
  const [status, setStatus] = useState("Ready");
  const validation = useMemo(() => validateProject(project), [project]);
  const mesh = useMemo(() => generatePreviewMesh(validation.project), [validation.project]);

  async function openProject() {
    const result = await window.wavecad?.openProject();
    if (!result || result.canceled) return;
    setProject(result.project);
    setProjectPath(result.path);
    setStatus(`Opened ${shortPath(result.path)}`);
  }

  async function saveProject() {
    const result = await window.wavecad?.saveProject(project, projectPath);
    if (!result || result.canceled) return;
    setProjectPath(result.path);
    setStatus(`Saved ${shortPath(result.path)}`);
  }

  async function exportProject() {
    setStatus("Export running...");
    const result = await window.wavecad?.exportProject(validation.project);
    if (!result || result.canceled) {
      setStatus("Export canceled");
      return;
    }
    setStatus(result.ok ? `Exported to ${shortPath(result.outDir)}` : `Export failed: ${result.stderr || "see terminal"}`);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Box size={22} />
          <div>
            <h1>Speaker Wave CAD</h1>
            <p>{validation.project.project.name}</p>
          </div>
        </div>
        <nav className="toolbar" aria-label="Project actions">
          <button type="button" className="icon-button" onClick={() => setProject(createDefaultProject())} title="Reset project">
            <RotateCcw size={18} />
          </button>
          <button type="button" className="icon-button" onClick={openProject} title="Open project">
            <FolderOpen size={18} />
          </button>
          <button type="button" className="icon-button" onClick={saveProject} title="Save project">
            <Save size={18} />
          </button>
          <button type="button" className="primary-button" onClick={exportProject}>
            <Download size={18} />
            Export
          </button>
        </nav>
      </header>

      <section className="workspace">
        <Viewport mesh={mesh} project={validation.project} />
        <aside className="side-panel">
          <div className="status-strip">
            <span className={validation.ok ? "status-dot ok" : "status-dot error"} />
            <span>{validation.ok ? status : validation.errors[0]}</span>
          </div>

          <ControlSection title="Cabinet" icon={<Box size={16} />}>
            <SelectControl
              label="Shape preset"
              value={project.cabinet.preset}
              options={[
                ["rectangular", "Rectangular"],
                ["wedge", "Wedge"],
                ["rounded", "Rounded"],
                ["curvedSides", "Curved sides"]
              ]}
              onChange={(value) => setProject(updateAtPath(project, ["cabinet", "preset"], value))}
            />
            <NumberControl label="Width" value={project.cabinet.dimensions.width} unit={project.units} onChange={(value) => setProject(updateAtPath(project, ["cabinet", "dimensions", "width"], value))} />
            <NumberControl label="Height" value={project.cabinet.dimensions.height} unit={project.units} onChange={(value) => setProject(updateAtPath(project, ["cabinet", "dimensions", "height"], value))} />
            <NumberControl label="Depth" value={project.cabinet.dimensions.depth} unit={project.units} onChange={(value) => setProject(updateAtPath(project, ["cabinet", "dimensions", "depth"], value))} />
            <NumberControl label="Wall" value={project.cabinet.dimensions.wallThickness} unit={project.units} onChange={(value) => setProject(updateAtPath(project, ["cabinet", "dimensions", "wallThickness"], value))} />
          </ControlSection>

          <ControlSection title="Waves" icon={<Waves size={16} />}>
            <NumberControl label="Relief depth" value={project.waves.reliefDepth} unit={project.units} step={0.25} onChange={(value) => setProject(updateAtPath(project, ["waves", "reliefDepth"], value))} />
            <NumberControl label="Base amp" value={project.waves.baseAmplitude} step={0.1} onChange={(value) => setProject(updateAtPath(project, ["waves", "baseAmplitude"], value))} />
            <NumberControl label="Bias" value={project.waves.reliefBias} unit={project.units} step={0.1} onChange={(value) => setProject(updateAtPath(project, ["waves", "reliefBias"], value))} />
            <SelectControl
              label="Preview"
              value={project.preview.resolution}
              options={[
                ["draft", "Draft"],
                ["low", "Low"],
                ["medium", "Medium"],
                ["high", "High"],
                ["ultra", "Ultra"]
              ]}
              onChange={(value) => setProject(updateAtPath(project, ["preview", "resolution"], value))}
            />
          </ControlSection>

          <ControlSection title="Drivers">
            {project.drivers.map((driver) => (
              <div className="driver-editor" key={driver.id}>
                <div className="driver-title">
                  <strong>{driver.label}</strong>
                  <label>
                    <input
                      type="checkbox"
                      checked={driver.source.enabled}
                      onChange={(event) => setProject(updateDriverSource(project, driver.id, { enabled: event.target.checked }))}
                    />
                    Source
                  </label>
                </div>
                <NumberControl label="X" value={driver.center.x} unit={project.units} onChange={(value) => setProject(updateDriver(project, driver.id, { center: { ...driver.center, x: value } }))} />
                <NumberControl label="Y" value={driver.center.y} unit={project.units} onChange={(value) => setProject(updateDriver(project, driver.id, { center: { ...driver.center, y: value } }))} />
                <NumberControl label="Diameter" value={driver.diameter} unit={project.units} onChange={(value) => setProject(updateDriver(project, driver.id, { diameter: value }))} />
                <NumberControl label="Amplitude" value={driver.source.amplitude} unit={project.units} step={0.1} onChange={(value) => setProject(updateDriverSource(project, driver.id, { amplitude: value }))} />
                <NumberControl label="Wavelength" value={driver.source.wavelength} unit={project.units} onChange={(value) => setProject(updateDriverSource(project, driver.id, { wavelength: value }))} />
              </div>
            ))}
          </ControlSection>

          <ControlSection title="Mesh">
            <Metric label="Vertices" value={mesh.summary.vertexCount.toLocaleString()} />
            <Metric label="Triangles" value={mesh.summary.triangleCount.toLocaleString()} />
            <Metric label="Relief min" value={`${mesh.summary.minHeight.toFixed(2)} ${project.units}`} />
            <Metric label="Relief max" value={`${mesh.summary.maxHeight.toFixed(2)} ${project.units}`} />
          </ControlSection>
        </aside>
      </section>
    </main>
  );
}

function ControlSection({ title, icon, children }) {
  return (
    <section className="control-section">
      <h2>{icon}{title}</h2>
      {children}
    </section>
  );
}

function NumberControl({ label, value, onChange, unit, step = 1 }) {
  return (
    <label className="control-row">
      <span>{label}</span>
      <span className="input-wrap">
        <input
          type="number"
          value={value}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {unit ? <small>{unit}</small> : null}
      </span>
    </label>
  );
}

function SelectControl({ label, value, options, onChange }) {
  return (
    <label className="control-row">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function shortPath(value) {
  if (!value) return "";
  const parts = value.split(/[\\/]/);
  return parts.slice(-2).join("/");
}

