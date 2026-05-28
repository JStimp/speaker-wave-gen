import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultProject,
  getCabinetDimensions,
  pointOnFace,
  computeWaveDisplacement,
  generatePreviewMesh
} from "../src/index.js";

test("front and right shared edge has matching relief height", () => {
  const project = createDefaultProject();
  const dimensions = getCabinetDimensions(project);
  const frontEdgePoint = pointOnFace("front", 1, 0.42, dimensions);
  const rightEdgePoint = pointOnFace("right", 0, 0.42, dimensions);

  const front = computeWaveDisplacement(frontEdgePoint, project).displacement;
  const right = computeWaveDisplacement(rightEdgePoint, project).displacement;

  assert.ok(Math.abs(front - right) < 1e-9, `expected ${front} to equal ${right}`);
});

test("preview mesh is nonblank and finite", () => {
  const project = createDefaultProject();
  const mesh = generatePreviewMesh(project, { resolution: "draft" });

  assert.ok(mesh.summary.vertexCount > 0);
  assert.ok(mesh.summary.triangleCount > 0);
  assert.ok(mesh.vertices.every(Number.isFinite));
  assert.ok(mesh.heights.every(Number.isFinite));
  assert.notEqual(mesh.summary.minHeight, mesh.summary.maxHeight);
});

