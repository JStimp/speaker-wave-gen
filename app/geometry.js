(function () {
  "use strict";

  const FACE_NAMES = ["front", "back", "left", "right", "top", "bottom"];
  const DFM_PANEL_ORDER = ["front", "right", "back", "left", "top", "bottom"];
  const DFM_DEFAULT_JOINT_OWNERS = {
    front: ["left", "right"],
    right: [],
    back: ["left", "right"],
    left: [],
    top: ["left", "right", "top", "bottom"],
    bottom: ["left", "right", "top", "bottom"]
  };
  const DFM_DEFAULT_ROUTED_EDGES = {
    front: ["left", "right"],
    right: [],
    back: ["left", "right"],
    left: [],
    top: [],
    bottom: []
  };
  const LOCAL_PANEL_EDGES = ["left", "right", "top", "bottom"];
  const DFM_JOINTS = [
    { id: "front-left", a: ["front", "left"], b: ["left", "left"] },
    { id: "front-right", a: ["front", "right"], b: ["right", "left"] },
    { id: "back-right", a: ["back", "left"], b: ["right", "right"] },
    { id: "back-left", a: ["back", "right"], b: ["left", "right"] },
    { id: "front-top", a: ["front", "top"], b: ["top", "bottom"] },
    { id: "right-top", a: ["right", "top"], b: ["top", "right"] },
    { id: "back-top", a: ["back", "top"], b: ["top", "top"] },
    { id: "left-top", a: ["left", "top"], b: ["top", "left"] },
    { id: "front-bottom", a: ["front", "bottom"], b: ["bottom", "bottom"] },
    { id: "right-bottom", a: ["right", "bottom"], b: ["bottom", "right"] },
    { id: "back-bottom", a: ["back", "bottom"], b: ["bottom", "top"] },
    { id: "left-bottom", a: ["left", "bottom"], b: ["bottom", "left"] }
  ];
  const RESOLUTION_PRESETS = {
    draft: 10,
    low: 20,
    medium: 36,
    high: 64,
    ultra: 96,
    inspection: 128,
    fine: 160,
    production: 192
  };

  const DEFAULT_PROJECT = {
    schemaVersion: 1,
    units: "in",
    project: {
      name: "Wave wrapped hardwood speaker",
      notes: "Static browser prototype."
    },
    cabinet: {
      preset: "rectangular",
      cornerWrap: 0.22,
      dimensions: {
        width: 18,
        height: 32,
        depth: 14,
        wallThickness: 0.875
      }
    },
    drivers: [
      {
        id: "woofer",
        label: "Woofer",
        face: "front",
        center: { x: 0, z: 11.25 },
        diameter: 8.5,
        source: {
          enabled: true,
          amplitude: 0.19,
          wavelength: 4.9,
          phase: 0.12,
          falloff: 0.031
        }
      },
      {
        id: "tweeter",
        label: "Tweeter",
        face: "front",
        center: { x: 0, z: 24 },
        diameter: 3.6,
        source: {
          enabled: true,
          amplitude: 0.105,
          wavelength: 2.85,
          phase: 0.68,
          falloff: 0.043
        }
      }
    ],
    manualSources: [],
    waves: {
      baseAmplitude: 1.08,
      normalization: "softClip",
      reliefDepth: 0.34,
      reliefBias: 0,
      surfaceMode: "fourWallsInsetTop",
      topFlatBorder: 1.5,
      topWaveBlend: 0.75,
      minThickness: 0.5
    },
    preview: {
      resolution: "ultra",
      showSeams: true,
      showDrivers: true,
      showSources: true,
      showPanels: false,
      showOutline: true,
      showAxes: true,
      showDimensions: true,
      showAnalysis: false,
      showGrid: true,
      panelMode: "model",
      visiblePanels: DFM_PANEL_ORDER.slice(),
      zoomOrigin: "center",
      colorMode: "relief",
      heightContrast: 2.35
    },
    panelization: {
      mode: "separated",
      includeBack: false,
      cornerStrategy: "matchedWallReliefEdges",
      dfm: {
        enabled: true,
        edgeOwnership: "flatCapOwners",
        jointStrategy: "flatCapButt",
        maxCurvedEdgesPerPanel: 2,
        edgeRadius: 0.75,
        layoutGap: 4,
        exportPanels: DFM_PANEL_ORDER.slice()
      }
    },
    export: {
      formats: ["json", "obj", "stl", "step"],
      resolution: "high",
      stepMode: "smoothSurfaceStep",
      surfaceControlLimit: 34
    }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createDefaultProject() {
    return clone(DEFAULT_PROJECT);
  }

  function normalizeProject(project) {
    const result = mergeDeep(createDefaultProject(), project || {});
    if (result.waves.surfaceMode === "fourWallFlatCaps") {
      result.waves.surfaceMode = "fourWallsInsetTop";
    }
    result.drivers = Array.isArray(result.drivers) ? result.drivers : [];
    result.manualSources = Array.isArray(result.manualSources) ? result.manualSources : [];
    result.drivers.forEach((driver) => normalizeSourceCenter(driver.center, result.cabinet.dimensions));
    result.manualSources.forEach((source) => normalizeSourceCenter(source.center, result.cabinet.dimensions));
    return result;
  }

  function normalizeSourceCenter(center, dims) {
    if (!center || typeof center !== "object") return;
    if (!Number.isFinite(Number(center.z))) {
      center.z = Number.isFinite(Number(center.y)) ? Number(center.y) + dims.height / 2 : dims.height / 2;
    }
    center.x = Number(center.x) || 0;
    center.z = Number(center.z) || 0;
  }

  function mergeDeep(base, patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return base;
    }

    const result = clone(base);
    Object.keys(patch).forEach((key) => {
      const baseValue = result[key];
      const patchValue = patch[key];
      if (
        baseValue &&
        patchValue &&
        typeof baseValue === "object" &&
        typeof patchValue === "object" &&
        !Array.isArray(baseValue) &&
        !Array.isArray(patchValue)
      ) {
        result[key] = mergeDeep(baseValue, patchValue);
      } else {
        result[key] = patchValue;
      }
    });
    return result;
  }

  function dimensions(project) {
    return project.cabinet.dimensions;
  }

  function pointOnFace(face, u, v, dims, project) {
    const width = dims.width;
    const height = dims.height;
    const depth = dims.depth;
    const xLinear = (u - 0.5) * width;
    const zLinear = v * height;
    const yFromFront = depth / 2 - u * depth;
    const yFromFrontByV = depth / 2 - v * depth;

    if (face === "front") return applyCornerWrap(makePoint(face, u, v, xLinear, depth / 2, zLinear, [0, 1, 0]), dims, project);
    if (face === "back") return applyCornerWrap(makePoint(face, u, v, (0.5 - u) * width, -depth / 2, zLinear, [0, -1, 0]), dims, project);
    if (face === "right") return applyCornerWrap(makePoint(face, u, v, width / 2, yFromFront, zLinear, [1, 0, 0]), dims, project);
    if (face === "left") return applyCornerWrap(makePoint(face, u, v, -width / 2, yFromFront, zLinear, [-1, 0, 0]), dims, project);
    if (face === "top") return applyCornerWrap(makePoint(face, u, v, xLinear, yFromFrontByV, height, [0, 0, 1]), dims, project);
    if (face === "bottom") return applyCornerWrap(makePoint(face, u, v, xLinear, yFromFrontByV, 0, [0, 0, -1]), dims, project);
    throw new Error("Unknown face: " + face);
  }

  function applyCornerWrap(point, dims, project) {
    if (point.face === "top" || point.face === "bottom") return point;

    const wrap = clamp01(Number(project && project.cabinet && project.cabinet.cornerWrap) || 0);
    const maxRadius = Math.max(0, Math.min(dims.width, dims.depth, dims.height) * 0.22);
    const requestedRadius = maxRadius * wrap;
    const capThickness = Math.max(0.001, Number(dims.wallThickness) || 0.75);
    const capBlendDistance = Math.max(requestedRadius, capThickness);
    const capBlend = smoothstep(capThickness, capThickness + capBlendDistance, point.position.z) *
      smoothstep(capThickness, capThickness + capBlendDistance, dims.height - point.position.z);
    const radius = requestedRadius * capBlend;
    if (radius <= 0.000001) return point;

    const p = point.position;
    const hx = dims.width / 2;
    const hy = dims.depth / 2;
    const qx = clamp(p.x, -hx + radius, hx - radius);
    const qy = clamp(p.y, -hy + radius, hy - radius);
    const vx = p.x - qx;
    const vy = p.y - qy;
    const length = Math.sqrt(vx * vx + vy * vy);

    if (length <= 0.000001) return point;

    const effectiveRadius = Math.min(length, radius);
    const nx = vx / length;
    const ny = vy / length;
    point.position = {
      x: qx + nx * effectiveRadius,
      y: qy + ny * effectiveRadius,
      z: p.z
    };
    point.normal = { x: nx, y: ny, z: 0 };
    point.cornerWrapped = true;
    return point;
  }

  function makePoint(face, u, v, x, y, z, normal) {
    return {
      face,
      uv: { u, v },
      position: { x, y, z },
      normal: { x: normal[0], y: normal[1], z: normal[2] }
    };
  }

  function faceSize(face, dims) {
    if (face === "front" || face === "back") return { width: dims.width, height: dims.height };
    if (face === "left" || face === "right") return { width: dims.depth, height: dims.height };
    if (face === "top" || face === "bottom") return { width: dims.width, height: dims.depth };
    throw new Error("Unknown face: " + face);
  }

  function collectSources(project) {
    const driverSources = project.drivers
      .filter((driver) => driver.source && driver.source.enabled)
      .map((driver, index) => ({
        key: "driver:" + index,
        index,
        id: driver.id,
        label: driver.label || driver.id,
        kind: "driver",
        face: driver.face || "front",
        center: { x: Number(driver.center.x) || 0, z: Number(driver.center.z) || 0 },
        amplitude: Number(driver.source.amplitude) || 0,
        wavelength: Math.max(0.001, Number(driver.source.wavelength) || 1),
        phase: Number(driver.source.phase) || 0,
        falloff: Math.max(0, Number(driver.source.falloff) || 0)
      }));

    const manualSources = project.manualSources
      .filter((source) => source.enabled !== false)
      .map((source, index) => ({
        key: "manual:" + index,
        index,
        id: source.id,
        label: source.label || source.id,
        kind: "manual",
        face: source.face || "front",
        center: { x: Number(source.center.x) || 0, z: Number(source.center.z) || 0 },
        amplitude: Number(source.amplitude) || 0,
        wavelength: Math.max(0.001, Number(source.wavelength) || 1),
        phase: Number(source.phase) || 0,
        falloff: Math.max(0, Number(source.falloff) || 0)
      }));

    return driverSources.concat(manualSources);
  }

  function surfaceDistanceToSource(point, source, dims) {
    if ((source.face || "front") !== "front") {
      return distance3(point.position, source.center);
    }
    if (point.cornerWrapped) {
      return distance3(point.position, { x: source.center.x, y: dims.depth / 2, z: source.center.z });
    }
    return frontSourceCuboidDistance(point, source, dims);
  }

  function frontSourceCuboidDistance(point, source, dims) {
    const halfW = dims.width / 2;
    const halfD = dims.depth / 2;
    const sx = source.center.x;
    const sz = source.center.z;
    const p = point.position;
    const depthFromFront = halfD - p.y;

    if (point.face === "front") return distance2(p.x - sx, p.z - sz);
    if (point.face === "right") return distance2(halfW + depthFromFront - sx, p.z - sz);
    if (point.face === "left") return distance2(-halfW - depthFromFront - sx, p.z - sz);
    if (point.face === "top") return distance2(p.x - sx, dims.height + depthFromFront - sz);
    if (point.face === "bottom") return distance2(p.x - sx, -depthFromFront - sz);
    if (point.face === "back") {
      return Math.min(
        distance2(halfW + dims.depth + (halfW - p.x) - sx, p.z - sz),
        distance2(-halfW - dims.depth - (p.x + halfW) - sx, p.z - sz),
        distance2(p.x - sx, dims.height + dims.depth + (dims.height - p.z) - sz),
        distance2(p.x - sx, -dims.depth - p.z - sz)
      );
    }

    return distance3(p, { x: sx, y: halfD, z: sz });
  }

  function computeWaveDisplacement(point, project) {
    const dims = dimensions(project);
    const waves = project.waves;
    let raw = 0;

    if (point.face === "bottom") {
      return { raw: 0, displacement: 0 };
    }

    collectSources(project).forEach((source) => {
      const distance = Math.max(0.0001, surfaceDistanceToSource(point, source, dims));
      const attenuation = Math.exp(-source.falloff * distance);
      raw += source.amplitude * Math.sin((Math.PI * 2 * distance) / source.wavelength + source.phase) * attenuation;
    });

    raw *= Number(waves.baseAmplitude) || 1;
    const requestedLimit = Math.max(0.001, Number(waves.reliefDepth) || 1);
    const wallLimit = Math.max(0.001, Number(dims.wallThickness) - (Number(waves.minThickness) || 0));
    const limit = Math.min(requestedLimit, wallLimit);
    let displacement = raw + (Number(waves.reliefBias) || 0);

    if (waves.normalization === "softClip") {
      displacement = Math.tanh(displacement / limit) * limit;
    } else if (waves.normalization === "clamp") {
      displacement = Math.max(-limit, Math.min(limit, displacement));
    }

    displacement = point.face === "top"
      ? applyTopWaveMask(point, dims, waves, displacement)
      : applyFlatCapTransition(point, dims, displacement, limit);

    return { raw, displacement };
  }

  function applyFlatCapTransition(point, dims, displacement, limit) {
    const capThickness = Math.max(0.001, Number(dims.wallThickness) || 0.75);
    const fadeHeight = Math.min(dims.height * 0.18, Math.max(capThickness * 1.5, limit * 2.5));
    const bottomBlend = smoothstep(capThickness, capThickness + fadeHeight, point.position.z);
    const topBlend = smoothstep(capThickness, capThickness + fadeHeight, dims.height - point.position.z);
    return displacement * bottomBlend * topBlend;
  }

  function applyTopWaveMask(point, dims, waves, displacement) {
    const halfMinimumSpan = Math.max(0, Math.min(dims.width, dims.depth) / 2);
    const border = clamp(Number(waves.topFlatBorder) || 0, 0, halfMinimumSpan);
    const remainingSpan = Math.max(0, halfMinimumSpan - border);
    const blend = clamp(Number(waves.topWaveBlend) || 0, 0, remainingSpan);
    const u = clamp01(point.uv.u);
    const v = clamp01(point.uv.v);
    const edgeDistance = Math.min(
      u * dims.width,
      (1 - u) * dims.width,
      v * dims.depth,
      (1 - v) * dims.depth
    );

    if (remainingSpan <= 0.000001) return 0;
    if (blend <= 0.000001) return edgeDistance > border ? displacement : 0;
    return displacement * smootherstep(border, border + blend, edgeDistance);
  }

  function generatePreviewMesh(project, options) {
    const normalized = normalizeProject(project);
    const dims = dimensions(normalized);
    const resolution = (options && options.resolution) || normalized.preview.resolution || "medium";
    const baseCells = typeof resolution === "number" ? resolution : RESOLUTION_PRESETS[resolution] || RESOLUTION_PRESETS.medium;
    const faces = (options && options.faces) || FACE_NAMES;
    const vertices = [];
    const normals = [];
    const indices = [];
    const heights = [];
    const faceIds = [];
    const faceRanges = {};

    faces.forEach((face) => {
      const startVertex = vertices.length / 3;
      const grid = gridForFace(face, dims, baseCells);
      faceRanges[face] = { startVertex, columns: grid.columns, rows: grid.rows };

      for (let row = 0; row <= grid.rows; row += 1) {
        for (let column = 0; column <= grid.columns; column += 1) {
          const point = pointOnFace(face, column / grid.columns, row / grid.rows, dims, normalized);
          const wave = computeWaveDisplacement(point, normalized);
          const displaced = displacePoint(point, wave.displacement);
          vertices.push(displaced.x, displaced.y, displaced.z);
          normals.push(point.normal.x, point.normal.y, point.normal.z);
          heights.push(wave.displacement);
          faceIds.push(face);
        }
      }

      for (let row = 0; row < grid.rows; row += 1) {
        for (let column = 0; column < grid.columns; column += 1) {
          const a = startVertex + row * (grid.columns + 1) + column;
          const b = a + 1;
          const c = a + grid.columns + 1;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    });

    return {
      vertices,
      normals,
      indices,
      heights,
      faceIds,
      faceRanges,
      overlays: {
        drivers: createDriverOverlays(normalized),
        seams: createSeamOverlay(dims),
        sources: collectSources(normalized)
      },
      summary: summarizeMesh(vertices, indices, heights, faceIds)
    };
  }

  function dfmPanelPlan(project) {
    const normalized = normalizeProject(project);
    const dims = dimensions(normalized);
    const dfm = dfmSettings(normalized);
    const edgeRadius = Math.max(0, Number(dfm.edgeRadius) || 0);
    const thickness = Math.max(0.001, Number(dims.wallThickness) || 0.75);

    const panels = DFM_PANEL_ORDER.map((face) => {
      const jointOwnedEdges = jointOwnedEdgesForPanel(normalized, face);
      const ownedEdges = routedEdgesForPanel(normalized, face);
      const flatEdges = LOCAL_PANEL_EDGES.filter((edge) => ownedEdges.indexOf(edge) === -1);
      const size = faceSize(face, dims);
      const jointMatingEdges = LOCAL_PANEL_EDGES.filter((edge) => jointOwnedEdges.indexOf(edge) === -1);
      const insets = panelJointInsets(jointMatingEdges, thickness);
      const width = Math.max(0.001, size.width - insets.left - insets.right);
      const height = Math.max(0.001, size.height - insets.bottom - insets.top);
      const isWavePanel = face !== "bottom";
      return {
        face,
        label: panelLabel(face),
        width,
        height,
        faceWidth: size.width,
        faceHeight: size.height,
        insets,
        assemblyOffset: {
          x: (insets.left - insets.right) / 2,
          y: (insets.bottom - insets.top) / 2
        },
        isWavePanel,
        surfaceType: isWavePanel ? "wave" : "flat",
        jointOwnedEdges,
        jointMatingEdges,
        ownedEdges,
        flatEdges,
        ownedEdgeLabels: panelEdgeLabels(face, ownedEdges),
        flatEdgeLabels: panelEdgeLabels(face, flatEdges),
        edgeRadius: ownedEdges.length ? edgeRadius : 0,
        curvedEdgeCount: ownedEdges.length,
        valid: ownedEdges.length <= (Number(dfm.maxCurvedEdgesPerPanel) || 2)
      };
    });

    return {
      edgeRadius,
      thickness,
      jointStrategy: "flatCapButt",
      layoutGap: Math.max(0, Number(dfm.layoutGap) || 0),
      maxCurvedEdgesPerPanel: Number(dfm.maxCurvedEdgesPerPanel) || 2,
      panels,
      warnings: panels
        .filter((panel) => !panel.valid)
        .map((panel) => panel.label + " owns " + panel.curvedEdgeCount + " curved edges.")
    };
  }

  function panelJointInsets(flatEdges, thickness) {
    const insets = { left: 0, right: 0, top: 0, bottom: 0 };
    flatEdges.forEach((edge) => {
      insets[edge] = thickness;
    });
    return insets;
  }

  function dfmJointReport(project) {
    const plan = dfmPanelPlan(project);
    const panels = {};
    plan.panels.forEach((panel) => {
      panels[panel.face] = panel;
    });

    const joints = DFM_JOINTS.map((joint) => {
      const panelA = panels[joint.a[0]];
      const panelB = panels[joint.b[0]];
      const edgeA = joint.a[1];
      const edgeB = joint.b[1];
      const ownsA = panelA.jointOwnedEdges.indexOf(edgeA) !== -1;
      const ownsB = panelB.jointOwnedEdges.indexOf(edgeB) !== -1;
      const validOwnership = ownsA !== ownsB;
      const ownerInset = ownsA ? panelA.insets[edgeA] : panelB.insets[edgeB];
      const matingInset = ownsA ? panelB.insets[edgeB] : panelA.insets[edgeA];
      const overlapDepth = validOwnership ? Math.max(0, plan.thickness - matingInset) : plan.thickness;
      const planeError = validOwnership
        ? Math.abs(ownerInset) + Math.abs(matingInset - plan.thickness)
        : plan.thickness;
      return {
        id: joint.id,
        owner: validOwnership ? (ownsA ? panelA.face : panelB.face) : "",
        matingPanel: validOwnership ? (ownsA ? panelB.face : panelA.face) : "",
        validOwnership,
        overlapDepth,
        planeError
      };
    });

    const maxOverlap = Math.max.apply(null, joints.map((joint) => joint.overlapDepth));
    const maxPlaneError = Math.max.apply(null, joints.map((joint) => joint.planeError));
    return {
      valid: joints.every((joint) => joint.validOwnership) && maxOverlap < 1e-9 && maxPlaneError < 1e-9,
      jointCount: joints.length,
      overlapCount: joints.filter((joint) => joint.overlapDepth >= 1e-9).length,
      maxOverlap,
      maxPlaneError,
      joints
    };
  }

  function generateDfmPanelMeshes(project, options) {
    const normalized = normalizeProject(project);
    const dims = dimensions(normalized);
    const dfm = dfmSettings(normalized);
    const resolution = (options && options.resolution) || normalized.export.resolution || "high";
    const baseCells = typeof resolution === "number" ? resolution : RESOLUTION_PRESETS[resolution] || RESOLUTION_PRESETS.high;
    const panelPlan = dfmPanelPlan(normalized);
    const thickness = Math.max(0.001, Number(dims.wallThickness) || 0.75);
    const edgeRadius = Math.max(0, Number(dfm.edgeRadius) || panelPlan.edgeRadius || 0);
    const edgeDrop = Math.min(thickness * 0.82, edgeRadius);
    const layoutGap = Math.max(0, Number(dfm.layoutGap) || 0);
    const maxWidth = Math.max.apply(null, panelPlan.panels.map((panel) => panel.width));
    const maxHeight = Math.max.apply(null, panelPlan.panels.map((panel) => panel.height));
    const cellWidth = maxWidth + layoutGap;
    const cellHeight = maxHeight + layoutGap;

    const panels = panelPlan.panels.map((panel, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const origin = {
        x: (column - 1) * cellWidth,
        y: (0.5 - row) * cellHeight,
        z: 0
      };
      return buildDfmPanelMesh(normalized, panel, baseCells, thickness, edgeRadius, edgeDrop, origin);
    });

    const vertexCount = panels.reduce((sum, panel) => sum + panel.vertices.length / 3, 0);
    const triangleCount = panels.reduce((sum, panel) => sum + panel.indices.length / 3, 0);
    return {
      units: normalized.units,
      resolution,
      thickness,
      edgeRadius,
      layoutGap,
      panels,
      plan: panelPlan,
      jointReport: dfmJointReport(normalized),
      summary: {
        panelCount: panels.length,
        vertexCount,
        triangleCount,
        maxCurvedEdgesPerPanel: panelPlan.maxCurvedEdgesPerPanel
      }
    };
  }

  function buildDfmPanelMesh(project, panel, baseCells, thickness, edgeRadius, edgeDrop, origin) {
    const dims = dimensions(project);
    const columns = Math.max(4, Math.round((panel.width / Math.max(dims.width, dims.height, dims.depth)) * baseCells));
    const rows = Math.max(4, Math.round((panel.height / Math.max(dims.width, dims.height, dims.depth)) * baseCells));
    const vertices = [];
    const indices = [];
    const heights = [];
    const top = [];
    const bottom = [];
    const topGrid = [];
    const bottomGrid = [];

    for (let row = 0; row <= rows; row += 1) {
      const topRow = [];
      const bottomRow = [];
      const topPointRow = [];
      const bottomPointRow = [];
      const v = row / rows;
      for (let column = 0; column <= columns; column += 1) {
        const u = column / columns;
        const local = panelLocalPoint(panel, u, v);
        const faceUv = panelFaceUv(panel, u, v);
        const point = pointOnFace(panel.face, faceUv.u, faceUv.v, dims, project);
        const wave = computeWaveDisplacement(point, project);
        const drop = dfmEdgeDrop(u, v, panel.width, panel.height, panel.ownedEdges, panel.edgeRadius, edgeDrop);
        const topZ = Math.max(0.001, thickness + wave.displacement - drop);
        const topPoint = { x: origin.x + local.x, y: origin.y + local.y, z: topZ };
        const bottomPoint = { x: origin.x + local.x, y: origin.y + local.y, z: 0 };
        topRow.push(addDfmVertex(vertices, topPoint.x, topPoint.y, topPoint.z));
        bottomRow.push(addDfmVertex(vertices, bottomPoint.x, bottomPoint.y, bottomPoint.z));
        topPointRow.push(topPoint);
        bottomPointRow.push(bottomPoint);
        heights.push(wave.displacement - drop);
      }
      top.push(topRow);
      bottom.push(bottomRow);
      topGrid.push(topPointRow);
      bottomGrid.push(bottomPointRow);
    }

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const a = top[row][column];
        const b = top[row][column + 1];
        const c = top[row + 1][column];
        const d = top[row + 1][column + 1];
        indices.push(a, c, b, b, c, d);

        const ba = bottom[row][column];
        const bb = bottom[row][column + 1];
        const bc = bottom[row + 1][column];
        const bd = bottom[row + 1][column + 1];
        indices.push(ba, bb, bc, bb, bd, bc);
      }
    }

    appendDfmWall(indices, top[0], bottom[0], false);
    appendDfmWall(indices, top.map((row) => row[row.length - 1]), bottom.map((row) => row[row.length - 1]), false);
    appendDfmWall(indices, top[top.length - 1].slice().reverse(), bottom[bottom.length - 1].slice().reverse(), false);
    appendDfmWall(indices, top.map((row) => row[0]).reverse(), bottom.map((row) => row[0]).reverse(), false);

    return {
      face: panel.face,
      label: panel.label,
      width: panel.width,
      height: panel.height,
      faceWidth: panel.faceWidth,
      faceHeight: panel.faceHeight,
      insets: Object.assign({}, panel.insets),
      assemblyOffset: Object.assign({}, panel.assemblyOffset),
      jointStrategy: "flatCapButt",
      isWavePanel: panel.isWavePanel,
      surfaceType: panel.surfaceType,
      jointOwnedEdges: panel.jointOwnedEdges.slice(),
      jointMatingEdges: panel.jointMatingEdges.slice(),
      thickness,
      edgeRadius: panel.edgeRadius,
      ownedEdges: panel.ownedEdges.slice(),
      flatEdges: panel.flatEdges.slice(),
      ownedEdgeLabels: panel.ownedEdgeLabels.slice(),
      flatEdgeLabels: panel.flatEdgeLabels.slice(),
      columns,
      rows,
      topGrid,
      bottomGrid,
      vertices,
      indices,
      heights,
      origin
    };
  }

  function appendDfmWall(indices, topEdge, bottomEdge) {
    for (let i = 0; i < topEdge.length - 1; i += 1) {
      const a = topEdge[i];
      const b = topEdge[i + 1];
      const c = bottomEdge[i];
      const d = bottomEdge[i + 1];
      indices.push(a, b, c, b, d, c);
    }
  }

  function addDfmVertex(vertices, x, y, z) {
    const index = vertices.length / 3;
    vertices.push(x, y, z);
    return index;
  }

  function panelLocalPoint(panel, u, v) {
    return {
      x: (u - 0.5) * panel.width,
      y: (v - 0.5) * panel.height
    };
  }

  function panelFaceUv(panel, u, v) {
    return {
      u: (panel.insets.left + u * panel.width) / panel.faceWidth,
      v: (panel.insets.bottom + v * panel.height) / panel.faceHeight
    };
  }

  function dfmEdgeDrop(u, v, width, height, ownedEdges, edgeRadius, edgeDrop) {
    if (edgeRadius <= 0 || edgeDrop <= 0 || !ownedEdges.length) return 0;
    const distances = [];
    if (ownedEdges.indexOf("left") !== -1) distances.push(u * width);
    if (ownedEdges.indexOf("right") !== -1) distances.push((1 - u) * width);
    if (ownedEdges.indexOf("bottom") !== -1) distances.push(v * height);
    if (ownedEdges.indexOf("top") !== -1) distances.push((1 - v) * height);
    if (!distances.length) return 0;
    const distance = Math.min.apply(null, distances);
    if (distance >= edgeRadius) return 0;
    const t = 1 - distance / edgeRadius;
    let drop = edgeDrop * smootherstep(0, 1, t);
    const ownsVerticalEdge = ownedEdges.indexOf("left") !== -1 || ownedEdges.indexOf("right") !== -1;
    if (ownsVerticalEdge) {
      const capDistance = Math.min(v * height, (1 - v) * height);
      const capFadeDistance = Math.min(height * 0.5, Math.max(edgeRadius, 0.0001));
      drop *= smootherstep(0, capFadeDistance, capDistance);
    }
    return drop;
  }

  function jointOwnedEdgesForPanel(project, face) {
    const custom = project.panelization && project.panelization.dfm && project.panelization.dfm.jointEdgeOwners;
    const edges = custom && Array.isArray(custom[face]) ? custom[face] : DFM_DEFAULT_JOINT_OWNERS[face];
    return sanitizePanelEdges(edges);
  }

  function routedEdgesForPanel(project, face) {
    const custom = project.panelization && project.panelization.dfm && project.panelization.dfm.routedEdges;
    const edges = custom && Array.isArray(custom[face]) ? custom[face] : DFM_DEFAULT_ROUTED_EDGES[face];
    return sanitizePanelEdges(edges);
  }

  function sanitizePanelEdges(edges) {
    return (edges || []).filter((edge, index, array) => LOCAL_PANEL_EDGES.indexOf(edge) !== -1 && array.indexOf(edge) === index);
  }

  function dfmSettings(project) {
    return (project.panelization && project.panelization.dfm) || {};
  }

  function panelLabel(face) {
    return face.charAt(0).toUpperCase() + face.slice(1) + " panel";
  }

  function panelEdgeLabels(face, edges) {
    return edges.map((edge) => physicalPanelEdgeLabel(face, edge));
  }

  function physicalPanelEdgeLabel(face, edge) {
    if (face === "back") {
      if (edge === "left") return "right";
      if (edge === "right") return "left";
    }
    if (face === "left" || face === "right") {
      if (edge === "left") return "front";
      if (edge === "right") return "back";
    }
    if (face === "top" || face === "bottom") {
      if (edge === "left") return "left";
      if (edge === "right") return "right";
      if (edge === "bottom") return "front";
      if (edge === "top") return "back";
    }
    return edge;
  }

  function gridForFace(face, dims, baseCells) {
    const size = faceSize(face, dims);
    const longest = Math.max(dims.width, dims.height, dims.depth);
    return {
      columns: Math.max(3, Math.round((size.width / longest) * baseCells)),
      rows: Math.max(3, Math.round((size.height / longest) * baseCells))
    };
  }

  function displacePoint(point, displacement) {
    return {
      x: point.position.x + point.normal.x * displacement,
      y: point.position.y + point.normal.y * displacement,
      z: point.position.z + point.normal.z * displacement
    };
  }

  function createDriverOverlays(project) {
    const y = project.cabinet.dimensions.depth / 2 + project.cabinet.dimensions.depth * 0.006;
    return project.drivers.map((driver, index) => ({
      key: "driver:" + index,
      index,
      id: driver.id,
      label: driver.label,
      center: { x: driver.center.x, y, z: driver.center.z },
      diameter: driver.diameter,
      enabled: driver.source && driver.source.enabled
    }));
  }

  function createSeamOverlay(dims) {
    const w = dims.width / 2;
    const d = dims.depth / 2;
    const h = dims.height;
    const corners = {
      ftl: { x: -w, y: d, z: h },
      ftr: { x: w, y: d, z: h },
      fbr: { x: w, y: d, z: 0 },
      fbl: { x: -w, y: d, z: 0 },
      btl: { x: -w, y: -d, z: h },
      btr: { x: w, y: -d, z: h },
      bbr: { x: w, y: -d, z: 0 },
      bbl: { x: -w, y: -d, z: 0 }
    };
    const pairs = [
      ["ftl", "ftr"], ["ftr", "fbr"], ["fbr", "fbl"], ["fbl", "ftl"],
      ["btl", "btr"], ["btr", "bbr"], ["bbr", "bbl"], ["bbl", "btl"],
      ["ftl", "btl"], ["ftr", "btr"], ["fbr", "bbr"], ["fbl", "bbl"]
    ];
    return pairs.map((pair) => ({ a: corners[pair[0]], b: corners[pair[1]] }));
  }

  function summarizeMesh(vertices, indices, heights, faceIds) {
    const byFace = {};
    FACE_NAMES.forEach((face) => {
      byFace[face] = { minHeight: Infinity, maxHeight: -Infinity, vertexCount: 0 };
    });

    heights.forEach((height, index) => {
      const face = faceIds[index];
      if (!byFace[face]) byFace[face] = { minHeight: Infinity, maxHeight: -Infinity, vertexCount: 0 };
      byFace[face].minHeight = Math.min(byFace[face].minHeight, height);
      byFace[face].maxHeight = Math.max(byFace[face].maxHeight, height);
      byFace[face].vertexCount += 1;
    });

    Object.keys(byFace).forEach((face) => {
      if (!byFace[face].vertexCount) {
        byFace[face].minHeight = 0;
        byFace[face].maxHeight = 0;
      }
      byFace[face].span = byFace[face].maxHeight - byFace[face].minHeight;
    });

    const minHeight = heights.length ? Math.min.apply(null, heights) : 0;
    const maxHeight = heights.length ? Math.max.apply(null, heights) : 0;
    return {
      vertexCount: vertices.length / 3,
      triangleCount: indices.length / 3,
      minHeight,
      maxHeight,
      deviation: maxHeight - minHeight,
      maxAbsHeight: Math.max(Math.abs(minHeight), Math.abs(maxHeight)),
      byFace
    };
  }

  function distance2(dx, dy) {
    return Math.sqrt(dx * dx + dy * dy);
  }

  function distance3(a, b) {
    const dx = (a.x || 0) - (b.x || 0);
    const dy = (a.y || 0) - (b.y || 0);
    const dz = (a.z || 0) - (b.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function smoothstep(edge0, edge1, value) {
    if (edge0 === edge1) return value >= edge1 ? 1 : 0;
    const t = clamp01((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  function smootherstep(edge0, edge1, value) {
    if (edge0 === edge1) return value >= edge1 ? 1 : 0;
    const t = clamp01((value - edge0) / (edge1 - edge0));
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  window.WaveGeometry = {
    FACE_NAMES,
    DFM_PANEL_ORDER,
    DFM_JOINTS,
    RESOLUTION_PRESETS,
    DEFAULT_PROJECT,
    createDefaultProject,
    normalizeProject,
    dfmPanelPlan,
    dfmJointReport,
    pointOnFace,
    collectSources,
    surfaceDistanceToSource,
    computeWaveDisplacement,
    generatePreviewMesh,
    generateDfmPanelMeshes
  };
}());
