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
    const model = createStepModel(project, title, "WaveGen3D smooth spline STEP");
    const add = model.add;
    const controlLimit = Math.max(10, Math.min(64, Number(project && project.export && project.export.surfaceControlLimit) || 34));
    const patches = surfacePatchesFromMesh(mesh, controlLimit);
    const edgeMap = new Map();
    const faceIds = [];

    patches.forEach((patch) => {
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
      faceIds.push(add("ADVANCED_FACE('',(" + bound + ")," + surface + ",.T.)"));
    });

    const shell = add("CLOSED_SHELL('',(" + faceIds.join(",") + "))");
    const body = add("MANIFOLD_SOLID_BREP('" + title + "'," + shell + ")");
    const representation = add("ADVANCED_BREP_SHAPE_REPRESENTATION('',(" + model.placement + "," + body + ")," + model.context + ")");
    add("SHAPE_DEFINITION_REPRESENTATION(" + model.definitionShape + "," + representation + ")");
    return finishStep(model, "WaveGen3D smooth spline STEP");
  }

  function meshToFacetedStep(mesh, project, name) {
    const title = safeStepString(name || "wavegen3d_mesh");
    const model = createStepModel(project, title, "WaveGen3D experimental faceted STEP");
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
    return finishStep(model, "WaveGen3D experimental faceted STEP");
  }

  function exportStep(project, mesh) {
    const name = safeName(project.project.name || "wavegen3d");
    downloadText(name + ".step", meshToStep(mesh, project, name), "application/step");
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
    exportObj,
    exportStl,
    exportStep,
    meshToObj,
    meshToStl,
    meshToStep
  };
}());
