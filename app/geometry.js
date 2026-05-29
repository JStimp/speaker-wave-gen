(function () {
  "use strict";

  const FACE_NAMES = ["front", "back", "left", "right", "top", "bottom"];
  const RESOLUTION_PRESETS = {
    draft: 10,
    low: 16,
    medium: 24,
    high: 36,
    ultra: 52
  };

  const DEFAULT_PROJECT = {
    schemaVersion: 1,
    units: "mm",
    project: {
      name: "Default two-driver wave speaker",
      notes: "Static browser prototype."
    },
    cabinet: {
      preset: "rectangular",
      dimensions: {
        width: 520,
        height: 760,
        depth: 340,
        wallThickness: 19
      }
    },
    drivers: [
      {
        id: "woofer",
        label: "Woofer",
        face: "front",
        center: { x: 0, y: -120 },
        diameter: 220,
        source: {
          enabled: true,
          amplitude: 3.5,
          wavelength: 118,
          phase: 0,
          falloff: 0.0018
        }
      },
      {
        id: "tweeter",
        label: "Tweeter",
        face: "front",
        center: { x: 0, y: 180 },
        diameter: 92,
        source: {
          enabled: true,
          amplitude: 1.8,
          wavelength: 72,
          phase: 0.75,
          falloff: 0.0022
        }
      }
    ],
    manualSources: [],
    waves: {
      baseAmplitude: 1,
      normalization: "softClip",
      reliefDepth: 5.5,
      reliefBias: 0,
      minThickness: 12
    },
    preview: {
      resolution: "medium",
      showSeams: true,
      showDrivers: true,
      showSources: true,
      showPanels: true,
      colorMode: "height"
    },
    panelization: {
      mode: "separated",
      includeBack: false,
      cornerStrategy: "matchedReliefEdges"
    },
    export: {
      formats: ["json", "obj", "stl"],
      stepMode: "plannedDockerExporter"
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
    result.drivers = Array.isArray(result.drivers) ? result.drivers : [];
    result.manualSources = Array.isArray(result.manualSources) ? result.manualSources : [];
    return result;
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

  function pointOnFace(face, u, v, dims) {
    const width = dims.width;
    const height = dims.height;
    const depth = dims.depth;
    const xLinear = (u - 0.5) * width;
    const yLinear = (v - 0.5) * height;
    const zFromFront = depth / 2 - u * depth;
    const zFromFrontByV = depth / 2 - v * depth;

    if (face === "front") return makePoint(face, u, v, xLinear, yLinear, depth / 2, [0, 0, 1]);
    if (face === "back") return makePoint(face, u, v, (0.5 - u) * width, yLinear, -depth / 2, [0, 0, -1]);
    if (face === "right") return makePoint(face, u, v, width / 2, yLinear, zFromFront, [1, 0, 0]);
    if (face === "left") return makePoint(face, u, v, -width / 2, yLinear, zFromFront, [-1, 0, 0]);
    if (face === "top") return makePoint(face, u, v, xLinear, height / 2, zFromFrontByV, [0, 1, 0]);
    if (face === "bottom") return makePoint(face, u, v, xLinear, -height / 2, zFromFrontByV, [0, -1, 0]);
    throw new Error("Unknown face: " + face);
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
      .map((driver) => ({
        id: driver.id,
        label: driver.label || driver.id,
        kind: "driver",
        face: driver.face || "front",
        center: { x: Number(driver.center.x) || 0, y: Number(driver.center.y) || 0 },
        amplitude: Number(driver.source.amplitude) || 0,
        wavelength: Math.max(0.001, Number(driver.source.wavelength) || 1),
        phase: Number(driver.source.phase) || 0,
        falloff: Math.max(0, Number(driver.source.falloff) || 0)
      }));

    const manualSources = project.manualSources
      .filter((source) => source.enabled !== false)
      .map((source) => ({
        id: source.id,
        label: source.label || source.id,
        kind: "manual",
        face: source.face || "front",
        center: { x: Number(source.center.x) || 0, y: Number(source.center.y) || 0 },
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
    return frontSourceCuboidDistance(point, source, dims);
  }

  function frontSourceCuboidDistance(point, source, dims) {
    const halfW = dims.width / 2;
    const halfH = dims.height / 2;
    const halfD = dims.depth / 2;
    const sx = source.center.x;
    const sy = source.center.y;
    const p = point.position;
    const depthFromFront = halfD - p.z;

    if (point.face === "front") return distance2(p.x - sx, p.y - sy);
    if (point.face === "right") return distance2(halfW + depthFromFront - sx, p.y - sy);
    if (point.face === "left") return distance2(-halfW - depthFromFront - sx, p.y - sy);
    if (point.face === "top") return distance2(p.x - sx, halfH + depthFromFront - sy);
    if (point.face === "bottom") return distance2(p.x - sx, -halfH - depthFromFront - sy);
    if (point.face === "back") {
      return Math.min(
        distance2(halfW + dims.depth + (halfW - p.x) - sx, p.y - sy),
        distance2(-halfW - dims.depth - (p.x + halfW) - sx, p.y - sy),
        distance2(p.x - sx, halfH + dims.depth + (halfH - p.y) - sy),
        distance2(p.x - sx, -halfH - dims.depth - (p.y + halfH) - sy)
      );
    }

    return distance3(p, { x: sx, y: sy, z: halfD });
  }

  function computeWaveDisplacement(point, project) {
    const dims = dimensions(project);
    const waves = project.waves;
    let raw = 0;

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

    return { raw, displacement };
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
          const point = pointOnFace(face, column / grid.columns, row / grid.rows, dims);
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
      summary: summarizeMesh(vertices, indices, heights)
    };
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
    const z = project.cabinet.dimensions.depth / 2 + 1;
    return project.drivers.map((driver) => ({
      id: driver.id,
      label: driver.label,
      center: { x: driver.center.x, y: driver.center.y, z },
      diameter: driver.diameter,
      enabled: driver.source && driver.source.enabled
    }));
  }

  function createSeamOverlay(dims) {
    const w = dims.width / 2;
    const h = dims.height / 2;
    const d = dims.depth / 2;
    const corners = {
      ftl: { x: -w, y: h, z: d },
      ftr: { x: w, y: h, z: d },
      fbr: { x: w, y: -h, z: d },
      fbl: { x: -w, y: -h, z: d },
      btl: { x: -w, y: h, z: -d },
      btr: { x: w, y: h, z: -d },
      bbr: { x: w, y: -h, z: -d },
      bbl: { x: -w, y: -h, z: -d }
    };
    const pairs = [
      ["ftl", "ftr"], ["ftr", "fbr"], ["fbr", "fbl"], ["fbl", "ftl"],
      ["btl", "btr"], ["btr", "bbr"], ["bbr", "bbl"], ["bbl", "btl"],
      ["ftl", "btl"], ["ftr", "btr"], ["fbr", "bbr"], ["fbl", "bbl"]
    ];
    return pairs.map((pair) => ({ a: corners[pair[0]], b: corners[pair[1]] }));
  }

  function summarizeMesh(vertices, indices, heights) {
    return {
      vertexCount: vertices.length / 3,
      triangleCount: indices.length / 3,
      minHeight: heights.length ? Math.min.apply(null, heights) : 0,
      maxHeight: heights.length ? Math.max.apply(null, heights) : 0
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

  window.WaveGeometry = {
    FACE_NAMES,
    RESOLUTION_PRESETS,
    DEFAULT_PROJECT,
    createDefaultProject,
    normalizeProject,
    pointOnFace,
    collectSources,
    surfaceDistanceToSource,
    computeWaveDisplacement,
    generatePreviewMesh
  };
}());
