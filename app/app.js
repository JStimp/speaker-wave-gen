(function () {
  "use strict";

  const Geometry = window.WaveGeometry;
  const Exporters = window.WaveExporters;
  const UNIT_LABELS = { in: "in", mm: "mm" };
  const SOURCE_COLORS = [0xf05b4f, 0x54c46b, 0x4f8df0, 0xd6b84d, 0xc678dd, 0x4fd0c8, 0xff8a3d];
  let project = Geometry.createDefaultProject();
  let mesh = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let previewRoot = null;
  let grid = null;
  let raycaster = null;
  let pointer = null;
  let selectedSourceKey = "driver:0";
  let activeDimension = null;
  let rebuildTimer = 0;
  let viewInitialized = false;
  const labelWorldPosition = new THREE.Vector3();
  const rendererSize = new THREE.Vector2();

  window.addEventListener("DOMContentLoaded", init);

  function init() {
    initThree();
    initTooltipSystem();
    bindControls();
    syncForm();
    rebuild();
  }

  function initThree() {
    const viewer = document.getElementById("viewer");
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x10120f);

    camera = new THREE.PerspectiveCamera(34, 1, 1, 6000);
    camera.up.set(0, 0, 1);
    camera.position.set(26, 36, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    viewer.appendChild(renderer.domElement);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);

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
    const rim = new THREE.DirectionalLight(0x8fb5ff, 0.42);
    rim.position.set(-450, 650, 250);
    scene.add(rim);

    grid = new THREE.GridHelper(1100, 22, 0x3b3d34, 0x252820);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0;
    scene.add(grid);
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

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
        updateControlAvailability();
        scheduleRebuild();
      });
      input.addEventListener("change", () => {
        setPath(project, input.dataset.path, valueFromInput(input));
        updateControlAvailability();
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
      const index = project.drivers.length;
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
      selectedSourceKey = "driver:" + index;
      renderSources();
      scheduleRebuild();
    });

    document.getElementById("add-source").addEventListener("click", () => {
      const index = project.manualSources.length;
      const id = "source-" + (index + 1);
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
      selectedSourceKey = "manual:" + index;
      renderSources();
      scheduleRebuild();
    });

    document.getElementById("save-json").addEventListener("click", () => {
      Exporters.exportProjectJson(project);
      setExportStatus("Saved project JSON.");
    });
    document.getElementById("export-obj").addEventListener("click", () => exportMesh("obj"));
    document.getElementById("export-stl").addEventListener("click", () => exportMesh("stl"));
    document.getElementById("export-step").addEventListener("click", () => exportMesh("step"));
    document.getElementById("prepare-solid-step").addEventListener("click", prepareSolidStepProject);
    document.getElementById("save-png").addEventListener("click", saveScreenshot);
    document.getElementById("load-project").addEventListener("change", loadProjectFile);
  }

  function initTooltipSystem() {
    const tooltip = document.createElement("div");
    tooltip.id = "floating-tooltip";
    tooltip.className = "floating-tooltip";
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    document.addEventListener("pointerdown", hideTooltip, true);
    window.addEventListener("resize", hideTooltip);
    window.addEventListener("blur", hideTooltip);
    prepareTooltips(document);
  }

  function prepareTooltips(root) {
    root.querySelectorAll("[data-tip]").forEach((element) => {
      if (element.classList.contains("tip-target")) {
        bindTooltipTarget(element);
        return;
      }

      const tip = element.getAttribute("data-tip");
      element.removeAttribute("data-tip");
      const target = getTooltipTarget(element);
      if (!target) return;
      target.classList.add("tip-target");
      target.dataset.tip = tip;
      bindTooltipTarget(target);
    });
  }

  function getTooltipTarget(element) {
    const directTipTarget = Array.from(element.children).find((child) => child.classList && child.classList.contains("tip-target"));
    if (directTipTarget) return directTipTarget;

    const labelSpan = Array.from(element.children).find((child) => {
      return child.tagName === "SPAN" && child.classList && !child.classList.contains("axis-dot") && !child.classList.contains("source-swatch");
    });
    if (labelSpan) return labelSpan;

    return wrapTextNodes(element);
  }

  function wrapTextNodes(element) {
    const textNodes = Array.from(element.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!textNodes.length) return null;

    const span = document.createElement("span");
    span.className = "tip-copy";
    textNodes[0].parentNode.insertBefore(span, textNodes[0]);
    textNodes.forEach((node, index) => {
      const text = node.textContent.trim();
      if (text) {
        if (index > 0 && span.textContent) span.appendChild(document.createTextNode(" "));
        span.appendChild(document.createTextNode(text));
      }
      node.parentNode.removeChild(node);
    });
    return span;
  }

  function bindTooltipTarget(target) {
    if (target.dataset.tipBound === "true") return;
    target.dataset.tipBound = "true";
    target.addEventListener("pointerenter", () => showTooltip(target));
    target.addEventListener("pointermove", () => placeTooltip(target));
    target.addEventListener("pointerleave", hideTooltip);
    target.addEventListener("pointerdown", hideTooltip);
  }

  function showTooltip(target) {
    const tooltip = document.getElementById("floating-tooltip");
    if (!tooltip || !target.dataset.tip) return;
    tooltip.textContent = target.dataset.tip;
    tooltip.hidden = false;
    tooltip.classList.add("visible");
    placeTooltip(target);
  }

  function hideTooltip() {
    const tooltip = document.getElementById("floating-tooltip");
    if (!tooltip) return;
    tooltip.classList.remove("visible");
    tooltip.hidden = true;
  }

  function placeTooltip(target) {
    const tooltip = document.getElementById("floating-tooltip");
    if (!tooltip || tooltip.hidden) return;
    const rect = target.getBoundingClientRect();
    const pad = 12;
    tooltip.style.left = "0";
    tooltip.style.top = "0";
    const tipRect = tooltip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    let top = rect.bottom + 8;

    if (left + tipRect.width > window.innerWidth - pad) left = window.innerWidth - tipRect.width - pad;
    if (left < pad) left = pad;
    if (top + tipRect.height > window.innerHeight - pad) top = rect.top - tipRect.height - 8;
    if (top < pad) top = pad;

    tooltip.style.left = Math.round(left) + "px";
    tooltip.style.top = Math.round(top) + "px";
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
    updateControlAvailability();
  }

  function updateControlAvailability() {
    const splineInput = document.querySelector('[data-path="export.surfaceControlLimit"]');
    if (!splineInput) return;
    const smoothMode = project.export && project.export.stepMode === "smoothSurfaceStep";
    splineInput.disabled = !smoothMode;
    const label = splineInput.closest("label");
    if (label) label.classList.toggle("muted", !smoothMode);
  }

  function renderSources() {
    const list = document.getElementById("source-list");
    const editor = document.getElementById("source-editor");
    const entries = sourceEntries();
    ensureSelectedSource(entries);

    list.innerHTML = "";

    if (!entries.length) {
      list.innerHTML = '<p class="source-empty">Add a driver or point source to start shaping the relief.</p>';
      editor.innerHTML = "";
      return;
    }

    entries.forEach((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "source-chip" + (entry.key === selectedSourceKey ? " active" : "");
      button.dataset.sourceKey = entry.key;
      button.style.setProperty("--source-color", colorCss(entry.color));
      button.innerHTML = sourceChipTemplate(entry);
      list.appendChild(button);
    });

    list.querySelectorAll("[data-source-key]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedSourceKey = button.dataset.sourceKey;
        renderSources();
        if (mesh) drawMesh(mesh);
      });
    });

    const selected = entries.find((entry) => entry.key === selectedSourceKey) || entries[0];
    editor.style.setProperty("--source-color", colorCss(selected.color));
    editor.innerHTML = sourceEditorTemplate(selected);
    prepareTooltips(editor);

    editor.querySelectorAll("[data-source-field]").forEach((input) => {
      input.addEventListener("input", () => updateSourceFromInput(input));
      input.addEventListener("change", () => {
        updateSourceFromInput(input);
        renderSources();
      });
    });

    editor.querySelectorAll("[data-remove-source]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.sourceType === "driver") project.drivers.splice(Number(button.dataset.index), 1);
        else project.manualSources.splice(Number(button.dataset.index), 1);
        selectedSourceKey = "";
        renderSources();
        scheduleRebuild();
      });
    });
  }

  function sourceEntries() {
    const driverEntries = project.drivers.map((driver, index) => makeSourceEntry("driver", driver, index));
    const manualEntries = project.manualSources.map((source, index) => makeSourceEntry("manual", source, index));
    return driverEntries.concat(manualEntries);
  }

  function makeSourceEntry(type, item, index) {
    const source = type === "driver" ? item.source : item;
    const center = item.center || source.center;
    const key = type + ":" + index;
    return {
      key,
      type,
      index,
      item,
      source,
      center,
      color: colorForIndex(index + (type === "manual" ? project.drivers.length : 0)),
      label: item.label || item.id || (type === "driver" ? "Driver" : "Point source"),
      kindLabel: type === "driver" ? "Driver source" : "Manual point"
    };
  }

  function ensureSelectedSource(entries) {
    if (!entries.length) {
      selectedSourceKey = "";
      return;
    }
    if (!entries.some((entry) => entry.key === selectedSourceKey)) selectedSourceKey = entries[0].key;
  }

  function colorForKey(key) {
    const entries = sourceEntries();
    const entry = entries.find((candidate) => candidate.key === key);
    return entry ? entry.color : colorForIndex(0);
  }

  function colorForIndex(index) {
    return SOURCE_COLORS[index % SOURCE_COLORS.length];
  }

  function colorCss(color) {
    return "#" + color.toString(16).padStart(6, "0");
  }

  function fmtSmall(value) {
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function sourceChipTemplate(entry) {
    return [
      '<span class="source-swatch"></span>',
      '<span class="source-chip-title">',
      '<strong>' + escapeHtml(entry.label) + '</strong>',
      '<span>' + entry.kindLabel + '</span>',
      '</span>',
      '<span class="source-chip-meta">X ' + fmtSmall(entry.center.x) + ' / Z ' + fmtSmall(entry.center.z) + '</span>'
    ].join("");
  }

  function sourceEditorTemplate(entry) {
    const item = entry.item;
    const source = entry.source;
    const center = entry.center;
    const remove = '<button class="remove" type="button" data-remove-source data-source-type="' + entry.type + '" data-index="' + entry.index + '">Remove</button>';
    return [
      '<div class="source-editor-header"><span class="source-swatch"></span><strong>' + escapeHtml(entry.label) + '</strong>' + remove + '</div>',
      '<label class="check" data-tip="Turns this wave source on or off without deleting it."><input data-source-field="enabled" data-source-type="' + entry.type + '" data-index="' + entry.index + '" type="checkbox" ' + (source.enabled !== false ? "checked" : "") + '> Enabled</label>',
      '<div class="grid-2">',
      textField("Name", "label", entry.label, entry.type, entry.index, "Display name for this source marker and editor tab."),
      field("X", "x", center.x, entry.type, entry.index, lengthStep(), "Horizontal source position on the front face, centered at X=0."),
      field("Z height", "z", center.z, entry.type, entry.index, lengthStep(), "Height of the source above the flat floor plane."),
      entry.type === "driver" ? field("Diameter", "diameter", item.diameter, entry.type, entry.index, lengthStep(), "Visual driver/cutout reference ring diameter.") : "",
      field("Amplitude", "amplitude", source.amplitude, entry.type, entry.index, smallLengthStep(), "How strongly this source pushes or pulls the surface relief."),
      field("Wavelength", "wavelength", source.wavelength, entry.type, entry.index, lengthStep(), "Distance between wave ridges from this source."),
      field("Phase", "phase", source.phase, entry.type, entry.index, 0.1, "Shifts this source wave forward/backward without moving the source."),
      field("Falloff", "falloff", source.falloff, entry.type, entry.index, 0.0001, "How quickly this source fades with surface distance. Lower values carry farther."),
      "</div>"
    ].join("");
  }

  function field(label, fieldName, value, type, index, step, tip) {
    return '<label data-tip="' + escapeHtml(tip) + '">' + label + '<input data-source-field="' + fieldName + '" data-source-type="' + type + '" data-index="' + index + '" type="number" step="' + step + '" value="' + value + '"></label>';
  }

  function textField(label, fieldName, value, type, index, tip) {
    return '<label data-tip="' + escapeHtml(tip) + '">' + label + '<input data-source-field="' + fieldName + '" data-source-type="' + type + '" data-index="' + index + '" type="text" value="' + escapeHtml(value) + '"></label>';
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
    if (!viewInitialized) {
      resetView();
      viewInitialized = true;
    }
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
      const gridSpan = buildAreaSpan(dims);
      grid.scale.setScalar(gridSpan / 1100);
      grid.position.z = 0;
    }
    if (project.preview.showOutline) previewRoot.add(createOutlineBox(dims));
    if (project.preview.showAxes) previewRoot.add(createAxes(dims, buildAreaSpan(dims)));
    if (project.preview.showDimensions) previewRoot.add(createDimensionGuides(dims));
    previewRoot.add(createSurface(nextMesh));
    if (project.preview.showAnalysis) previewRoot.add(createAnalysisPlanes(nextMesh, dims));

    if (project.preview.showPanels) previewRoot.add(createWire(nextMesh));
    if (project.preview.showSeams) previewRoot.add(createSeams(nextMesh.overlays.seams));
    if (project.preview.showDrivers) previewRoot.add(createDriverRings(nextMesh.overlays.drivers));
    if (project.preview.showSources) previewRoot.add(createSources(nextMesh.overlays.sources));

    scene.add(previewRoot);
  }

  function handlePointerDown(event) {
    if (!previewRoot || !raycaster || event.button !== 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(previewRoot.children, true);
    const sourceHit = hits.map((hit) => sourceKeyFromObject(hit.object)).find(Boolean);
    if (sourceHit) {
      selectedSourceKey = sourceHit;
      renderSources();
      drawMesh(mesh);
    }
  }

  function sourceKeyFromObject(object) {
    let current = object;
    while (current) {
      if (current.userData && current.userData.sourceKey) return current.userData.sourceKey;
      current = current.parent;
    }
    return "";
  }

  function exportMesh(format) {
    const resolution = project.export.resolution || project.preview.resolution || "high";
    const outputMesh = Geometry.generatePreviewMesh(project, { resolution });
    const quality = Geometry.RESOLUTION_PRESETS[resolution] || resolution;
    if (format === "obj") Exporters.exportObj(project, outputMesh);
    if (format === "stl") Exporters.exportStl(project, outputMesh);
    if (format === "step") Exporters.exportStep(project, outputMesh);
    const stepKind = format === "step"
      ? (project.export.stepMode === "smoothSurfaceStep" ? " smooth surface" : " faceted fallback")
      : "";
    setExportStatus(
      format.toUpperCase() + stepKind + " export built at " + resolution + " quality (" +
      outputMesh.summary.vertexCount.toLocaleString() + " verts / " +
      outputMesh.summary.triangleCount.toLocaleString() + " tris, grid " + quality + ")."
    );
  }

  function setExportStatus(message) {
    const status = document.getElementById("export-status");
    if (status) status.textContent = message;
  }

  function prepareSolidStepProject() {
    Exporters.exportSolidStepProjectJson(project);
    setExportStatus("Saved Docker exporter JSON.");
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

  function createAxes(dims, buildSpan) {
    const group = new THREE.Group();
    const span = visualScale(dims);
    const scale = helperScale(dims);
    const length = Math.max(span * 0.18, scale * 4);
    const inset = Math.max(scale * 1.05, buildSpan * 0.035);
    const triadOrigin = new THREE.Vector3(-buildSpan / 2 + inset, -buildSpan / 2 + inset, scale * 0.08);

    group.add(createOriginMarker(scale));
    group.add(createBuildCornerMarker(buildSpan, scale));
    group.add(createAxisArrow(triadOrigin, new THREE.Vector3(1, 0, 0), length, 0xf05b4f, "X", scale));
    group.add(createAxisArrow(triadOrigin, new THREE.Vector3(0, 1, 0), length, 0x54c46b, "Y", scale));
    group.add(createAxisArrow(triadOrigin, new THREE.Vector3(0, 0, 1), length, 0x4f8df0, "Z", scale));
    return group;
  }

  function createBuildCornerMarker(buildSpan, scale) {
    const corner = -buildSpan / 2;
    const leg = Math.max(buildSpan * 0.12, scale * 2.8);
    const z = scale * 0.025;
    const points = [
      new THREE.Vector3(corner, corner + leg, z),
      new THREE.Vector3(corner, corner, z),
      new THREE.Vector3(corner + leg, corner, z)
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xe9e2bb, transparent: true, opacity: 0.5 });
    return new THREE.Line(geometry, material);
  }

  function createOriginMarker(scale) {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: 0xf4f1df, transparent: true, opacity: 0.92 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(scale * 0.28, scale * 0.022, 8, 36), material);
    ring.position.z = scale * 0.03;
    group.add(ring);

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xf4f1df, transparent: true, opacity: 0.56 });
    const half = scale * 0.42;
    [
      [new THREE.Vector3(-half, 0, scale * 0.035), new THREE.Vector3(half, 0, scale * 0.035)],
      [new THREE.Vector3(0, -half, scale * 0.035), new THREE.Vector3(0, half, scale * 0.035)]
    ].forEach((points) => {
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMaterial));
    });
    return group;
  }

  function createAxisArrow(origin, direction, length, color, label, scale) {
    const group = new THREE.Group();
    const arrow = new THREE.ArrowHelper(direction, origin, length, color, scale * 0.52, scale * 0.23);
    const labelPosition = origin.clone().add(direction.clone().multiplyScalar(length + scale * 0.32));
    group.add(arrow);
    group.add(createCadLabelSprite(label, "#" + color.toString(16).padStart(6, "0"), labelPosition, 1.45, 22));
    return group;
  }

  function createDimensionGuides(dims) {
    const group = new THREE.Group();
    const span = visualScale(dims);
    const scale = helperScale(dims);
    const offset = span * 0.2;
    const w = dims.width / 2;
    const d = dims.depth / 2;
    const h = dims.height;
    const y = -d - offset;
    const x = w + offset;
    const leftX = -w - offset;

    group.add(createDimensionLine(
      new THREE.Vector3(-w, y, 0),
      new THREE.Vector3(w, y, 0),
      "X " + fmtDimension(dims.width),
      0xf05b4f,
      activeDimension === "x",
      scale
    ));
    group.add(createDimensionLine(
      new THREE.Vector3(x, -d, 0),
      new THREE.Vector3(x, d, 0),
      "Y " + fmtDimension(dims.depth),
      0x54c46b,
      activeDimension === "y",
      scale
    ));
    group.add(createDimensionLine(
      new THREE.Vector3(leftX, d + offset, 0),
      new THREE.Vector3(leftX, d + offset, h),
      "Z " + fmtDimension(dims.height),
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
    group.add(createGuideTick(end, direction, color, opacity, scale));
    group.add(createGuideTick(start, direction, color, opacity, scale));

    const midpoint = start.clone().lerp(end, 0.5);
    const labelOffset = new THREE.Vector3(0, 0, active ? scale * 0.64 : scale * 0.5);
    group.add(createCadLabelSprite(label, "#" + color.toString(16).padStart(6, "0"), midpoint.add(labelOffset), 5.75, active ? 27 : 24));
    return group;
  }

  function createAnalysisPlanes(nextMesh, dims) {
    const group = new THREE.Group();
    const stats = nextMesh.summary.byFace || {};
    const scale = helperScale(dims);
    const faces = ["front", "back", "right", "left", "top"];
    const threshold = Math.max(0.0005, visualScale(dims) * 0.00002);

    faces.forEach((face) => {
      const faceStats = stats[face];
      if (!faceStats) return;
      if (Math.abs(faceStats.maxHeight) > threshold) {
        group.add(createAnalysisPlane(face, faceStats.maxHeight, dims, 0xf3e46d, 0.13, "Max " + signedDimension(faceStats.maxHeight), scale));
      }
      if (Math.abs(faceStats.minHeight) > threshold) {
        group.add(createAnalysisPlane(face, faceStats.minHeight, dims, 0x4f8df0, 0.13, "Min " + signedDimension(faceStats.minHeight), scale));
      }
    });

    return group;
  }

  function createAnalysisPlane(face, offset, dims, color, opacity, label, scale) {
    const frame = faceFrame(face, dims, offset);
    const geometry = rectGeometry(frame.center, frame.u, frame.v);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(geometry, material);
    plane.renderOrder = 4;

    const edgeGeometry = rectLineGeometry(frame.center, frame.u, frame.v);
    const edgeMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.68 });
    const edge = new THREE.Line(edgeGeometry, edgeMaterial);
    edge.renderOrder = 5;

    const group = new THREE.Group();
    group.add(plane);
    group.add(edge);

    if (face === "front" || face === "right" || face === "top") {
      const labelPosition = frame.center.clone().add(frame.normal.clone().multiplyScalar(scale * 0.7));
      group.add(createCadLabelSprite(label, "#" + color.toString(16).padStart(6, "0"), labelPosition, 5.4, 22));
    }

    return group;
  }

  function faceFrame(face, dims, offset) {
    const w = dims.width;
    const d = dims.depth;
    const h = dims.height;
    const halfW = w / 2;
    const halfD = d / 2;

    if (face === "front") {
      return {
        center: new THREE.Vector3(0, halfD + offset, h / 2),
        u: new THREE.Vector3(w, 0, 0),
        v: new THREE.Vector3(0, 0, h),
        normal: new THREE.Vector3(0, 1, 0)
      };
    }
    if (face === "back") {
      return {
        center: new THREE.Vector3(0, -halfD - offset, h / 2),
        u: new THREE.Vector3(w, 0, 0),
        v: new THREE.Vector3(0, 0, h),
        normal: new THREE.Vector3(0, -1, 0)
      };
    }
    if (face === "right") {
      return {
        center: new THREE.Vector3(halfW + offset, 0, h / 2),
        u: new THREE.Vector3(0, d, 0),
        v: new THREE.Vector3(0, 0, h),
        normal: new THREE.Vector3(1, 0, 0)
      };
    }
    if (face === "left") {
      return {
        center: new THREE.Vector3(-halfW - offset, 0, h / 2),
        u: new THREE.Vector3(0, d, 0),
        v: new THREE.Vector3(0, 0, h),
        normal: new THREE.Vector3(-1, 0, 0)
      };
    }
    return {
      center: new THREE.Vector3(0, 0, h + offset),
      u: new THREE.Vector3(w, 0, 0),
      v: new THREE.Vector3(0, d, 0),
      normal: new THREE.Vector3(0, 0, 1)
    };
  }

  function rectGeometry(center, u, v) {
    const halfU = u.clone().multiplyScalar(0.5);
    const halfV = v.clone().multiplyScalar(0.5);
    const corners = [
      center.clone().sub(halfU).sub(halfV),
      center.clone().add(halfU).sub(halfV),
      center.clone().add(halfU).add(halfV),
      center.clone().sub(halfU).add(halfV)
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(corners.flatMap((point) => [point.x, point.y, point.z]), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    return geometry;
  }

  function rectLineGeometry(center, u, v) {
    const halfU = u.clone().multiplyScalar(0.5);
    const halfV = v.clone().multiplyScalar(0.5);
    const corners = [
      center.clone().sub(halfU).sub(halfV),
      center.clone().add(halfU).sub(halfV),
      center.clone().add(halfU).add(halfV),
      center.clone().sub(halfU).add(halfV),
      center.clone().sub(halfU).sub(halfV)
    ];
    return new THREE.BufferGeometry().setFromPoints(corners);
  }

  function createGuideTick(position, direction, color, opacity, scale) {
    const up = Math.abs(direction.z) < 0.75 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const tick = new THREE.Vector3().crossVectors(direction, up).normalize().multiplyScalar(scale * 0.32);
    const geometry = new THREE.BufferGeometry().setFromPoints([
      position.clone().sub(tick),
      position.clone().add(tick)
    ]);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    return new THREE.Line(geometry, material);
  }

  function createCadLabelSprite(text, color, position, aspect, pixelHeight) {
    const canvas = document.createElement("canvas");
    const canvasWidth = 1024;
    const canvasHeight = 256;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxTextWidth = canvasWidth * 0.86;
    let fontSize = 94;
    do {
      ctx.font = "650 " + fontSize + "px Segoe UI Variable, Segoe UI, Arial, sans-serif";
      fontSize -= 4;
    } while (fontSize > 42 && ctx.measureText(text).width > maxTextWidth);
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(8, fontSize * 0.18);
    ctx.strokeStyle = "rgba(8, 10, 9, 0.82)";
    ctx.strokeText(text, canvasWidth / 2, canvasHeight / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, canvasWidth / 2, canvasHeight / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    if (renderer && renderer.capabilities) {
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.renderOrder = 20;
    sprite.userData.cadLabel = {
      aspect,
      pixelHeight,
      minWorldHeight: helperScale(project.cabinet.dimensions) * 0.22,
      maxWorldHeight: helperScale(project.cabinet.dimensions) * 2.8
    };
    updateCadLabelScale(sprite);
    return sprite;
  }

  function createSurface(nextMesh) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(nextMesh.vertices, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(heightColors(nextMesh.heights), 3));
    geometry.setIndex(nextMesh.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.58,
      metalness: 0,
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
    const material = new THREE.LineBasicMaterial({ color: 0xd6e6ef, transparent: true, opacity: 0.08 });
    return new THREE.LineSegments(wireGeometry, material);
  }

  function createSeams(lines) {
    const positions = [];
    lines.forEach((line) => {
      positions.push(line.a.x, line.a.y, line.a.z, line.b.x, line.b.y, line.b.z);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.46 });
    return new THREE.LineSegments(geometry, material);
  }

  function createDriverRings(drivers) {
    const group = new THREE.Group();
    drivers.forEach((driver) => {
      const points = [];
      const radius = driver.diameter / 2;
      const color = colorForKey(driver.key);
      const selected = driver.key === selectedSourceKey;
      for (let i = 0; i <= 80; i += 1) {
        const angle = (i / 80) * Math.PI * 2;
        points.push(new THREE.Vector3(driver.center.x + Math.cos(angle) * radius, driver.center.y, driver.center.z + Math.sin(angle) * radius));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: driver.enabled ? color : 0x7f8790, linewidth: selected ? 2 : 1 });
      const line = new THREE.Line(geometry, material);
      line.userData.sourceKey = driver.key;
      group.add(line);
    });
    return group;
  }

  function createSources(sources) {
    const group = new THREE.Group();
    const dims = project.cabinet.dimensions;
    const scale = visualScale(dims);
    sources.forEach((source) => {
      const selected = source.key === selectedSourceKey;
      const color = colorForKey(source.key);
      const geometry = new THREE.SphereGeometry(scale * (selected ? 0.09 : 0.065), 18, 14);
      const material = new THREE.MeshStandardMaterial({ color, emissive: selected ? color : 0x111111, emissiveIntensity: selected ? 0.25 : 0.08 });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(source.center.x, dims.depth / 2 + scale * 0.1, source.center.z);
      sphere.userData.sourceKey = source.key;
      group.add(sphere);
      if (selected) {
        group.add(createCadLabelSprite(source.label || source.id, colorCss(color), new THREE.Vector3(source.center.x, dims.depth / 2 + scale * 0.13, source.center.z + helperScale(dims) * 0.9), 5.2, 24));
      }
    });
    return group;
  }

  function heightColors(heights) {
    const mode = project.preview.colorMode || "relief";
    const contrast = Math.max(0.4, Number(project.preview.heightContrast) || 1);
    const maxAbs = Math.max(0.0001, Math.max.apply(null, heights.map((height) => Math.abs(height))));
    const colors = [];
    const negative = new THREE.Color(0x276aa3);
    const neutral = new THREE.Color(0xb68648);
    const positive = new THREE.Color(0xf3e46d);
    const peak = new THREE.Color(0xf05b4f);
    const woodLow = new THREE.Color(0x80623e);
    const woodHigh = new THREE.Color(0xf1d486);
    const mono = new THREE.Color(0xcaa25a);

    heights.forEach((height) => {
      let color;
      if (mode === "mono") {
        color = mono;
      } else if (mode === "wood") {
        const t = clamp01(0.5 + (height / maxAbs) * 0.5 * contrast);
        color = woodLow.clone().lerp(woodHigh, t);
      } else {
        const t = clamp01(0.5 + (height / maxAbs) * 0.5 * contrast);
        if (t < 0.5) color = negative.clone().lerp(neutral, t / 0.5);
        else if (t < 0.82) color = neutral.clone().lerp(positive, (t - 0.5) / 0.32);
        else color = positive.clone().lerp(peak, (t - 0.82) / 0.18);
      }
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
      signedDimension(summary.minHeight) + " to " + signedDimension(summary.maxHeight) +
      " / span " + fmtDimension(summary.deviation);

    const analysisStats = document.getElementById("analysis-stats");
    if (analysisStats) {
      analysisStats.innerHTML = [
        '<div><strong>Relief deviation</strong><span>' + fmtDimension(summary.deviation) + '</span></div>',
        '<div><strong>Max outward</strong><span>' + signedDimension(summary.maxHeight) + '</span></div>',
        '<div><strong>Max inward</strong><span>' + signedDimension(summary.minHeight) + '</span></div>',
        '<div><strong>Max absolute</strong><span>' + fmtDimension(summary.maxAbsHeight) + '</span></div>'
      ].join("");
    }
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
    updateCadLabelScales();
    renderer.render(scene, camera);
  }

  function resetView() {
    const dims = project.cabinet.dimensions;
    const span = Math.max(dims.width, dims.height, dims.depth);
    const targetZ = dims.height / 2;
    const distance = span * 1.85;
    camera.position.set(-distance, distance, targetZ + distance);
    controls.target.set(0, 0, targetZ);
    controls.update();
  }

  function saveScreenshot() {
    updateCadLabelScales();
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
    if (input.type === "number" || input.type === "range") return Number(input.value);
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

  function signedDimension(value) {
    const number = Number(value) || 0;
    const sign = number > 0 ? "+" : "";
    return sign + fmtDimension(number);
  }

  function unitLabel() {
    return UNIT_LABELS[project.units] || project.units || "in";
  }

  function visualScale(dims) {
    return Math.max(dims.width, dims.height, dims.depth, 1);
  }

  function buildAreaSpan(dims) {
    return Math.max(dims.width, dims.depth, 1) * 2.05;
  }

  function helperScale(dims) {
    return Math.max(visualScale(dims) * 0.045, project.units === "mm" ? 12 : 0.45);
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

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function updateCadLabelScales() {
    if (!previewRoot) return;
    previewRoot.traverse((object) => {
      if (object.userData && object.userData.cadLabel) updateCadLabelScale(object);
    });
  }

  function updateCadLabelScale(sprite) {
    if (!renderer || !camera || !sprite.userData || !sprite.userData.cadLabel) return;
    const data = sprite.userData.cadLabel;
    const height = renderer.getSize(rendererSize).height || renderer.domElement.clientHeight || 1;
    sprite.getWorldPosition(labelWorldPosition);
    const distance = Math.max(0.001, camera.position.distanceTo(labelWorldPosition));
    const fovRadians = camera.fov * Math.PI / 180;
    const visibleHeight = 2 * distance * Math.tan(fovRadians / 2);
    const worldHeight = clamp(visibleHeight * (data.pixelHeight / height), data.minWorldHeight, data.maxWorldHeight);
    sprite.scale.set(worldHeight * data.aspect, worldHeight, 1);
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
