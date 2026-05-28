import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultProject, validateProject, collectWaveSources } from "../src/index.js";

test("default project validates and exposes driver sources", () => {
  const project = createDefaultProject();
  const result = validateProject(project);

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(collectWaveSources(result.project).length, 2);
});

test("schema rejects impossible wall thickness", () => {
  const project = createDefaultProject();
  project.cabinet.dimensions.wallThickness = 400;

  const result = validateProject(project);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /wallThickness/);
});

