export {
  createDefaultProject,
  DEFAULT_PROJECT,
  FACE_NAMES,
  RESOLUTION_PRESETS
} from "./default-project.js";
export { validateProject, normalizeProject } from "./schema.js";
export {
  getCabinetDimensions,
  getFaceSize,
  pointOnFace,
  createDriverCircleOverlay,
  createSeamOverlay
} from "./cabinet.js";
export {
  collectWaveSources,
  surfaceDistanceToSource,
  computeWaveDisplacement
} from "./waves.js";
export {
  generatePreviewMesh,
  generatePanelMeshes,
  summarizeMesh
} from "./mesh.js";

