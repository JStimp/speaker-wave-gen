import { FACE_NAMES, RESOLUTION_PRESETS } from "./default-project.js";
import {
  getCabinetDimensions,
  getFaceSize,
  pointOnFace,
  createDriverCircleOverlay,
  createSeamOverlay
} from "./cabinet.js";
import { computeWaveDisplacement } from "./waves.js";

export function generatePreviewMesh(project, options = {}) {
  const dimensions = getCabinetDimensions(project);
  const resolution = options.resolution ?? project.preview?.resolution ?? "medium";
  const baseCells = typeof resolution === "number"
    ? resolution
    : RESOLUTION_PRESETS[resolution] ?? RESOLUTION_PRESETS.medium;
  const faces = options.faces ?? FACE_NAMES;
  const vertices = [];
  const normals = [];
  const indices = [];
  const heights = [];
  const faceIds = [];
  const faceRanges = {};

  for (const face of faces) {
    const startVertex = vertices.length / 3;
    const { columns, rows } = gridForFace(face, dimensions, baseCells);
    faceRanges[face] = { startVertex, columns, rows };

    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        const u = column / columns;
        const v = row / rows;
        const point = pointOnFace(face, u, v, dimensions);
        const wave = computeWaveDisplacement(point, project);
        const displaced = displacePoint(point, wave.displacement);

        vertices.push(displaced.x, displaced.y, displaced.z);
        normals.push(point.normal.x, point.normal.y, point.normal.z);
        heights.push(wave.displacement);
        faceIds.push(face);
      }
    }

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const a = startVertex + row * (columns + 1) + column;
        const b = a + 1;
        const c = a + (columns + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  return {
    vertices,
    normals,
    indices,
    heights,
    faceIds,
    faceRanges,
    overlays: {
      drivers: createDriverCircleOverlay(project),
      seams: createSeamOverlay(dimensions)
    },
    summary: summarizeMesh({ vertices, indices, heights })
  };
}

export function generatePanelMeshes(project, options = {}) {
  const includeBack = options.includeBack ?? project.panelization?.includeBack ?? false;
  const faces = includeBack ? FACE_NAMES : FACE_NAMES.filter((face) => face !== "back");
  const panels = {};

  for (const face of faces) {
    panels[face] = generatePreviewMesh(project, {
      ...options,
      faces: [face]
    });
  }

  return panels;
}

export function summarizeMesh(mesh) {
  const vertexCount = Math.floor(mesh.vertices.length / 3);
  const triangleCount = Math.floor(mesh.indices.length / 3);
  let minHeight = Infinity;
  let maxHeight = -Infinity;

  for (const height of mesh.heights) {
    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
  }

  return {
    vertexCount,
    triangleCount,
    minHeight: Number.isFinite(minHeight) ? minHeight : 0,
    maxHeight: Number.isFinite(maxHeight) ? maxHeight : 0
  };
}

function gridForFace(face, dimensions, baseCells) {
  const size = getFaceSize(face, dimensions);
  const longest = Math.max(dimensions.width, dimensions.height, dimensions.depth);
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

