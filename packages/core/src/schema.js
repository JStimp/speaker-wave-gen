import { createDefaultProject, FACE_NAMES, RESOLUTION_PRESETS } from "./default-project.js";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeDefaults(defaults, value) {
  if (!isObject(defaults)) {
    return value === undefined ? defaults : value;
  }

  const result = { ...defaults };
  if (!isObject(value)) {
    return result;
  }

  for (const [key, childValue] of Object.entries(value)) {
    const defaultValue = defaults[key];
    result[key] = isObject(defaultValue)
      ? mergeDefaults(defaultValue, childValue)
      : childValue;
  }

  return result;
}

function positiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function normalizeProject(project) {
  const defaults = createDefaultProject();
  return mergeDefaults(defaults, project);
}

export function validateProject(project) {
  const normalized = normalizeProject(project);
  const errors = [];
  const warnings = [];
  const dims = normalized.cabinet?.dimensions ?? {};

  if (normalized.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1.");
  }

  if (!["mm", "in"].includes(normalized.units)) {
    errors.push("units must be mm or in.");
  }

  if (!["preset", "import"].includes(normalized.cabinet.mode)) {
    errors.push("cabinet.mode must be preset or import.");
  }

  if (!["rectangular", "wedge", "rounded", "curvedSides"].includes(normalized.cabinet.preset)) {
    errors.push("cabinet.preset must be rectangular, wedge, rounded, or curvedSides.");
  }

  for (const key of ["width", "height", "depth", "wallThickness"]) {
    if (!positiveNumber(dims[key])) {
      errors.push(`cabinet.dimensions.${key} must be a positive number.`);
    }
  }

  if (!nonNegativeNumber(dims.edgeRadius)) {
    errors.push("cabinet.dimensions.edgeRadius must be zero or greater.");
  }

  if (positiveNumber(dims.wallThickness) && positiveNumber(dims.width)) {
    const minimumOuter = Math.min(dims.width, dims.height, dims.depth);
    if (dims.wallThickness * 2 >= minimumOuter) {
      errors.push("cabinet.dimensions.wallThickness is too large for the cabinet dimensions.");
    }
  }

  if (!Array.isArray(normalized.drivers)) {
    errors.push("drivers must be an array.");
  } else {
    normalized.drivers.forEach((driver, index) => {
      if (!driver.id) errors.push(`drivers[${index}].id is required.`);
      if (!FACE_NAMES.includes(driver.face)) errors.push(`drivers[${index}].face is invalid.`);
      if (!positiveNumber(driver.diameter)) errors.push(`drivers[${index}].diameter must be positive.`);
      if (typeof driver.center?.x !== "number" || typeof driver.center?.y !== "number") {
        errors.push(`drivers[${index}].center must include x and y numbers.`);
      }
      if (driver.source?.enabled) {
        if (!positiveNumber(driver.source.wavelength)) {
          errors.push(`drivers[${index}].source.wavelength must be positive.`);
        }
        if (typeof driver.source.amplitude !== "number") {
          errors.push(`drivers[${index}].source.amplitude must be a number.`);
        }
      }
    });
  }

  if (!Array.isArray(normalized.manualSources)) {
    errors.push("manualSources must be an array.");
  }

  if (!positiveNumber(normalized.waves.reliefDepth)) {
    errors.push("waves.reliefDepth must be positive.");
  }

  if (!["softClip", "clamp", "none"].includes(normalized.waves.normalization)) {
    errors.push("waves.normalization must be softClip, clamp, or none.");
  }

  if (!Object.hasOwn(RESOLUTION_PRESETS, normalized.preview.resolution)) {
    errors.push("preview.resolution must be one of draft, low, medium, high, or ultra.");
  }

  if (normalized.cabinet.mode === "import" && !normalized.cabinet.import?.path) {
    warnings.push("Imported cabinet mode needs an import.path before export can run.");
  }

  if (normalized.cabinet.preset !== "rectangular") {
    warnings.push("Only the rectangular preset has full first-pass geometry; other presets are schema placeholders.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    project: normalized
  };
}

