export const FACE_NAMES = ["front", "back", "left", "right", "top", "bottom"];

export const RESOLUTION_PRESETS = {
  draft: 14,
  low: 22,
  medium: 34,
  high: 54,
  ultra: 82
};

export const DEFAULT_PROJECT = {
  schemaVersion: 1,
  units: "mm",
  project: {
    name: "Untitled wave speaker",
    notes: ""
  },
  cabinet: {
    mode: "preset",
    preset: "rectangular",
    dimensions: {
      width: 520,
      height: 760,
      depth: 340,
      wallThickness: 19,
      edgeRadius: 8
    },
    material: {
      name: "hardwood",
      thickness: 19
    },
    import: null
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
    minThickness: 12,
    smoothing: 0.35
  },
  preview: {
    resolution: "medium",
    showSeams: true,
    showDrivers: true,
    showSources: true,
    colorMode: "height"
  },
  panelization: {
    mode: "separated",
    includeBack: false,
    cornerStrategy: "matchedReliefEdges",
    kerf: 0,
    edgeAllowance: 2
  },
  export: {
    formats: ["step", "stl", "obj"],
    stepMode: "solidAndPanels",
    meshTolerance: 0.25,
    outputDirectory: "exports"
  }
};

export function createDefaultProject() {
  return JSON.parse(JSON.stringify(DEFAULT_PROJECT));
}

