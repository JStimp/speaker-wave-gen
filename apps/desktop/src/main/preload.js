import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("wavecad", {
  openProject: () => ipcRenderer.invoke("project:open"),
  saveProject: (project, existingPath) => ipcRenderer.invoke("project:save", project, existingPath),
  exportProject: (project) => ipcRenderer.invoke("export:start", project)
});

