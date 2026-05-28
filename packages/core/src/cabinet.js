import { FACE_NAMES } from "./default-project.js";

export function getCabinetDimensions(project) {
  const dims = project.cabinet.dimensions;
  return {
    width: dims.width,
    height: dims.height,
    depth: dims.depth,
    wallThickness: dims.wallThickness,
    edgeRadius: dims.edgeRadius ?? 0
  };
}

export function getFaceSize(face, dimensions) {
  switch (face) {
    case "front":
    case "back":
      return { width: dimensions.width, height: dimensions.height };
    case "left":
    case "right":
      return { width: dimensions.depth, height: dimensions.height };
    case "top":
    case "bottom":
      return { width: dimensions.width, height: dimensions.depth };
    default:
      throw new Error(`Unknown face: ${face}`);
  }
}

export function pointOnFace(face, u, v, dimensions) {
  const w = dimensions.width;
  const h = dimensions.height;
  const d = dimensions.depth;
  const xLinear = (u - 0.5) * w;
  const yLinear = (v - 0.5) * h;
  const zFromFront = d / 2 - u * d;
  const zFromFrontByV = d / 2 - v * d;

  switch (face) {
    case "front":
      return makePoint(face, u, v, xLinear, yLinear, d / 2, [0, 0, 1]);
    case "back":
      return makePoint(face, u, v, (0.5 - u) * w, yLinear, -d / 2, [0, 0, -1]);
    case "right":
      return makePoint(face, u, v, w / 2, yLinear, zFromFront, [1, 0, 0]);
    case "left":
      return makePoint(face, u, v, -w / 2, yLinear, zFromFront, [-1, 0, 0]);
    case "top":
      return makePoint(face, u, v, xLinear, h / 2, zFromFrontByV, [0, 1, 0]);
    case "bottom":
      return makePoint(face, u, v, xLinear, -h / 2, zFromFrontByV, [0, -1, 0]);
    default:
      throw new Error(`Unknown face: ${face}`);
  }
}

function makePoint(face, u, v, x, y, z, normal) {
  return {
    face,
    uv: { u, v },
    position: { x, y, z },
    normal: { x: normal[0], y: normal[1], z: normal[2] }
  };
}

export function createSeamOverlay(dimensions) {
  const faces = FACE_NAMES;
  const w = dimensions.width / 2;
  const h = dimensions.height / 2;
  const d = dimensions.depth / 2;
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

  const edgePairs = [
    ["ftl", "ftr"],
    ["ftr", "fbr"],
    ["fbr", "fbl"],
    ["fbl", "ftl"],
    ["btl", "btr"],
    ["btr", "bbr"],
    ["bbr", "bbl"],
    ["bbl", "btl"],
    ["ftl", "btl"],
    ["ftr", "btr"],
    ["fbr", "bbr"],
    ["fbl", "bbl"]
  ];

  const lines = edgePairs.map(([aKey, bKey]) => ({
    a: corners[aKey],
    b: corners[bKey]
  }));

  return { faces, lines };
}

export function createDriverCircleOverlay(project, segments = 64) {
  const dimensions = getCabinetDimensions(project);
  const z = dimensions.depth / 2 + 0.8;

  return project.drivers.map((driver) => {
    const radius = driver.diameter / 2;
    const points = [];
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      points.push({
        x: driver.center.x + Math.cos(angle) * radius,
        y: driver.center.y + Math.sin(angle) * radius,
        z
      });
    }
    return {
      id: driver.id,
      label: driver.label,
      diameter: driver.diameter,
      face: driver.face,
      points
    };
  });
}
