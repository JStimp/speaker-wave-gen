import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL) || !app.isPackaged;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    title: "Speaker Wave CAD",
    backgroundColor: "#101316",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function registerIpc() {
  ipcMain.handle("project:open", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Open Wave CAD project",
      filters: [{ name: "Wave CAD project", extensions: ["wavecad.json", "json"] }],
      properties: ["openFile"]
    });

    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const content = await readFile(filePath, "utf8");
    return {
      canceled: false,
      path: filePath,
      project: JSON.parse(content)
    };
  });

  ipcMain.handle("project:save", async (_event, project, existingPath) => {
    let filePath = existingPath;

    if (!filePath) {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: "Save Wave CAD project",
        defaultPath: `${project.project?.name ?? "speaker-wave"}.wavecad.json`,
        filters: [{ name: "Wave CAD project", extensions: ["wavecad.json", "json"] }]
      });

      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }

      filePath = result.filePath;
    }

    await writeFile(filePath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
    return { canceled: false, path: filePath };
  });

  ipcMain.handle("export:start", async (_event, project) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Choose export folder",
      properties: ["openDirectory", "createDirectory"]
    });

    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true };
    }

    const outDir = result.filePaths[0];
    await mkdir(outDir, { recursive: true });
    const configPath = path.join(outDir, "speaker-wave-export.wavecad.json");
    await writeFile(configPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

    return runExporter(configPath, outDir);
  });
}

function runExporter(configPath, outDir) {
  return new Promise((resolve) => {
    const command = process.platform === "win32" ? "powershell.exe" : "python";
    const args = process.platform === "win32"
      ? [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.resolve(app.getAppPath(), "../../scripts/run-exporter-wsl.ps1"),
        "-Config",
        configPath,
        "-Out",
        outDir
      ]
      : ["-m", "wavecad_exporter", "--config", configPath, "--out", outDir, "--format", "all", "--panel-mode", "separated"];

    const child = spawn(command, args, {
      cwd: app.getAppPath(),
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({
        canceled: false,
        ok: false,
        outDir,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim()
      });
    });

    child.on("close", (code) => {
      resolve({
        canceled: false,
        ok: code === 0,
        code,
        outDir,
        stdout,
        stderr
      });
    });
  });
}

