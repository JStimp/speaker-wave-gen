import { getCabinetDimensions } from "./cabinet.js";

const TWO_PI = Math.PI * 2;

export function collectWaveSources(project) {
  const driverSources = (project.drivers ?? [])
    .filter((driver) => driver.source?.enabled)
    .map((driver) => ({
      id: driver.id,
      label: driver.label ?? driver.id,
      kind: "driver",
      face: driver.face ?? "front",
      center: {
        x: driver.center.x,
        y: driver.center.y,
        z: driver.center.z
      },
      amplitude: driver.source.amplitude,
      wavelength: driver.source.wavelength,
      phase: driver.source.phase ?? 0,
      falloff: driver.source.falloff ?? 0
    }));

  const manualSources = (project.manualSources ?? [])
    .filter((source) => source.enabled !== false)
    .map((source) => ({
      id: source.id,
      label: source.label ?? source.id,
      kind: "manual",
      face: source.face ?? "front",
      center: source.center,
      amplitude: source.amplitude,
      wavelength: source.wavelength,
      phase: source.phase ?? 0,
      falloff: source.falloff ?? 0
    }));

  return [...driverSources, ...manualSources].filter((source) => (
    Number.isFinite(source.amplitude)
    && Number.isFinite(source.wavelength)
    && source.wavelength > 0
  ));
}

export function surfaceDistanceToSource(point, source, dimensions) {
  if ((source.face ?? "front") !== "front") {
    return euclideanDistance(point.position, source.center);
  }

  return frontSourceCuboidDistance(point, source, dimensions);
}

function frontSourceCuboidDistance(point, source, dimensions) {
  const w = dimensions.width;
  const h = dimensions.height;
  const d = dimensions.depth;
  const halfW = w / 2;
  const halfH = h / 2;
  const halfD = d / 2;
  const sx = source.center.x;
  const sy = source.center.y;
  const { x, y, z } = point.position;
  const depthFromFront = halfD - z;

  switch (point.face) {
    case "front":
      return distance2(x - sx, y - sy);
    case "right":
      return distance2(halfW + depthFromFront - sx, y - sy);
    case "left":
      return distance2(-halfW - depthFromFront - sx, y - sy);
    case "top":
      return distance2(x - sx, halfH + depthFromFront - sy);
    case "bottom":
      return distance2(x - sx, -halfH - depthFromFront - sy);
    case "back": {
      const viaRight = distance2(halfW + d + (halfW - x) - sx, y - sy);
      const viaLeft = distance2(-halfW - d - (x + halfW) - sx, y - sy);
      const viaTop = distance2(x - sx, halfH + d + (halfH - y) - sy);
      const viaBottom = distance2(x - sx, -halfH - d - (y + halfH) - sy);
      return Math.min(viaRight, viaLeft, viaTop, viaBottom);
    }
    default:
      return euclideanDistance(point.position, {
        x: sx,
        y: sy,
        z: halfD
      });
  }
}

export function computeWaveDisplacement(point, project) {
  const dimensions = getCabinetDimensions(project);
  const sources = collectWaveSources(project);
  const waves = project.waves;
  let raw = 0;

  for (const source of sources) {
    const distance = Math.max(0.0001, surfaceDistanceToSource(point, source, dimensions));
    const attenuation = Math.exp(-(source.falloff ?? 0) * distance);
    raw += source.amplitude
      * Math.sin((TWO_PI * distance) / source.wavelength + (source.phase ?? 0))
      * attenuation;
  }

  raw *= waves.baseAmplitude ?? 1;

  const limit = Math.max(0.001, waves.reliefDepth ?? 1);
  let displacement = raw + (waves.reliefBias ?? 0);

  if (waves.normalization === "softClip") {
    displacement = Math.tanh(displacement / limit) * limit;
  } else if (waves.normalization === "clamp") {
    displacement = Math.max(-limit, Math.min(limit, displacement));
  }

  return {
    raw,
    displacement,
    sourceCount: sources.length
  };
}

function distance2(dx, dy) {
  return Math.sqrt(dx * dx + dy * dy);
}

function euclideanDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

