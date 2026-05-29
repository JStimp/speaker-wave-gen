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

  function safeName(value) {
    return String(value).trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "wavegen3d";
  }

  function fmt(value) {
    return Number(value).toFixed(6);
  }

  window.WaveExporters = {
    downloadText,
    exportProjectJson,
    exportObj,
    exportStl,
    meshToObj,
    meshToStl
  };
}());

