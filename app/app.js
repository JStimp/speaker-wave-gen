(function () {
  "use strict";

  const Geometry = window.WaveGeometry;
  const Exporters = window.WaveExporters;
  const UNIT_LABELS = { in: "in", mm: "mm" };
  const SOURCE_COLORS = [0xf05b4f, 0x54c46b, 0x4f8df0, 0xd6b84d, 0xc678dd, 0x4fd0c8, 0xff8a3d];
  const PANEL_COLORS = {
    front: 0x55b7d9,
    right: 0xe2b455,
    back: 0xb88ad8,
    left: 0x67bd79,
    top: 0xe77b67,
    bottom: 0x9aa8b3
  };
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
  let viewerResizeObserver = null;
  let selectedSourceKey = "driver:0";
  let overlaySourceKey = "";
  let selectedPanelFace = "front";
  let overlayPanelFace = "";
  let copiedSourceSettings = null;
  let activeDimension = null;
  let activeSidebarTab = "build";
  let rebuildTimer = 0;
  let viewInitialized = false;
  const labelWorldPosition = new THREE.Vector3();
  const rendererSize = new THREE.Vector2();
  const zoomPlane = new THREE.Plane();
  const zoomPlaneNormal = new THREE.Vector3();
  const zoomAnchor = new THREE.Vector3();
  const zoomOffset = new THREE.Vector3();
  const zoomTargetOffset = new THREE.Vector3();

  window.addEventListener("DOMContentLoaded", init);

  function init() {
    initThree();
    initTooltipSystem();
    initSourceOverlay();
    initPanelOverlay();
    bindControls();
    openSidebar("build");
    syncForm();
    rebuild();
  }

  function initThree() {
    const viewer = document.getElementById("viewer");
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07100d);

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
    renderer.domElement.addEventListener("wheel", handleViewportWheel, { passive: false });

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

    grid = new THREE.GridHelper(1100, 22, 0x315f4c, 0x173126);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0;
    scene.add(grid);
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    window.addEventListener("resize", resize);
    if (window.ResizeObserver) {
      viewerResizeObserver = new ResizeObserver(resize);
      viewerResizeObserver.observe(viewer);
    }
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
    document.getElementById("view-tools-toggle").addEventListener("click", toggleViewTools);
    document.getElementById("view-tools-close").addEventListener("click", closeViewTools);
    document.getElementById("close-sidebar").addEventListener("click", closeSidebar);
    document.querySelectorAll("[data-sidebar-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        if (activeSidebarTab === button.dataset.sidebarTab) closeSidebar();
        else openSidebar(button.dataset.sidebarTab);
      });
    });
    document.querySelectorAll("[data-panel-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        project.preview.panelMode = button.dataset.panelMode;
        if (project.preview.panelMode === "exploded") closeSourceOverlay();
        else closePanelOverlay();
        updatePanelModeButtons();
        drawMesh(mesh);
        resetView();
      });
    });

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
      overlaySourceKey = selectedSourceKey;
      openSidebar("sources");
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
      overlaySourceKey = selectedSourceKey;
      openSidebar("sources");
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
    document.getElementById("export-dfm-step").addEventListener("click", () => exportDfmPanels("step"));
    document.getElementById("export-dfm-obj").addEventListener("click", () => exportDfmPanels("obj"));
    document.getElementById("export-dfm-stl").addEventListener("click", () => exportDfmPanels("stl"));
    document.getElementById("select-all-panels").addEventListener("click", () => setAllPanelExports(true));
    document.getElementById("select-no-panels").addEventListener("click", () => setAllPanelExports(false));
    document.getElementById("show-all-panels").addEventListener("click", () => setAllPanelVisibility(true));
    document.getElementById("hide-all-panels").addEventListener("click", () => setAllPanelVisibility(false));
    document.getElementById("save-png").addEventListener("click", saveScreenshot);
    document.getElementById("load-project").addEventListener("change", loadProjectFile);
    document.addEventListener("pointerdown", (event) => {
      const popup = document.getElementById("view-tools-popup");
      if (!popup || popup.hidden) return;
      if (event.target.closest("#view-tools-popup") || event.target.closest("#view-tools-toggle")) return;
      closeViewTools();
    });
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

  function initSourceOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "source-overlay";
    overlay.className = "source-overlay";
    overlay.hidden = true;
    overlay.innerHTML = '<div class="source-overlay-window"><div id="source-overlay-body" class="source-overlay-body"></div></div>';
    document.body.appendChild(overlay);
  }

  function initPanelOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "panel-overlay";
    overlay.className = "panel-overlay";
    overlay.hidden = true;
    overlay.innerHTML = '<div class="panel-overlay-window"><div id="panel-overlay-body" class="panel-overlay-body"></div></div>';
    document.body.appendChild(overlay);
  }

  function openSidebar(tab) {
    const validTabs = ["file", "build", "sources", "panels", "export"];
    activeSidebarTab = validTabs.indexOf(tab) !== -1 ? tab : "build";
    const workspace = document.querySelector(".workspace");
    const controlsPanel = document.querySelector(".controls");
    if (workspace) workspace.classList.remove("sidebar-closed");
    if (controlsPanel) controlsPanel.hidden = false;

    document.querySelectorAll("[data-sidebar-section]").forEach((section) => {
      section.hidden = section.dataset.sidebarSection !== activeSidebarTab;
    });
    document.querySelectorAll("[data-sidebar-tab]").forEach((button) => {
      const active = button.dataset.sidebarTab === activeSidebarTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const titles = {
      file: "File",
      build: "Build",
      sources: "Driver Source Config",
      panels: "Panels",
      export: "Export"
    };
    const title = document.getElementById("sidebar-title");
    if (title) title.textContent = titles[activeSidebarTab];
    requestAnimationFrame(resize);
  }

  function closeSidebar() {
    activeSidebarTab = "";
    const workspace = document.querySelector(".workspace");
    const controlsPanel = document.querySelector(".controls");
    if (workspace) workspace.classList.add("sidebar-closed");
    if (controlsPanel) controlsPanel.hidden = true;
    document.querySelectorAll("[data-sidebar-tab]").forEach((button) => {
      button.classList.remove("active");
      button.setAttribute("aria-pressed", "false");
    });
    requestAnimationFrame(resize);
  }

  function toggleViewTools() {
    const popup = document.getElementById("view-tools-popup");
    if (!popup) return;
    if (popup.hidden) openViewTools();
    else closeViewTools();
  }

  function openViewTools() {
    const popup = document.getElementById("view-tools-popup");
    const button = document.getElementById("view-tools-toggle");
    if (popup) popup.hidden = false;
    if (button) {
      button.classList.add("active");
      button.setAttribute("aria-expanded", "true");
    }
  }

  function closeViewTools() {
    const popup = document.getElementById("view-tools-popup");
    const button = document.getElementById("view-tools-toggle");
    if (popup) popup.hidden = true;
    if (button) {
      button.classList.remove("active");
      button.setAttribute("aria-expanded", "false");
    }
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
    renderDfmExportSelection();
    renderDfmVisibilityList();
    updatePanelModeButtons();
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
      closeSourceOverlay();
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
        selectSource(button.dataset.sourceKey, true);
      });
    });

    const selected = entries.find((entry) => entry.key === selectedSourceKey) || entries[0];
    editor.style.setProperty("--source-color", colorCss(selected.color));
    editor.innerHTML = sourceEditorTemplate(selected, { overlay: false });
    prepareTooltips(editor);
    bindSourceEditor(editor);
    renderSourceOverlay();
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

  function selectSource(key, showOverlay) {
    selectedSourceKey = key;
    if (showOverlay) overlaySourceKey = key;
    openSidebar("sources");
    renderSources();
    if (mesh) drawMesh(mesh);
  }

  function renderSourceOverlay() {
    const overlay = document.getElementById("source-overlay");
    const body = document.getElementById("source-overlay-body");
    if (!overlay || !body || !overlaySourceKey) return;
    if (currentPanelMode() === "exploded") {
      closeSourceOverlay();
      return;
    }

    const entries = sourceEntries();
    const entry = entries.find((candidate) => candidate.key === overlaySourceKey);
    if (!entry) {
      closeSourceOverlay();
      return;
    }

    overlay.style.setProperty("--source-color", colorCss(entry.color));
    body.innerHTML = sourceEditorTemplate(entry, { overlay: true });
    prepareTooltips(body);
    bindSourceEditor(body);
    overlay.hidden = false;
  }

  function closeSourceOverlay() {
    overlaySourceKey = "";
    const overlay = document.getElementById("source-overlay");
    if (overlay) overlay.hidden = true;
  }

  function renderPanelOverlay() {
    const overlay = document.getElementById("panel-overlay");
    const body = document.getElementById("panel-overlay-body");
    if (!overlay || !body || !overlayPanelFace || currentPanelMode() !== "exploded") {
      closePanelOverlay();
      return;
    }

    const plan = Geometry.dfmPanelPlan(project);
    const panel = plan.panels.find((candidate) => candidate.face === overlayPanelFace);
    if (!panel) {
      closePanelOverlay();
      return;
    }

    const selected = selectedPanelFaces().indexOf(panel.face) !== -1;
    const color = PANEL_COLORS[panel.face] || 0xd6b84d;
    overlay.style.setProperty("--panel-color", colorCss(color));
    body.innerHTML = [
      '<div class="panel-editor-header">',
      '<span class="panel-swatch"></span>',
      '<div><strong>' + escapeHtml(panel.label) + '</strong><span>DFM workholding panel</span></div>',
      '<button class="panel-close" type="button" data-close-panel-overlay aria-label="Close panel properties">Close</button>',
      "</div>",
      '<label class="check panel-export-check"><input type="checkbox" data-overlay-panel-export="' + panel.face + '" ' + (selected ? "checked" : "") + '> Include in DFM export</label>',
      '<div class="panel-property-grid">',
      panelProperty("Blank width", fmtDimension(panel.width)),
      panelProperty("Blank height", fmtDimension(panel.height)),
      panelProperty("Thickness", fmtDimension(project.cabinet.dimensions.wallThickness)),
      panelProperty("Route radius", fmtDimension(panel.edgeRadius)),
      "</div>",
      '<div class="panel-edge-groups">',
      '<div><strong>Routed / radiused</strong><span>' + escapeHtml(panel.ownedEdgeLabels.join(", ")) + '</span></div>',
      '<div><strong>Square mating edges</strong><span>' + escapeHtml(panel.flatEdgeLabels.join(", ")) + '</span></div>',
      "</div>"
    ].join("");
    overlay.hidden = false;

    body.querySelector("[data-close-panel-overlay]").addEventListener("click", closePanelOverlay);
    body.querySelector("[data-overlay-panel-export]").addEventListener("change", (event) => {
      setPanelExport(panel.face, event.target.checked);
      renderDfmExportSelection();
      renderPanelOverlay();
    });
  }

  function panelProperty(label, value) {
    return '<div><strong>' + escapeHtml(label) + '</strong><span>' + escapeHtml(value) + '</span></div>';
  }

  function closePanelOverlay() {
    overlayPanelFace = "";
    const overlay = document.getElementById("panel-overlay");
    if (overlay) overlay.hidden = true;
  }

  function sourceEditorTemplate(entry, options) {
    const isOverlay = Boolean(options && options.overlay);
    const item = entry.item;
    const source = entry.source;
    const center = entry.center;
    const close = isOverlay ? '<button class="source-close" type="button" data-close-source-overlay aria-label="Close source editor">Close</button>' : "";
    const pasteDisabled = copiedSourceSettings ? "" : " disabled";
    return [
      '<div class="source-editor-header"><span class="source-swatch"></span><strong>' + escapeHtml(entry.label) + '</strong>' + close + '</div>',
      '<div class="source-actions">',
      '<button type="button" data-source-action="duplicate" data-source-type="' + entry.type + '" data-index="' + entry.index + '" data-tip="Create a new source with the same placement and wave settings, offset slightly so it is easy to grab.">Duplicate</button>',
      '<button type="button" data-source-action="copy" data-source-type="' + entry.type + '" data-index="' + entry.index + '" data-tip="Copy this source wave settings for pasting onto another source. Position and name are not pasted.">Copy Settings</button>',
      '<button type="button" data-source-action="paste" data-source-type="' + entry.type + '" data-index="' + entry.index + '"' + pasteDisabled + ' data-tip="Paste copied wave settings onto this source without moving it.">Paste Settings</button>',
      '<button class="remove" type="button" data-source-action="remove" data-source-type="' + entry.type + '" data-index="' + entry.index + '" data-tip="Remove this source from the project.">Remove</button>',
      "</div>",
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

  function bindSourceEditor(root) {
    root.querySelectorAll("[data-source-field]").forEach((input) => {
      input.addEventListener("input", () => {
        updateSourceFromInput(input);
        syncMirroredSourceInputs(input);
      });
      input.addEventListener("change", () => {
        updateSourceFromInput(input);
        renderSources();
      });
    });

    root.querySelectorAll("[data-source-action]").forEach((button) => {
      button.addEventListener("click", () => handleSourceAction(button));
    });

    root.querySelectorAll("[data-close-source-overlay]").forEach((button) => {
      button.addEventListener("click", closeSourceOverlay);
    });
  }

  function handleSourceAction(button) {
    const type = button.dataset.sourceType;
    const index = Number(button.dataset.index);
    const action = button.dataset.sourceAction;
    if (action === "duplicate") duplicateSource(type, index);
    if (action === "copy") copySourceSettings(type, index);
    if (action === "paste") pasteSourceSettings(type, index);
    if (action === "remove") removeSource(type, index);
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

  function syncMirroredSourceInputs(changedInput) {
    const type = changedInput.dataset.sourceType;
    const index = changedInput.dataset.index;
    const fieldName = changedInput.dataset.sourceField;
    const value = sourceFieldValue(type, Number(index), fieldName);
    document.querySelectorAll("[data-source-field]").forEach((input) => {
      if (input === changedInput) return;
      if (input.dataset.sourceType !== type || input.dataset.index !== index || input.dataset.sourceField !== fieldName) return;
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = value;
    });
  }

  function sourceFieldValue(type, index, fieldName) {
    const item = type === "driver" ? project.drivers[index] : project.manualSources[index];
    if (!item) return "";
    const source = type === "driver" ? item.source : item;
    if (fieldName === "label") return item.label || "";
    if (fieldName === "enabled") return source.enabled !== false;
    if (fieldName === "x" || fieldName === "z") return item.center[fieldName];
    if (fieldName === "diameter") return item.diameter;
    return source[fieldName];
  }

  function duplicateSource(type, index) {
    const offset = lengthValue(0.75);
    if (type === "driver") {
      const original = project.drivers[index];
      if (!original) return;
      const duplicate = cloneValue(original);
      duplicate.id = uniqueSourceId("driver", project.drivers);
      duplicate.label = copyLabel(original.label || original.id || "Driver");
      duplicate.center = offsetCenter(duplicate.center, offset);
      project.drivers.splice(index + 1, 0, duplicate);
      selectedSourceKey = "driver:" + (index + 1);
    } else {
      const original = project.manualSources[index];
      if (!original) return;
      const duplicate = cloneValue(original);
      duplicate.id = uniqueSourceId("source", project.manualSources);
      duplicate.label = copyLabel(original.label || original.id || "Point source");
      duplicate.center = offsetCenter(duplicate.center, offset);
      project.manualSources.splice(index + 1, 0, duplicate);
      selectedSourceKey = "manual:" + (index + 1);
    }
    overlaySourceKey = selectedSourceKey;
    renderSources();
    scheduleRebuild();
    setExportStatus("Duplicated source.");
  }

  function copySourceSettings(type, index) {
    const entries = sourceEntries();
    const entry = entries.find((candidate) => candidate.type === type && candidate.index === index);
    if (!entry) return;
    copiedSourceSettings = {
      type,
      source: cloneValue(entry.source),
      diameter: entry.type === "driver" ? entry.item.diameter : null
    };
    renderSources();
    setExportStatus("Copied " + entry.label + " wave settings.");
  }

  function pasteSourceSettings(type, index) {
    if (!copiedSourceSettings) return;
    const item = type === "driver" ? project.drivers[index] : project.manualSources[index];
    if (!item) return;
    const source = type === "driver" ? item.source : item;
    ["enabled", "amplitude", "wavelength", "phase", "falloff"].forEach((fieldName) => {
      if (Object.prototype.hasOwnProperty.call(copiedSourceSettings.source, fieldName)) {
        source[fieldName] = copiedSourceSettings.source[fieldName];
      }
    });
    if (type === "driver" && Number.isFinite(Number(copiedSourceSettings.diameter))) {
      item.diameter = Number(copiedSourceSettings.diameter);
    }
    selectedSourceKey = type + ":" + index;
    overlaySourceKey = overlaySourceKey || selectedSourceKey;
    renderSources();
    scheduleRebuild();
    setExportStatus("Pasted wave settings.");
  }

  function removeSource(type, index) {
    if (type === "driver") project.drivers.splice(index, 1);
    else project.manualSources.splice(index, 1);
    selectedSourceKey = "";
    overlaySourceKey = "";
    renderSources();
    scheduleRebuild();
  }

  function offsetCenter(center, offset) {
    const dims = project.cabinet.dimensions;
    const next = cloneValue(center || { x: 0, z: dims.height / 2 });
    const x = Number.isFinite(Number(next.x)) ? Number(next.x) : 0;
    const z = Number.isFinite(Number(next.z)) ? Number(next.z) : dims.height / 2;
    next.x = Math.max(-dims.width / 2, Math.min(dims.width / 2, x + offset));
    next.z = Math.max(0, Math.min(dims.height, z + offset));
    return next;
  }

  function copyLabel(label) {
    return String(label || "Source").replace(/\s+copy\s*\d*$/i, "") + " copy";
  }

  function uniqueSourceId(prefix, collection) {
    const ids = new Set(collection.map((item) => item.id));
    let index = collection.length + 1;
    let id = prefix + "-" + index;
    while (ids.has(id)) {
      index += 1;
      id = prefix + "-" + index;
    }
    return id;
  }

  function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
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
    const panelMode = currentPanelMode();

    if (grid) {
      grid.visible = project.preview.showGrid !== false;
      const gridSpan = buildAreaSpan(dims);
      grid.scale.setScalar(gridSpan / 1100);
      grid.position.z = 0;
    }
    if (project.preview.showOutline) previewRoot.add(createOutlineBox(dims));
    if (project.preview.showAxes) previewRoot.add(createAxes(dims, buildAreaSpan(dims)));
    if (project.preview.showDimensions) previewRoot.add(createDimensionGuides(dims));
    if (panelMode !== "exploded") {
      previewRoot.add(createSurface(nextMesh, { opacity: panelMode === "ghost" ? 0.62 : 1 }));
    }
    if (panelMode === "ghost" || panelMode === "exploded") {
      const panelSet = Geometry.generateDfmPanelMeshes(project, { resolution: project.preview.resolution });
      previewRoot.add(createDfmPanelView(panelSet, panelMode));
    }
    if (project.preview.showAnalysis && panelMode !== "exploded") previewRoot.add(createAnalysisPlanes(nextMesh, dims));

    if (project.preview.showPanels && panelMode !== "exploded") previewRoot.add(createWire(nextMesh));
    if (project.preview.showSeams && panelMode === "model") previewRoot.add(createSeams(nextMesh.overlays.seams));
    if (project.preview.showDrivers && panelMode !== "exploded") previewRoot.add(createDriverRings(nextMesh.overlays.drivers));
    if (project.preview.showSources && panelMode !== "exploded") previewRoot.add(createSources(nextMesh.overlays.sources));

    scene.add(previewRoot);
    renderPanelOverlay();
  }

  function handlePointerDown(event) {
    if (!previewRoot || !raycaster || event.button !== 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(previewRoot.children, true);
    const panelHit = hits.map((hit) => panelFaceFromObject(hit.object)).find(Boolean);
    if (panelHit && currentPanelMode() === "exploded") {
      selectedPanelFace = panelHit;
      overlayPanelFace = panelHit;
      openSidebar("panels");
      drawMesh(mesh);
      return;
    }
    const sourceHit = hits.map((hit) => sourceKeyFromObject(hit.object)).find(Boolean);
    if (sourceHit) {
      selectSource(sourceHit, true);
    }
  }

  function handleViewportWheel(event) {
    if (!camera || !controls || !controls.enabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const rect = renderer.domElement.getBoundingClientRect();
    zoomAnchor.copy(controls.target);
    if (project.preview.zoomOrigin === "cursor") {
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      camera.getWorldDirection(zoomPlaneNormal);
      zoomPlane.setFromNormalAndCoplanarPoint(zoomPlaneNormal, controls.target);
      if (!raycaster.ray.intersectPlane(zoomPlane, zoomAnchor)) zoomAnchor.copy(controls.target);
    }

    let delta = event.deltaY;
    if (event.deltaMode === 1) delta *= 16;
    if (event.deltaMode === 2) delta *= rect.height;
    const factor = Math.exp(clamp(delta, -240, 240) * 0.0016);
    const currentDistance = Math.max(0.0001, camera.position.distanceTo(controls.target));
    const dims = project.cabinet.dimensions;
    const span = Math.max(dims.width, dims.height, dims.depth);
    const nextDistance = clamp(currentDistance * factor, Math.max(span * 0.06, 0.1), span * 14);
    const appliedFactor = nextDistance / currentDistance;

    zoomOffset.copy(camera.position).sub(zoomAnchor).multiplyScalar(appliedFactor);
    zoomTargetOffset.copy(controls.target).sub(zoomAnchor).multiplyScalar(appliedFactor);
    camera.position.copy(zoomAnchor).add(zoomOffset);
    controls.target.copy(zoomAnchor).add(zoomTargetOffset);
    controls.update();
  }

  function sourceKeyFromObject(object) {
    let current = object;
    while (current) {
      if (current.userData && current.userData.sourceKey) return current.userData.sourceKey;
      current = current.parent;
    }
    return "";
  }

  function panelFaceFromObject(object) {
    let current = object;
    while (current) {
      if (current.userData && current.userData.panelFace) return current.userData.panelFace;
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

  async function exportDfmPanels(format) {
    const resolution = project.export.resolution || project.preview.resolution || "high";
    const panelSet = Geometry.generateDfmPanelMeshes(project, { resolution });
    const faces = selectedPanelFaces();
    if (!faces.length) {
      setExportStatus("Select at least one DFM panel to export.");
      return;
    }
    setExportStatus("Preparing " + faces.length + " separate " + format.toUpperCase() + " panel file" + (faces.length === 1 ? "" : "s") + "...");
    try {
      const result = await Exporters.exportDfmPanelsSeparate(project, panelSet, faces, format);
      const destination = result.method === "directory" ? " to the selected folder" : " as browser downloads";
      setExportStatus("Saved " + result.count + " labeled DFM " + format.toUpperCase() + " panel file" + (result.count === 1 ? "" : "s") + destination + ".");
    } catch (error) {
      if (error && error.name === "AbortError") {
        setExportStatus("DFM export canceled.");
        return;
      }
      console.error(error);
      setExportStatus("DFM export failed: " + error.message);
    }
  }

  function setExportStatus(message) {
    const status = document.getElementById("export-status");
    if (status) status.textContent = message;
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

  function createSurface(nextMesh, options) {
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
      transparent: Boolean(options && options.opacity < 1),
      opacity: options && options.opacity != null ? options.opacity : 1,
      depthWrite: !(options && options.opacity < 1),
      side: THREE.DoubleSide
    });

    return new THREE.Mesh(geometry, material);
  }

  function createDfmPanelView(panelSet, mode) {
    const group = new THREE.Group();
    const dims = project.cabinet.dimensions;
    const span = Math.max(dims.width, dims.height, dims.depth);
    const separation = mode === "exploded" ? span * 0.42 : span * 0.0025;
    const visibleFaces = visiblePanelFaces();

    panelSet.panels.forEach((panel) => {
      if (visibleFaces.indexOf(panel.face) === -1) return;
      const positions = [];
      for (let i = 0; i < panel.vertices.length; i += 3) {
        const local = {
          x: panel.vertices[i] - panel.origin.x,
          y: panel.vertices[i + 1] - panel.origin.y,
          z: panel.vertices[i + 2] - panel.origin.z
        };
        const point = assembledPanelPoint(panel.face, local, dims, panel.thickness, separation);
        positions.push(point.x, point.y, point.z);
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(panel.indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();

      const selected = panel.face === selectedPanelFace;
      const color = PANEL_COLORS[panel.face] || 0xd6b84d;
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.48,
        metalness: 0,
        transparent: true,
        opacity: mode === "ghost" ? 0.26 : (selected ? 0.96 : 0.82),
        depthWrite: mode !== "ghost",
        side: THREE.DoubleSide
      });
      if (selected && mode === "exploded") {
        material.emissive = new THREE.Color(color);
        material.emissiveIntensity = 0.12;
      }

      const panelMesh = new THREE.Mesh(geometry, material);
      panelMesh.userData.panelFace = panel.face;
      panelMesh.renderOrder = mode === "ghost" ? 6 : 2;
      group.add(panelMesh);

      const edgeGeometry = new THREE.EdgesGeometry(geometry, 22);
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: selected && mode === "exploded" ? 0xffffff : color,
        transparent: true,
        opacity: mode === "ghost" ? 0.78 : 0.92
      });
      const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      edges.userData.panelFace = panel.face;
      edges.renderOrder = mode === "ghost" ? 7 : 3;
      group.add(edges);

      if (mode === "exploded") {
        const center = panelMesh.geometry.boundingSphere.center.clone();
        group.add(createCadLabelSprite(panel.label, colorCss(color), center, 4.8, selected ? 25 : 22));
      }
    });

    return group;
  }

  function assembledPanelPoint(face, local, dims, thickness, separation) {
    const zCenter = dims.height / 2;
    if (face === "front") {
      return { x: local.x, y: dims.depth / 2 - thickness + local.z + separation, z: local.y + zCenter };
    }
    if (face === "back") {
      return { x: -local.x, y: -dims.depth / 2 + thickness - local.z - separation, z: local.y + zCenter };
    }
    if (face === "right") {
      return { x: dims.width / 2 - thickness + local.z + separation, y: -local.x, z: local.y + zCenter };
    }
    if (face === "left") {
      return { x: -dims.width / 2 + thickness - local.z - separation, y: -local.x, z: local.y + zCenter };
    }
    if (face === "top") {
      return { x: local.x, y: -local.y, z: dims.height - thickness + local.z + separation };
    }
    return { x: local.x, y: -local.y, z: thickness - local.z - separation };
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

    renderDfmExportSelection();
    if (overlayPanelFace) renderPanelOverlay();
  }

  function renderDfmExportSelection() {
    const selection = document.getElementById("dfm-export-selection");
    if (!selection) return;
    const plan = Geometry.dfmPanelPlan(project);
    const selected = selectedPanelFaces();
    selection.innerHTML = plan.panels.map((panel) => {
      const color = PANEL_COLORS[panel.face] || 0xd6b84d;
      return [
        '<label class="panel-export-option" style="--panel-color:' + colorCss(color) + '">',
        '<input type="checkbox" data-panel-export="' + panel.face + '" ' + (selected.indexOf(panel.face) !== -1 ? "checked" : "") + '>',
        '<span class="panel-export-swatch"></span>',
        '<span>' + escapeHtml(panel.label.replace(" panel", "")) + "</span>",
        "</label>"
      ].join("");
    }).join("");
    selection.querySelectorAll("[data-panel-export]").forEach((input) => {
      input.addEventListener("change", () => {
        setPanelExport(input.dataset.panelExport, input.checked);
        if (overlayPanelFace === input.dataset.panelExport) renderPanelOverlay();
      });
    });
  }

  function selectedPanelFaces() {
    const dfm = project.panelization && project.panelization.dfm;
    const configured = dfm && Array.isArray(dfm.exportPanels) ? dfm.exportPanels : Geometry.DFM_PANEL_ORDER;
    return Geometry.DFM_PANEL_ORDER.filter((face) => configured.indexOf(face) !== -1);
  }

  function setPanelExport(face, enabled) {
    const current = selectedPanelFaces();
    const next = enabled
      ? current.concat(face).filter((value, index, array) => array.indexOf(value) === index)
      : current.filter((value) => value !== face);
    project.panelization.dfm.exportPanels = Geometry.DFM_PANEL_ORDER.filter((value) => next.indexOf(value) !== -1);
  }

  function setAllPanelExports(enabled) {
    project.panelization.dfm.exportPanels = enabled ? Geometry.DFM_PANEL_ORDER.slice() : [];
    renderDfmExportSelection();
    if (overlayPanelFace) renderPanelOverlay();
  }

  function renderDfmVisibilityList() {
    const list = document.getElementById("dfm-visibility-list");
    if (!list) return;
    const plan = Geometry.dfmPanelPlan(project);
    const visible = visiblePanelFaces();
    list.innerHTML = plan.panels.map((panel) => {
      const color = PANEL_COLORS[panel.face] || 0xd6b84d;
      return [
        '<label class="panel-visibility-option" style="--panel-color:' + colorCss(color) + '">',
        '<input type="checkbox" data-panel-visible="' + panel.face + '" ' + (visible.indexOf(panel.face) !== -1 ? "checked" : "") + '>',
        '<span class="panel-export-swatch"></span>',
        '<span>' + escapeHtml(panel.label) + "</span>",
        "</label>"
      ].join("");
    }).join("");
    list.querySelectorAll("[data-panel-visible]").forEach((input) => {
      input.addEventListener("change", () => setPanelVisibility(input.dataset.panelVisible, input.checked));
    });
  }

  function visiblePanelFaces() {
    const configured = project.preview && Array.isArray(project.preview.visiblePanels)
      ? project.preview.visiblePanels
      : Geometry.DFM_PANEL_ORDER;
    return Geometry.DFM_PANEL_ORDER.filter((face) => configured.indexOf(face) !== -1);
  }

  function setPanelVisibility(face, visible) {
    const current = visiblePanelFaces();
    const next = visible
      ? current.concat(face).filter((value, index, array) => array.indexOf(value) === index)
      : current.filter((value) => value !== face);
    project.preview.visiblePanels = Geometry.DFM_PANEL_ORDER.filter((value) => next.indexOf(value) !== -1);
    if (!visible && overlayPanelFace === face) closePanelOverlay();
    renderDfmVisibilityList();
    if (mesh) drawMesh(mesh);
  }

  function setAllPanelVisibility(visible) {
    project.preview.visiblePanels = visible ? Geometry.DFM_PANEL_ORDER.slice() : [];
    if (!visible) closePanelOverlay();
    renderDfmVisibilityList();
    if (mesh) drawMesh(mesh);
  }

  function currentPanelMode() {
    const mode = project.preview && project.preview.panelMode;
    return mode === "ghost" || mode === "exploded" ? mode : "model";
  }

  function updatePanelModeButtons() {
    const mode = currentPanelMode();
    document.querySelectorAll("[data-panel-mode]").forEach((button) => {
      const active = button.dataset.panelMode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
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
    const distance = span * (currentPanelMode() === "exploded" ? 2.35 : 1.85);
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

    if (target.panelization) {
      multiplyFields(target.panelization, ["kerf", "edgeAllowance"], factor);
      if (target.panelization.dfm) multiplyFields(target.panelization.dfm, ["edgeRadius", "layoutGap"], factor);
    }
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
