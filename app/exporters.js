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
    const title = safeStepString(name || "wavegen3d_mesh");
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
    const representation = add("ADVANCED_BREP_SHAPE_REPRESENTATION('',(" + placement + "," + body + ")," + context + ")");
    add("SHAPE_DEFINITION_REPRESENTATION(" + definitionShape + "," + representation + ")");

    return [
      "ISO-10303-21;",
      "HEADER;",
      "FILE_DESCRIPTION(('WaveGen3D experimental faceted STEP'),'2;1');",
      "FILE_NAME('" + title + ".step','" + new Date().toISOString() + "',('WaveGen3D'),('WaveGen3D'),'WaveGen3D static app','WaveGen3D','');",
      "FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));",
      "ENDSEC;",
      "DATA;",
      entities.join("\n"),
      "ENDSEC;",
      "END-ISO-10303-21;",
      ""
    ].join("\n");
  }

  function exportStep(project, mesh) {
    const name = safeName(project.project.name || "wavegen3d");
    downloadText(name + ".step", meshToStep(mesh, project, name), "application/step");
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
