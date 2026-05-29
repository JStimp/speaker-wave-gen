(function () {
  "use strict";

  const Geometry = window.WaveGeometry;
  const Exporters = window.WaveExporters;
  const UNIT_LABELS = { in: "in", mm: "mm" };
  let project = Geometry.createDefaultProject();
  let mesh = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let previewRoot = null;
  let grid = null;
  let activeDimension = null;
  let rebuildTimer = 0;

  window.addEventListener("DOMContentLoaded", init);

  function init() {
    initThree();
    bindControls();
    syncForm();
    rebuild();
  }

  function initThree() {
    const viewer = document.getElementById("viewer");
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x10120f);

    camera = new THREE.PerspectiveCamera(38, 1, 1, 6000);
    camera.up.set(0, 0, 1);
    camera.position.set(28, -34, 24);

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    viewer.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, project.cabinet.dimensions.height / 2);

    scene.add(new THREE.AmbientLight(0xf3f1df, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(600, 850, 900);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb7d6b2, 0.75);
    fill.position.set(-700, -300, 500);
    scene.add(fill);

    grid = new THREE.GridHelper(1100, 22, 0x3b3d34, 0x252820);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0;
    scene.add(grid);

    window.addEventListener("resize", resize);
    resize();
    animate();
  }

  function bindControls() {
    document.getElementById("project-name").addEventListener("input", (event) => {
      project.project.name = event.target.value;
      scheduleRebuild();
    });

    document.getElementById("unit-select").addEventListener("change", (event) => {
      const nextUnits = event.target.value;
      const currentUnits = project.units || "in";
      if (nextUnits !== currentUnits) {
        convertProjectUnits(project, currentUnits, nextUnits);
        project.units = nextUnits;
        syncForm();
        rebuild();
      }
    });

    document.getElementById("reset-view").addEventListener("click", resetView);

    document.querySelectorAll("[data-path]").forEach((input) => {
      input.addEventListener("input", () => {
        setPath(project, input.dataset.path, valueFromInput(input));
        scheduleRebuild();
      });
      input.addEventListener("change", () => {
        setPath(project, input.dataset.path, valueFromInput(input));
        scheduleRebuild();
      });
    });

    document.querySelectorAll("[data-dimension]").forEach((input) => {
      input.addEventListener("focus", () => {
        activeDimension = input.dataset.dimension;
        if (mesh) drawMesh(mesh);
      });
      input.addEventListener("blur", () => {
        activeDimension = null;
        if (mesh) drawMesh(mesh);
      });
    });

    document.getElementById("add-driver").addEventListener("click", () => {
      const count = project.drivers.length + 1;
      project.drivers.push({
        id: "driver-" + count,
        label: "Driver " + count,
        face: "front",
        center: { x: 0, z: project.cabinet.dimensions.height / 2 },
        diameter: lengthValue(5.5),
        source: {
          enabled: true,
          amplitude: lengthValue(0.1),
          wavelength: lengthValue(3.75),
          phase: 0,
          falloff: falloffValue(0.046)
        }
      });
      renderSources();
      scheduleRebuild();
    });

    document.getElementById("add-source").addEventListener("click", () => {
      const id = "source-" + (project.manualSources.length + 1);
      project.manualSources.push({
        id,
        label: "Point source",
        face: "front",
        enabled: true,
        center: { x: 0, z: project.cabinet.dimensions.height / 2 },
        amplitude: lengthValue(0.06),
        wavelength: lengthValue(4),
        phase: 0,
        falloff: falloffValue(0.038)
      });
      renderSources();
      scheduleRebuild();
    });

    document.getElementById("save-json").addEventListener("click", () => Exporters.exportProjectJson(project));
    document.getElementById("export-obj").addEventListener("click", () => Exporters.exportObj(project, mesh));
    document.getElementById("export-stl").addEventListener("click", () => Exporters.exportStl(project, mesh));
    document.getElementById("save-png").addEventListener("click", saveScreenshot);
    document.getElementById("load-project").addEventListener("change", loadProjectFile);
  }

  function syncForm() {
    document.getElementById("project-name").value = project.project.name;
    document.getElementById("unit-select").value = project.units || "in";
    document.querySelectorAll("[data-path]").forEach((input) => {
      const value = getPath(project, input.dataset.path);
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = value;
    });
    renderSources();
  }

  function renderSources() {
    const container = document.getElementById("sources");
    const all = project.drivers.map((driver, index) => ({ type: "driver", item: driver, index }))
      .concat(project.manualSources.map((source, index) => ({ type: "manual", item: source, index })));

    container.innerHTML = "";

    all.forEach((entry) => {
      const item = entry.item;
      const card = document.createElement("div");
      card.className = "source-card";
      card.innerHTML = sourceTemplate(entry.type, item, entry.index);
      container.appendChild(card);
    });

    container.querySelectorAll("[data-source-field]").forEach((input) => {
      input.addEventListener("input", () => updateSourceFromInput(input));
      input.addEventListener("change", () => updateSourceFromInput(input));
    });

    container.querySelectorAll("[data-remove-source]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.sourceType === "driver") project.drivers.splice(Number(button.dataset.index), 1);
        else project.manualSources.splice(Number(button.dataset.index), 1);
        renderSources();
        scheduleRebuild();
      });
    });
  }

  function sourceTemplate(type, item, index) {
    const source = type === "driver" ? item.source : item;
    const center = item.center || source.center;
    const remove = '<button class="remove" type="button" data-remove-source data-source-type="' + type + '" data-index="' + index + '">Remove</button>';
    const label = item.label || item.id;
    return [
      '<div class="source-header"><strong>' + escapeHtml(label) + '</strong>' + remove + '</div>',
      '<label class="check"><input data-source-field="enabled" data-source-type="' + type + '" data-index="' + index + '" type="checkbox" ' + (source.enabled !== false ? "checked" : "") + '> Enabled</label>',
      '<div class="grid-2">',
      textField("Name", "label", label, type, index),
      field("X", "x", center.x, type, index, lengthStep()),
      field("Z height", "z", center.z, type, index, lengthStep()),
      type === "driver" ? field("Diameter", "diameter", item.diameter, type, index, lengthStep()) : "",
      field("Amplitude", "amplitude", source.amplitude, type, index, smallLengthStep()),
      field("Wavelength", "wavelength", source.wavelength, type, index, lengthStep()),
      field("Phase", "phase", source.phase, type, index, 0.1),
      field("Falloff", "falloff", source.falloff, type, index, 0.0001),
      "</div>"
    ].join("");
  }

  function field(label, fieldName, value, type, index, step) {
    return '<label>' + label + '<input data-source-field="' + fieldName + '" data-source-type="' + type + '" data-index="' + index + '" type="number" step="' + step + '" value="' + value + '"></label>';
  }

  function textField(label, fieldName, value, type, index) {
    return '<label>' + label + '<input data-source-field="' + fieldName + '" data-source-type="' + type + '" data-index="' + index + '" type="text" value="' + escapeHtml(value) + '"></label>';
  }

  function updateSourceFromInput(input) {
    const type = input.dataset.sourceType;
    const index = Number(input.dataset.index);
    const fieldName = input.dataset.sourceField;
    const item = type === "driver" ? project.drivers[index] : project.manualSources[index];
    const source = type === "driver" ? item.source : item;
    const value = valueFromInput(input);

    if (fieldName === "label") item.label = value;
    else if (fieldName === "enabled") source.enabled = value;
    else if (fieldName === "x" || fieldName === "z") item.center[fieldName] = value;
    else if (fieldName === "diameter") item.diameter = value;
    else source[fieldName] = value;

    scheduleRebuild();
  }

  function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(rebuild, 80);
  }

  function rebuild() {
    project = Geometry.normalizeProject(project);
    mesh = Geometry.generatePreviewMesh(project);
    drawMesh(mesh);
    updateStats();
  }

  function drawMesh(nextMesh) {
    if (previewRoot) {
      scene.remove(previewRoot);
      disposeObject(previewRoot);
    }

    previewRoot = new THREE.Group();
    const dims = project.cabinet.dimensions;

    if (grid) {
      grid.visible = project.preview.showGrid !== false;
      const gridSpan = Math.max(dims.width, dims.depth) * 1.8;
      grid.scale.setScalar(gridSpan / 1100);
      grid.position.z = 0;
    }
    if (project.preview.showOutline) previewRoot.add(createOutlineBox(dims));
    if (project.preview.showAxes) previewRoot.add(createAxes(dims));
    if (project.preview.showDimensions) previewRoot.add(createDimensionGuides(dims));
    previewRoot.add(createSurface(nextMesh));

    if (project.preview.showPanels) previewRoot.add(createWire(nextMesh));
    if (project.preview.showSeams) previewRoot.add(createSeams(nextMesh.overlays.seams));
    if (project.preview.showDrivers) previewRoot.add(createDriverRings(nextMesh.overlays.drivers));
    if (project.preview.showSources) previewRoot.add(createSources(nextMesh.overlays.sources));

    scene.add(previewRoot);
  }

  function createOutlineBox(dims) {
    const geometry = new THREE.BoxGeometry(dims.width, dims.depth, dims.height);
    const edges = new THREE.EdgesGeometry(geometry);
    geometry.dispose();
    const material = new THREE.LineBasicMaterial({ color: 0xf4e3a0, transparent: true, opacity: 0.72 });
    const box = new THREE.LineSegments(edges, material);
    box.position.z = dims.height / 2;
    return box;
  }

  function createAxes(dims) {
    const group = new THREE.Group();
    const scale = visualScale(dims);
    const length = Math.max(dims.width, dims.height, dims.depth) * 0.38;
    const originMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f1df, emissive: 0x222018 });
    const origin = new THREE.Mesh(new THREE.SphereGeometry(scale * 0.08, 20, 14), originMaterial);
    group.add(origin);

    group.add(createAxisArrow(new THREE.Vector3(1, 0, 0), length, 0xf05b4f, "X", scale));
    group.add(createAxisArrow(new THREE.Vector3(0, 1, 0), length, 0x54c46b, "Y", scale));
    group.add(createAxisArrow(new THREE.Vector3(0, 0, 1), length, 0x4f8df0, "Z", scale));
    group.add(createLabelSprite("Origin", "#f4f1df", new THREE.Vector3(scale * 0.18, scale * 0.18, scale * 0.18), scale * 0.72, scale * 0.24));
    return group;
  }

  function createAxisArrow(direction, length, color, label, scale) {
    const group = new THREE.Group();
    const arrow = new THREE.ArrowHelper(direction, new THREE.Vector3(0, 0, 0), length, color, scale * 0.24, scale * 0.12);
    const labelPosition = direction.clone().multiplyScalar(length + scale * 0.28);
    group.add(arrow);
    group.add(createLabelSprite(label, "#" + color.toString(16).padStart(6, "0"), labelPosition, scale * 0.34, scale * 0.34));
    return group;
  }

  function createDimensionGuides(dims) {
    const group = new THREE.Group();
    const scale = visualScale(dims);
    const offset = scale * 0.54;
    const w = dims.width / 2;
    const d = dims.depth / 2;
    const h = dims.height;
    const y = -d - offset;
    const x = w + offset;
    const leftX = -w - offset;

    group.add(createDimensionLine(
      new THREE.Vector3(-w, y, 0),
      new THREE.Vector3(w, y, 0),
      "X width " + fmtDimension(dims.width),
      0xf05b4f,
      activeDimension === "x",
      scale
    ));
    group.add(createDimensionLine(
      new THREE.Vector3(x, -d, 0),
      new THREE.Vector3(x, d, 0),
      "Y depth " + fmtDimension(dims.depth),
      0x54c46b,
      activeDimension === "y",
      scale
    ));
    group.add(createDimensionLine(
      new THREE.Vector3(leftX, d + offset, 0),
      new THREE.Vector3(leftX, d + offset, h),
      "Z height " + fmtDimension(dims.height),
      0x4f8df0,
      activeDimension === "z",
      scale
    ));
    return group;
  }

  function createDimensionLine(start, end, label, color, active, scale) {
    const group = new THREE.Group();
    const direction = end.clone().sub(start).normalize();
    const opacity = active ? 1 : 0.58;
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    group.add(new THREE.Line(geometry, material));
    group.add(createGuideCone(end, direction, color, opacity, scale));
    group.add(createGuideCone(start, direction.clone().multiplyScalar(-1), color, opacity, scale));

    const midpoint = start.clone().lerp(end, 0.5);
    const labelOffset = new THREE.Vector3(0, 0, active ? scale * 0.25 : scale * 0.18);
    group.add(createLabelSprite(label, "#" + color.toString(16).padStart(6, "0"), midpoint.add(labelOffset), active ? scale * 1.28 : scale * 1.16, scale * 0.25));
    return group;
  }

  function createGuideCone(position, direction, color, opacity, scale) {
    const geometry = new THREE.ConeGeometry(scale * 0.08, scale * 0.2, 18);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
    const cone = new THREE.Mesh(geometry, material);
    cone.position.copy(position);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    return cone;
  }

  function createLabelSprite(text, color, position, width, height) {
    const canvas = document.createElement("canvas");
    const canvasWidth = 320;
    const canvasHeight = 76;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    ctx.font = "600 24px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(17, 18, 16, 0.72)";
    roundRect(ctx, 2, 2, canvasWidth - 4, canvasHeight - 4, 18);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.9;
    roundRect(ctx, 3, 3, canvasWidth - 6, canvasHeight - 6, 18);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.fillText(text, canvasWidth / 2, canvasHeight / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(width, height, 1);
    return sprite;
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function createSurface(nextMesh) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(nextMesh.vertices, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(nextMesh.normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(heightColors(nextMesh.heights), 3));
    geometry.setIndex(nextMesh.indices);
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.02,
      side: THREE.DoubleSide
    });

    return new THREE.Mesh(geometry, material);
  }

  function createWire(nextMesh) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(nextMesh.vertices, 3));
    geometry.setIndex(nextMesh.indices);
    const wireGeometry = new THREE.WireframeGeometry(geometry);
    geometry.dispose();
    const material = new THREE.LineBasicMaterial({ color: 0xd6e6ef, transparent: true, opacity: 0.12 });
    return new THREE.LineSegments(wireGeometry, material);
  }

  function createSeams(lines) {
    const positions = [];
    lines.forEach((line) => {
      positions.push(line.a.x, line.a.y, line.a.z, line.b.x, line.b.y, line.b.z);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    return new THREE.LineSegments(geometry, material);
  }

  function createDriverRings(drivers) {
    const group = new THREE.Group();
    drivers.forEach((driver) => {
      const points = [];
      const radius = driver.diameter / 2;
      for (let i = 0; i <= 80; i += 1) {
        const angle = (i / 80) * Math.PI * 2;
        points.push(new THREE.Vector3(driver.center.x + Math.cos(angle) * radius, driver.center.y, driver.center.z + Math.sin(angle) * radius));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: driver.enabled ? 0xf5c542 : 0x7f8790 });
      group.add(new THREE.Line(geometry, material));
    });
    return group;
  }

  function createSources(sources) {
    const group = new THREE.Group();
    const dims = project.cabinet.dimensions;
    const scale = visualScale(dims);
    sources.forEach((source) => {
      const geometry = new THREE.SphereGeometry(scale * 0.07, 16, 12);
      const material = new THREE.MeshStandardMaterial({ color: 0xff6b5f, emissive: 0x44120f });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(source.center.x, dims.depth / 2 + scale * 0.1, source.center.z);
      group.add(sphere);
    });
    return group;
  }

  function heightColors(heights) {
    const min = Math.min.apply(null, heights);
    const max = Math.max.apply(null, heights);
    const span = Math.max(0.0001, max - min);
    const colors = [];
    const low = new THREE.Color(0x315f58);
    const mid = new THREE.Color(0xd2ae57);
    const high = new THREE.Color(0xf2f0df);
    heights.forEach((height) => {
      const t = (height - min) / span;
      const color = t < 0.55 ? low.clone().lerp(mid, t / 0.55) : mid.clone().lerp(high, (t - 0.55) / 0.45);
      colors.push(color.r, color.g, color.b);
    });
    return colors;
  }

  function disposeObject(object) {
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(disposeMaterial);
        else disposeMaterial(child.material);
      }
    });
  }

  function disposeMaterial(material) {
    if (material.map) material.map.dispose();
    material.dispose();
  }

  function updateStats() {
    const summary = mesh.summary;
    document.getElementById("mesh-stats").textContent =
      summary.vertexCount.toLocaleString() + " verts / " +
      summary.triangleCount.toLocaleString() + " tris / " +
      summary.minHeight.toFixed(3) + " to " + summary.maxHeight.toFixed(3) + " " + unitLabel();
  }

  function resize() {
    const viewer = document.getElementById("viewer");
    const bounds = viewer.getBoundingClientRect();
    renderer.setSize(bounds.width, bounds.height, false);
    camera.aspect = bounds.width / bounds.height;
    camera.updateProjectionMatrix();
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  function resetView() {
    const dims = project.cabinet.dimensions;
    const span = Math.max(dims.width, dims.height, dims.depth);
    camera.position.set(span * 0.85, -span * 1.08, span * 0.74);
    controls.target.set(0, 0, dims.height / 2);
    controls.update();
  }

  function saveScreenshot() {
    renderer.render(scene, camera);
    const link = document.createElement("a");
    link.href = renderer.domElement.toDataURL("image/png");
    link.download = "wavegen3d-preview.png";
    link.click();
  }

  function loadProjectFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        project = Geometry.normalizeProject(JSON.parse(reader.result));
        syncForm();
        rebuild();
      } catch (error) {
        alert("Could not load project JSON: " + error.message);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function getPath(source, path) {
    return path.split(".").reduce((target, key) => target[key], source);
  }

  function setPath(source, path, value) {
    const parts = path.split(".");
    let target = source;
    for (let i = 0; i < parts.length - 1; i += 1) target = target[parts[i]];
    target[parts[parts.length - 1]] = value;
  }

  function valueFromInput(input) {
    if (input.type === "checkbox") return input.checked;
    if (input.type === "number") return Number(input.value);
    return input.value;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character]));
  }

  function fmtDimension(value) {
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 }) + " " + unitLabel();
  }

  function unitLabel() {
    return UNIT_LABELS[project.units] || project.units || "in";
  }

  function visualScale(dims) {
    return Math.max(dims.width, dims.height, dims.depth, 1);
  }

  function lengthValue(inches) {
    return project.units === "mm" ? inches * 25.4 : inches;
  }

  function lengthStep() {
    return project.units === "mm" ? 1 : 0.125;
  }

  function smallLengthStep() {
    return project.units === "mm" ? 0.1 : 0.01;
  }

  function falloffValue(perInch) {
    return project.units === "mm" ? perInch / 25.4 : perInch;
  }

  function convertProjectUnits(target, from, to) {
    const factor = unitFactor(from, to);
    if (factor === 1) return;

    multiplyFields(target.cabinet.dimensions, ["width", "height", "depth", "wallThickness"], factor);
    multiplyFields(target.waves, ["reliefDepth", "reliefBias", "minThickness"], factor);
    convertSourceList(target.drivers, factor);
    convertSourceList(target.manualSources, factor);

    if (target.panelization) multiplyFields(target.panelization, ["kerf", "edgeAllowance"], factor);
  }

  function convertSourceList(items, factor) {
    items.forEach((item) => {
      if (item.center) multiplyFields(item.center, ["x", "z"], factor);
      if (Number.isFinite(Number(item.diameter))) item.diameter *= factor;
      const source = item.source || item;
      multiplyFields(source, ["amplitude", "wavelength"], factor);
      if (Number.isFinite(Number(source.falloff))) source.falloff /= factor;
    });
  }

  function multiplyFields(target, fields, factor) {
    fields.forEach((fieldName) => {
      if (target && Number.isFinite(Number(target[fieldName]))) target[fieldName] *= factor;
    });
  }

  function unitFactor(from, to) {
    if (from === to) return 1;
    if (from === "in" && to === "mm") return 25.4;
    if (from === "mm" && to === "in") return 1 / 25.4;
    return 1;
  }
}());
