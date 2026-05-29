(function () {
  "use strict";

  const FACE_NAMES = ["front", "back", "left", "right", "top", "bottom"];
  const RESOLUTION_PRESETS = {
    draft: 10,
    low: 16,
    medium: 24,
    high: 36,
    ultra: 56,
    fine: 80,
    production: 112
  };

  const DEFAULT_PROJECT = {
    schemaVersion: 1,
    units: "in",
    project: {
      name: "Default two-driver wave speaker",
      notes: "Static browser prototype."
    },
    cabinet: {
      preset: "rectangular",
      cornerWrap: 0.18,
      dimensions: {
        width: 20.5,
        height: 30,
        depth: 13.5,
        wallThickness: 0.75
      }
    },
    drivers: [
      {
        id: "woofer",
        label: "Woofer",
        face: "front",
        center: { x: 0, z: 10.25 },
        diameter: 8.5,
        source: {
          enabled: true,
          amplitude: 0.14,
          wavelength: 4.65,
          phase: 0,
          falloff: 0.046
        }
      },
      {
        id: "tweeter",
        label: "Tweeter",
        face: "front",
        center: { x: 0, z: 22 },
        diameter: 3.6,
        source: {
          enabled: true,
          amplitude: 0.07,
          wavelength: 2.85,
          phase: 0.75,
          falloff: 0.056
        }
      }
    ],
    manualSources: [],
    waves: {
      baseAmplitude: 1,
      normalization: "softClip",
      reliefDepth: 0.22,
      reliefBias: 0,
      flatBottom: true,
      minThickness: 0.47
    },
    preview: {
      resolution: "high",
      showSeams: true,
      showDrivers: true,
      showSources: true,
      showPanels: true,
      showOutline: true,
      showAxes: true,
      showDimensions: true,
      showGrid: true,
      colorMode: "relief",
      heightContrast: 1.75
    },
    panelization: {
      mode: "separated",
      includeBack: false,
      cornerStrategy: "matchedReliefEdges"
    },
    export: {
      formats: ["json", "obj", "stl", "step"],
      resolution: "production",
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
    const wrap = clamp01(Number(project && project.cabinet && project.cabinet.cornerWrap) || 0);
    const maxRadius = Math.max(0, Math.min(dims.width, dims.depth, dims.height) * 0.22);
    const radius = maxRadius * wrap;
    if (radius <= 0.000001) return point;

    const flatBottom = Boolean(project && project.waves && project.waves.flatBottom);
    const p = point.position;
    const hx = dims.width / 2;
    const hy = dims.depth / 2;
    const h = dims.height;
    const bottomFade = flatBottom ? smoothstep(0, Math.max(radius * 1.5, 0.0001), p.z) : 1;
    const xyRadius = radius * bottomFade;
    const topRadius = radius;
    const bottomRadius = flatBottom ? 0 : radius;

    const qx = xyRadius > 0 ? clamp(p.x, -hx + xyRadius, hx - xyRadius) : p.x;
    const qy = xyRadius > 0 ? clamp(p.y, -hy + xyRadius, hy - xyRadius) : p.y;
    const qz = clamp(p.z, bottomRadius, h - topRadius);
    const vx = p.x - qx;
    const vy = p.y - qy;
    const vz = p.z - qz;
    const length = Math.sqrt(vx * vx + vy * vy + vz * vz);

    if (length <= 0.000001) return point;

    const effectiveRadius = Math.min(length, radius);
    const nx = vx / length;
    const ny = vy / length;
    const nz = vz / length;
    point.position = {
      x: qx + nx * effectiveRadius,
      y: qy + ny * effectiveRadius,
      z: qz + nz * effectiveRadius
    };
    point.normal = { x: nx, y: ny, z: nz };
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

    if (point.face === "bottom" && waves.flatBottom) {
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

    if (waves.flatBottom) {
      const fadeHeight = Math.min(dims.height * 0.12, Math.max(limit * 2.5, Number(dims.wallThickness) * 0.5 || limit));
      const floorBlend = smoothstep(0, fadeHeight, point.position.z);
      displacement *= floorBlend;
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
