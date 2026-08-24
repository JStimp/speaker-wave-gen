(function () {
  "use strict";

  function downloadText(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType || "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function exportProjectJson(project) {
    downloadText(safeName(project.project.name || "wavegen3d") + ".wavecad.json", JSON.stringify(project, null, 2) + "\n", "application/json");
  }

  function exportSolidStepProjectJson(project) {
    const solidProject = JSON.parse(JSON.stringify(project));
    solidProject.export = solidProject.export || {};
    solidProject.export.solidResolution = solidProject.export.solidResolution || "fine";
    solidProject.export.solidSurfaceControlLimit = solidProject.export.solidSurfaceControlLimit || 34;
    solidProject.export.solidExporter = {
      target: "outerSolidStep",
      output: "exports/outer-solid.step",
      launcher: "Export-Solid-Step.bat"
    };
    downloadText(safeName(solidProject.project.name || "wavegen3d") + ".solid-step.wavecad.json", JSON.stringify(solidProject, null, 2) + "\n", "application/json");
  }

  function meshToObj(mesh, name) {
    const lines = ["o " + (name || "wavegen3d_mesh")];
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      lines.push("v " + fmt(mesh.vertices[i]) + " " + fmt(mesh.vertices[i + 1]) + " " + fmt(mesh.vertices[i + 2]));
    }
    for (let i = 0; i < mesh.normals.length; i += 3) {
      lines.push("vn " + fmt(mesh.normals[i]) + " " + fmt(mesh.normals[i + 1]) + " " + fmt(mesh.normals[i + 2]));
    }
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = mesh.indices[i] + 1;
      const b = mesh.indices[i + 1] + 1;
      const c = mesh.indices[i + 2] + 1;
      lines.push("f " + a + "//" + a + " " + b + "//" + b + " " + c + "//" + c);
    }
    return lines.join("\n") + "\n";
  }

  function meshToStl(mesh, name) {
    const lines = ["solid " + (name || "wavegen3d_mesh")];
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = vertex(mesh.vertices, mesh.indices[i]);
      const b = vertex(mesh.vertices, mesh.indices[i + 1]);
      const c = vertex(mesh.vertices, mesh.indices[i + 2]);
      const n = triangleNormal(a, b, c);
      lines.push("  facet normal " + fmt(n.x) + " " + fmt(n.y) + " " + fmt(n.z));
      lines.push("    outer loop");
      lines.push("      vertex " + fmt(a.x) + " " + fmt(a.y) + " " + fmt(a.z));
      lines.push("      vertex " + fmt(b.x) + " " + fmt(b.y) + " " + fmt(b.z));
      lines.push("      vertex " + fmt(c.x) + " " + fmt(c.y) + " " + fmt(c.z));
      lines.push("    endloop");
      lines.push("  endfacet");
    }
    lines.push("endsolid " + (name || "wavegen3d_mesh"));
    return lines.join("\n") + "\n";
  }

  function exportObj(project, mesh) {
    const name = safeName(project.project.name || "wavegen3d");
    downloadText(name + ".obj", meshToObj(mesh, name), "text/plain");
  }

  function exportStl(project, mesh) {
    const name = safeName(project.project.name || "wavegen3d");
    downloadText(name + ".stl", meshToStl(mesh, name), "model/stl");
  }

  function meshToStep(mesh, project, name) {
    if (project && project.export && project.export.stepMode === "facetedSolidStep") {
      return meshToFacetedStep(mesh, project, name);
    }
    return meshToSurfaceStep(mesh, project, name);
  }

  function meshToSurfaceStep(mesh, project, name) {
    const title = safeStepString(name || "wavegen3d_surface");
    const model = createStepModel(project, title, "WaveGen3D smooth surface STEP");
    const add = model.add;
    const controlLimit = Math.max(10, Math.min(64, Number(project && project.export && project.export.surfaceControlLimit) || 34));
    const patches = surfacePatchesFromMesh(mesh, controlLimit);
    const edgeMap = new Map();
    const faceIds = [];

    patches.forEach((patch) => {
      faceIds.push(addSurfaceFace(add, edgeMap, patch));
    });

    const shell = add("CLOSED_SHELL('',(" + faceIds.join(",") + "))");
    const body = add("MANIFOLD_SOLID_BREP('" + title + "'," + shell + ")");
    const representation = add("ADVANCED_BREP_SHAPE_REPRESENTATION('',(" + model.placement + "," + body + ")," + model.context + ")");
    add("SHAPE_DEFINITION_REPRESENTATION(" + model.definitionShape + "," + representation + ")");
    return finishStep(model, "WaveGen3D smooth surface STEP");
  }

  function meshToFacetedStep(mesh, project, name) {
    const title = safeStepString(name || "wavegen3d_mesh");
    const model = createStepModel(project, title, "WaveGen3D faceted solid fallback STEP");
    const add = model.add;

    const faceIds = [];
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = vertex(mesh.vertices, mesh.indices[i]);
      const b = vertex(mesh.vertices, mesh.indices[i + 1]);
      const c = vertex(mesh.vertices, mesh.indices[i + 2]);
      const normal = triangleNormal(a, b, c);
      const ref = referenceDirection(normal);
      const pa = add("CARTESIAN_POINT('',(" + fmt(a.x) + "," + fmt(a.y) + "," + fmt(a.z) + "))");
      const pb = add("CARTESIAN_POINT('',(" + fmt(b.x) + "," + fmt(b.y) + "," + fmt(b.z) + "))");
      const pc = add("CARTESIAN_POINT('',(" + fmt(c.x) + "," + fmt(c.y) + "," + fmt(c.z) + "))");
      const loop = add("POLY_LOOP('',(" + pa + "," + pb + "," + pc + "))");
      const bound = add("FACE_OUTER_BOUND(''," + loop + ",.T.)");
      const normalDir = add("DIRECTION('',(" + fmt(normal.x) + "," + fmt(normal.y) + "," + fmt(normal.z) + "))");
      const refDir = add("DIRECTION('',(" + fmt(ref.x) + "," + fmt(ref.y) + "," + fmt(ref.z) + "))");
      const facePlacement = add("AXIS2_PLACEMENT_3D(''," + pa + "," + normalDir + "," + refDir + ")");
      const plane = add("PLANE(''," + facePlacement + ")");
      faceIds.push(add("ADVANCED_FACE('',(" + bound + ")," + plane + ",.T.)"));
    }

    const shell = add("CLOSED_SHELL('',(" + faceIds.join(",") + "))");
    const body = add("MANIFOLD_SOLID_BREP('" + title + "'," + shell + ")");
    const representation = add("ADVANCED_BREP_SHAPE_REPRESENTATION('',(" + model.placement + "," + body + ")," + model.context + ")");
    add("SHAPE_DEFINITION_REPRESENTATION(" + model.definitionShape + "," + representation + ")");
    return finishStep(model, "WaveGen3D faceted solid fallback STEP");
  }

  function exportStep(project, mesh) {
    const name = safeName(project.project.name || "wavegen3d");
    downloadText(name + ".step", meshToStep(mesh, project, name), "application/step");
  }

  function exportDfmPanelsObj(project, panelSet) {
    const name = safeName(project.project.name || "wavegen3d");
    downloadText(name + ".dfm-panels.obj", panelSetToObj(panelSet, name), "text/plain");
  }

  function exportDfmPanelsStl(project, panelSet) {
    const name = safeName(project.project.name || "wavegen3d");
    downloadText(name + ".dfm-panels.stl", panelSetToStl(panelSet, name), "model/stl");
  }

  function exportDfmPanelsStep(project, panelSet) {
    const name = safeName(project.project.name || "wavegen3d");
    downloadText(name + ".dfm-panels.step", panelSetToStep(panelSet, project, name), "application/step");
  }

  async function exportDfmPanelsSeparate(project, panelSet, faces, format) {
    const projectName = safeName(project.project.name || "wavegen3d");
    const selected = panelSet.panels.filter((panel) => faces.indexOf(panel.face) !== -1);
    if (!selected.length) throw new Error("No DFM panels were selected.");
    let folder = null;

    if (typeof window !== "undefined" && typeof window.showDirectoryPicker === "function") {
      const root = await window.showDirectoryPicker({ mode: "readwrite" });
      folder = await root.getDirectoryHandle(projectName + "-dfm-panels", { create: true });
    }

    const files = selected.map((panel) => {
      const centeredPanel = centerPanelForSeparateExport(panel);
      const singlePanelSet = {
        units: panelSet.units,
        resolution: panelSet.resolution,
        panels: [centeredPanel]
      };
      const baseName = projectName + "-dfm-" + safeName(panel.face) + "-panel";
      if (format === "step") {
        return {
          filename: baseName + ".step",
          contents: panelSetToStep(singlePanelSet, project, baseName),
          mimeType: "application/step"
        };
      }
      if (format === "obj") {
        return {
          filename: baseName + ".obj",
          contents: panelSetToObj(singlePanelSet, baseName),
          mimeType: "text/plain"
        };
      }
      if (format === "stl") {
        return {
          filename: baseName + ".stl",
          contents: panelSetToStl(singlePanelSet, baseName),
          mimeType: "model/stl"
        };
      }
      throw new Error("Unsupported DFM panel format: " + format);
    });

    if (folder) {
      for (const file of files) {
        const handle = await folder.getFileHandle(file.filename, { create: true });
        const writable = await handle.createWritable();
        await writable.write(new Blob([file.contents], { type: file.mimeType }));
        await writable.close();
      }
      return { count: files.length, method: "directory" };
    }

    files.forEach((file, index) => {
      setTimeout(() => downloadText(file.filename, file.contents, file.mimeType), index * 180);
    });
    return { count: files.length, method: "downloads" };
  }

  function centerPanelForSeparateExport(panel) {
    const origin = panel.origin || { x: 0, y: 0, z: 0 };
    const centered = Object.assign({}, panel);
    centered.origin = { x: 0, y: 0, z: 0 };
    centered.vertices = panel.vertices.map((value, index) => {
      if (index % 3 === 0) return value - origin.x;
      if (index % 3 === 1) return value - origin.y;
      return value - origin.z;
    });
    centered.topGrid = offsetPointGrid(panel.topGrid, origin);
    centered.bottomGrid = offsetPointGrid(panel.bottomGrid, origin);
    return centered;
  }

  function offsetPointGrid(grid, origin) {
    return grid.map((row) => row.map((point) => ({
      x: point.x - origin.x,
      y: point.y - origin.y,
      z: point.z - origin.z
    })));
  }

  function panelSetToObj(panelSet, name) {
    const lines = [
      "# WaveGen3D DFM panel export",
      "# Project: " + (name || "wavegen3d"),
      "# Units: " + (panelSet.units || "in"),
      "# Routed edges are owned by that panel and roll down for CNC machining.",
      "# Flat edges stay square so another panel can meet them or the blank can be held flat."
    ];
    let vertexOffset = 1;

    panelSet.panels.forEach((panel) => {
      lines.push("");
      lines.push("o " + safeName(panel.face + "_panel"));
      lines.push("# label: " + panel.label);
      lines.push("# nominal_size: " + fmt(panel.width) + " x " + fmt(panel.height) + " " + (panelSet.units || "in"));
      lines.push("# thickness: " + fmt(panel.thickness) + " " + (panelSet.units || "in"));
      lines.push("# routed_curved_edges: " + panel.ownedEdges.join(","));
      lines.push("# flat_mating_edges: " + panel.flatEdges.join(","));
      lines.push("# edge_radius: " + fmt(panel.edgeRadius) + " " + (panelSet.units || "in"));

      for (let i = 0; i < panel.vertices.length; i += 3) {
        lines.push("v " + fmt(panel.vertices[i]) + " " + fmt(panel.vertices[i + 1]) + " " + fmt(panel.vertices[i + 2]));
      }
      for (let i = 0; i < panel.indices.length; i += 3) {
        lines.push(
          "f " +
          (panel.indices[i] + vertexOffset) + " " +
          (panel.indices[i + 1] + vertexOffset) + " " +
          (panel.indices[i + 2] + vertexOffset)
        );
      }
      vertexOffset += panel.vertices.length / 3;
    });

    return lines.join("\n") + "\n";
  }

  function panelSetToStl(panelSet, name) {
    const lines = [];

    panelSet.panels.forEach((panel) => {
      const solidName = safeName(panel.face + "_panel_curved_" + panel.ownedEdges.join("_"));
      lines.push("  solid " + solidName);
      for (let i = 0; i < panel.indices.length; i += 3) {
        const a = vertex(panel.vertices, panel.indices[i]);
        const b = vertex(panel.vertices, panel.indices[i + 1]);
        const c = vertex(panel.vertices, panel.indices[i + 2]);
        const n = triangleNormal(a, b, c);
        lines.push("    facet normal " + fmt(n.x) + " " + fmt(n.y) + " " + fmt(n.z));
        lines.push("      outer loop");
        lines.push("        vertex " + fmt(a.x) + " " + fmt(a.y) + " " + fmt(a.z));
        lines.push("        vertex " + fmt(b.x) + " " + fmt(b.y) + " " + fmt(b.z));
        lines.push("        vertex " + fmt(c.x) + " " + fmt(c.y) + " " + fmt(c.z));
        lines.push("      endloop");
        lines.push("    endfacet");
      }
      lines.push("  endsolid " + solidName);
    });

    return lines.join("\n") + "\n";
  }

  function panelSetToStep(panelSet, project, name) {
    const title = safeStepString((name || "wavegen3d") + " DFM panels");
    const stepProject = project || { units: panelSet.units || "in" };
    const model = createStepModel(stepProject, title, "WaveGen3D DFM smooth panel STEP");
    const add = model.add;
    const controlLimit = Math.max(10, Math.min(64, Number(project && project.export && project.export.surfaceControlLimit) || 34));
    const bodies = [];

    panelSet.panels.forEach((panel) => {
      const edgeMap = new Map();
      const faceIds = dfmPanelSurfacePatches(panel, controlLimit).map((patch) => addSurfaceFace(add, edgeMap, patch));
      const shell = add("CLOSED_SHELL('',(" + faceIds.join(",") + "))");
      bodies.push(add("MANIFOLD_SOLID_BREP('" + safeStepString(panel.label + " DFM solid") + "'," + shell + ")"));
    });

    const representationItems = [model.placement].concat(bodies).join(",");
    const representation = add("ADVANCED_BREP_SHAPE_REPRESENTATION('',(" + representationItems + ")," + model.context + ")");
    add("SHAPE_DEFINITION_REPRESENTATION(" + model.definitionShape + "," + representation + ")");
    return finishStep(model, "WaveGen3D DFM smooth panel STEP");
  }

  function dfmPanelSurfacePatches(panel, controlLimit) {
    const top = panel.topGrid;
    const bottom = panel.bottomGrid;
    const lastRow = top.length - 1;
    const lastColumn = top[0].length - 1;
    return [
      makeSurfacePatch(sampleGridAsColumns(top, controlLimit), { surfaceType: panel.isWavePanel === false ? "plane" : "spline" }),
      makeSurfacePatch(sampleGridAsColumns(bottom, controlLimit, { reverseRows: true }), { surfaceType: "plane" }),
      makeSurfacePatch(edgeSurfaceColumns(top[0], bottom[0], controlLimit), { surfaceType: "plane" }),
      makeSurfacePatch(edgeSurfaceColumns(
        top.map((row) => row[lastColumn]),
        bottom.map((row) => row[lastColumn]),
        controlLimit
      ), { surfaceType: "plane" }),
      makeSurfacePatch(edgeSurfaceColumns(top[lastRow].slice().reverse(), bottom[lastRow].slice().reverse(), controlLimit), { surfaceType: "plane" }),
      makeSurfacePatch(edgeSurfaceColumns(
        top.map((row) => row[0]).reverse(),
        bottom.map((row) => row[0]).reverse(),
        controlLimit
      ), { surfaceType: "plane" })
    ];
  }

  function makeSurfacePatch(points, options) {
    const settings = options && typeof options === "object" ? options : {};
    return {
      points,
      faceSense: settings.faceSense !== false,
      surfaceType: settings.surfaceType || "spline",
      bottom: points.map((column) => column[0]),
      right: points[points.length - 1].slice(),
      top: points.map((column) => column[column.length - 1]).reverse(),
      left: points[0].slice().reverse()
    };
  }

  function addSurfaceFace(add, edgeMap, patch) {
    if (patch.surfaceType === "plane") return addPlanarFace(add, edgeMap, patch);
    return addSplineFace(add, edgeMap, patch);
  }

  function addPlanarFace(add, edgeMap, patch) {
    const origin = patch.points[0][0];
    const normal = patchNormal(patch.points);
    const ref = referenceDirection(normal);
    const location = addPoint(add, origin);
    const normalDir = add("DIRECTION('',(" + fmt(normal.x) + "," + fmt(normal.y) + "," + fmt(normal.z) + "))");
    const refDir = add("DIRECTION('',(" + fmt(ref.x) + "," + fmt(ref.y) + "," + fmt(ref.z) + "))");
    const placement = add("AXIS2_PLACEMENT_3D(''," + location + "," + normalDir + "," + refDir + ")");
    const plane = add("PLANE(''," + placement + ")");
    const orientedEdges = [
      orientedEdgeForPoints(add, edgeMap, patch.bottom),
      orientedEdgeForPoints(add, edgeMap, patch.right),
      orientedEdgeForPoints(add, edgeMap, patch.top),
      orientedEdgeForPoints(add, edgeMap, patch.left)
    ];
    const loop = add("EDGE_LOOP('',(" + orientedEdges.join(",") + "))");
    const bound = add("FACE_OUTER_BOUND(''," + loop + ",.T.)");
    return add("ADVANCED_FACE('',(" + bound + ")," + plane + "," + (patch.faceSense === false ? ".F." : ".T.") + ")");
  }

  function patchNormal(points) {
    const origin = points[0][0];
    const alongU = subtractPoint(points[points.length - 1][0], origin);
    const alongV = subtractPoint(points[0][points[0].length - 1], origin);
    const cross = {
      x: alongU.y * alongV.z - alongU.z * alongV.y,
      y: alongU.z * alongV.x - alongU.x * alongV.z,
      z: alongU.x * alongV.y - alongU.y * alongV.x
    };
    const length = Math.sqrt(cross.x * cross.x + cross.y * cross.y + cross.z * cross.z) || 1;
    return { x: cross.x / length, y: cross.y / length, z: cross.z / length };
  }

  function subtractPoint(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  function sampleGridAsColumns(grid, maxControls, options) {
    const rowCount = grid.length;
    const columnCount = grid[0].length;
    const uCount = Math.max(2, Math.min(maxControls, columnCount));
    const vCount = Math.max(2, Math.min(maxControls, rowCount));
    const reverseColumns = options && options.reverseColumns;
    const reverseRows = options && options.reverseRows;
    const columns = [];

    for (let u = 0; u < uCount; u += 1) {
      const sourceColumn = sampleIndex(u, uCount, columnCount, reverseColumns);
      const column = [];
      for (let v = 0; v < vCount; v += 1) {
        const sourceRow = sampleIndex(v, vCount, rowCount, reverseRows);
        column.push(copyPoint(grid[sourceRow][sourceColumn]));
      }
      columns.push(column);
    }

    return columns;
  }

  function edgeSurfaceColumns(topEdge, bottomEdge, maxControls) {
    const count = Math.max(2, Math.min(maxControls, topEdge.length));
    const columns = [];
    for (let i = 0; i < count; i += 1) {
      const index = sampleIndex(i, count, topEdge.length, false);
      columns.push([copyPoint(bottomEdge[index]), copyPoint(topEdge[index])]);
    }
    return columns;
  }

  function sampleIndex(index, sampleCount, sourceCount, reverse) {
    const value = sampleCount <= 1 ? 0 : Math.round((index / (sampleCount - 1)) * (sourceCount - 1));
    return reverse ? sourceCount - 1 - value : value;
  }

  function copyPoint(point) {
    return { x: point.x, y: point.y, z: point.z };
  }

  function addSplineFace(add, edgeMap, patch) {
    const uCount = patch.points.length;
    const vCount = patch.points[0].length;
    const uDegree = Math.min(3, uCount - 1);
    const vDegree = Math.min(3, vCount - 1);
    const controlRows = patch.points.map((column) => "(" + column.map((point) => addPoint(add, point)).join(",") + ")");
    const uKnots = knotSpec(uCount, uDegree);
    const vKnots = knotSpec(vCount, vDegree);
    const surface = add(
      "B_SPLINE_SURFACE_WITH_KNOTS(''," + uDegree + "," + vDegree + ",(" + controlRows.join(",") +
      "),.UNSPECIFIED.,.F.,.F.,.F.," + uKnots.mults + "," + vKnots.mults + "," +
      uKnots.values + "," + vKnots.values + ",.UNSPECIFIED.)"
    );
    const orientedEdges = [
      orientedEdgeForPoints(add, edgeMap, patch.bottom),
      orientedEdgeForPoints(add, edgeMap, patch.right),
      orientedEdgeForPoints(add, edgeMap, patch.top),
      orientedEdgeForPoints(add, edgeMap, patch.left)
    ];
    const loop = add("EDGE_LOOP('',(" + orientedEdges.join(",") + "))");
    const bound = add("FACE_OUTER_BOUND(''," + loop + ",.T.)");
    return add("ADVANCED_FACE('',(" + bound + ")," + surface + "," + (patch.faceSense === false ? ".F." : ".T.") + ")");
  }

  function createStepModel(project, title, description) {
    const units = (project && project.units) || "in";
    const entities = [];
    let nextId = 1;

    function add(record) {
      const id = nextId;
      nextId += 1;
      entities.push("#" + id + "=" + record + ";");
      return "#" + id;
    }

    const appContext = add("APPLICATION_CONTEXT('automotive_design')");
    add("APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000," + appContext + ")");
    const productContext = add("PRODUCT_CONTEXT(''," + appContext + ",'mechanical')");
    const product = add("PRODUCT('" + title + "','" + title + "','',(" + productContext + "))");
    const formation = add("PRODUCT_DEFINITION_FORMATION('1',''," + product + ")");
    const definitionContext = add("PRODUCT_DEFINITION_CONTEXT('part definition'," + appContext + ",'design')");
    const definition = add("PRODUCT_DEFINITION('design',''," + formation + "," + definitionContext + ")");
    const definitionShape = add("PRODUCT_DEFINITION_SHAPE('',''," + definition + ")");

    const dim = add("DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.)");
    const mmUnit = add("(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))");
    let lengthUnit = mmUnit;
    if (units === "in") {
      const inchMeasure = add("LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4)," + mmUnit + ")");
      lengthUnit = add("(CONVERSION_BASED_UNIT('INCH'," + inchMeasure + ") LENGTH_UNIT() NAMED_UNIT(" + dim + "))");
    }
    const angleUnit = add("(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))");
    const solidAngleUnit = add("(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())");
    const uncertainty = add("UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.00001)," + lengthUnit + ",'distance_accuracy_value','')");
    const context = add("(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((" + uncertainty + ")) GLOBAL_UNIT_ASSIGNED_CONTEXT((" + lengthUnit + "," + angleUnit + "," + solidAngleUnit + ")) REPRESENTATION_CONTEXT('',''))");
    const origin = add("CARTESIAN_POINT('',(0.,0.,0.))");
    const zDir = add("DIRECTION('',(0.,0.,1.))");
    const xDir = add("DIRECTION('',(1.,0.,0.))");
    const placement = add("AXIS2_PLACEMENT_3D(''," + origin + "," + zDir + "," + xDir + ")");

    return { add, context, definitionShape, description, entities, placement, title };
  }

  function finishStep(model, description) {
    return [
      "ISO-10303-21;",
      "HEADER;",
      "FILE_DESCRIPTION(('" + safeStepString(description) + "'),'2;1');",
      "FILE_NAME('" + model.title + ".step','" + new Date().toISOString() + "',('WaveGen3D'),('WaveGen3D'),'WaveGen3D static app','WaveGen3D','');",
      "FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));",
      "ENDSEC;",
      "DATA;",
      model.entities.join("\n"),
      "ENDSEC;",
      "END-ISO-10303-21;",
      ""
    ].join("\n");
  }

  function surfacePatchesFromMesh(mesh, controlLimit) {
    return Object.keys(mesh.faceRanges).map((face) => {
      const range = mesh.faceRanges[face];
      const uCount = Math.max(4, Math.min(controlLimit, range.columns + 1));
      const vCount = Math.max(4, Math.min(controlLimit, range.rows + 1));
      const points = [];

      for (let u = 0; u < uCount; u += 1) {
        const column = Math.round((u / (uCount - 1)) * range.columns);
        const pointColumn = [];
        for (let v = 0; v < vCount; v += 1) {
          const row = Math.round((v / (vCount - 1)) * range.rows);
          pointColumn.push(vertex(mesh.vertices, range.startVertex + row * (range.columns + 1) + column));
        }
        points.push(pointColumn);
      }

      return {
        face,
        surfaceType: face === "bottom" ? "plane" : "spline",
        points,
        bottom: points.map((column) => column[0]),
        right: points[points.length - 1].slice(),
        top: points.map((column) => column[column.length - 1]).reverse(),
        left: points[0].slice().reverse()
      };
    });
  }

  function orientedEdgeForPoints(add, edgeMap, points) {
    const start = points[0];
    const end = points[points.length - 1];
    const startKey = pointKey(start);
    const endKey = pointKey(end);
    const mapKey = startKey < endKey ? startKey + "|" + endKey : endKey + "|" + startKey;
    let edge = edgeMap.get(mapKey);

    if (!edge) {
      const degree = Math.min(3, points.length - 1);
      const curvePoints = points.map((point) => addPoint(add, point));
      const knots = knotSpec(points.length, degree);
      const curve = add(
        "B_SPLINE_CURVE_WITH_KNOTS(''," + degree + ",(" + curvePoints.join(",") +
        "),.UNSPECIFIED.,.F.,.F.," + knots.mults + "," + knots.values + ",.UNSPECIFIED.)"
      );
      const startVertex = add("VERTEX_POINT(''," + addPoint(add, start) + ")");
      const endVertex = add("VERTEX_POINT(''," + addPoint(add, end) + ")");
      edge = {
        edgeCurve: add("EDGE_CURVE(''," + startVertex + "," + endVertex + "," + curve + ",.T.)"),
        startKey,
        endKey
      };
      edgeMap.set(mapKey, edge);
    }

    const sameDirection = edge.startKey === startKey && edge.endKey === endKey;
    return add("ORIENTED_EDGE('',*,*," + edge.edgeCurve + "," + (sameDirection ? ".T." : ".F.") + ")");
  }

  function addPoint(add, point) {
    return add("CARTESIAN_POINT('',(" + fmt(point.x) + "," + fmt(point.y) + "," + fmt(point.z) + "))");
  }

  function knotSpec(count, degree) {
    const spans = Math.max(1, count - degree);
    const mults = [degree + 1];
    const values = [0];
    for (let i = 1; i < spans; i += 1) {
      mults.push(1);
      values.push(i);
    }
    mults.push(degree + 1);
    values.push(spans);
    return {
      mults: "(" + mults.join(",") + ")",
      values: "(" + values.map((value) => fmt(value)).join(",") + ")"
    };
  }

  function pointKey(point) {
    return fmt(point.x) + "," + fmt(point.y) + "," + fmt(point.z);
  }

  function vertex(vertices, index) {
    const offset = index * 3;
    return { x: vertices[offset], y: vertices[offset + 1], z: vertices[offset + 2] };
  }

  function triangleNormal(a, b, c) {
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const cross = {
      x: ab.y * ac.z - ab.z * ac.y,
      y: ab.z * ac.x - ab.x * ac.z,
      z: ab.x * ac.y - ab.y * ac.x
    };
    const length = Math.sqrt(cross.x * cross.x + cross.y * cross.y + cross.z * cross.z) || 1;
    return { x: cross.x / length, y: cross.y / length, z: cross.z / length };
  }

  function referenceDirection(normal) {
    const candidate = Math.abs(normal.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    const dot = normal.x * candidate.x + normal.y * candidate.y + normal.z * candidate.z;
    const ref = {
      x: candidate.x - normal.x * dot,
      y: candidate.y - normal.y * dot,
      z: candidate.z - normal.z * dot
    };
    const length = Math.sqrt(ref.x * ref.x + ref.y * ref.y + ref.z * ref.z) || 1;
    return { x: ref.x / length, y: ref.y / length, z: ref.z / length };
  }

  function safeName(value) {
    return String(value).trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "wavegen3d";
  }

  function safeStepString(value) {
    return String(value).replace(/'/g, "''").replace(/[^a-z0-9 _.-]/gi, "-").slice(0, 80) || "wavegen3d";
  }

  function fmt(value) {
    return Number(value).toFixed(6);
  }

  window.WaveExporters = {
    downloadText,
    exportProjectJson,
    exportSolidStepProjectJson,
    exportObj,
    exportStl,
    exportStep,
    exportDfmPanelsObj,
    exportDfmPanelsStl,
    exportDfmPanelsStep,
    exportDfmPanelsSeparate,
    meshToObj,
    meshToStl,
    meshToStep,
    panelSetToObj,
    panelSetToStl,
    panelSetToStep
  };
}());
