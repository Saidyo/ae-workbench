import { app, BrowserWindow, dialog, ipcMain, protocol, session, shell, type OpenDialogOptions } from "electron";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { watch, type FSWatcher } from "chokidar";
import { DataStore, type ImportDestination } from "./dataStore";
import { buildEagleSyncPayload, checkEagleConnection } from "./eagleBridge";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

const workspaceRoot = app.isPackaged ? path.dirname(process.execPath) : process.cwd();
const useBuiltRenderer = app.isPackaged || process.env.AE_MANAGER_PROD === "1";
let mainWindow: BrowserWindow | null = null;
let store: DataStore;
let syncWatcher: FSWatcher | null = null;
let syncWatcherRootsKey = "";
let eagleAutoSyncTimer: ReturnType<typeof setInterval> | null = null;
let eagleLastKnownCount = -1;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    title: "AE Workbench",
    backgroundColor: "#fbfbfa",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false
    }
  });

  attachWindowDiagnostics(mainWindow);

  if (useBuiltRenderer) {
    await mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    await mainWindow.loadURL("http://127.0.0.1:5173");
  }

  mainWindow.center();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.setAlwaysOnTop(true);
  setTimeout(() => {
    mainWindow?.setAlwaysOnTop(false);
  }, 1200);

}

function attachWindowDiagnostics(window: BrowserWindow) {
  const logPath = path.join(workspaceRoot, "data", "runtime.log");
  const writeLog = (message: string) => {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    try {
      if (fs.existsSync(logPath) && fs.statSync(logPath).size > 512 * 1024) {
        fs.renameSync(logPath, `${logPath}.old`);
      }
    } catch { /* 轮转失败不影响主流程 */ }
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  };

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    writeLog(`console level=${level} ${message} at ${sourceId}:${line}`);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    writeLog(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
  });
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    writeLog(`did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL}`);
  });
  window.on("unresponsive", () => {
    writeLog("window-unresponsive");
  });
}

function installSecurityGuards() {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [buildContentSecurityPolicy()]
      }
    });
  });

  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, url) => {
      if (!isAllowedAppNavigation(url)) {
        event.preventDefault();
      }
    });

    contents.setWindowOpenHandler(() => ({ action: "deny" }));
  });
}

function buildContentSecurityPolicy() {
  const devSources = useBuiltRenderer ? "" : " http://127.0.0.1:5173 ws://127.0.0.1:5173";
  // dev 模式下 Vite React Fast Refresh preamble 是内联脚本，需要 unsafe-inline
  const devInline = useBuiltRenderer ? "" : " 'unsafe-inline'";
  return [
    "default-src 'self'",
    `script-src 'self'${devSources}${devInline}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' asset:${devSources}`,
    "img-src 'self' data: asset:",
    "media-src 'self' asset:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-src 'none'"
  ].join("; ");
}

function isAllowedAppNavigation(url: string) {
  try {
    const parsed = new URL(url);
    if (!useBuiltRenderer && parsed.origin === "http://127.0.0.1:5173") {
      return true;
    }
    return parsed.protocol === "file:";
  } catch {
    return false;
  }
}

function createAssetResponse(filePath: string, request: Request) {
  if (!fs.existsSync(filePath)) {
    return new Response("File not found", { status: 404 });
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    return new Response("Not a file", { status: 404 });
  }

  const contentType = getContentType(filePath);
  const range = request.headers.get("range");

  if (range) {
    const parsed = parseRange(range, stat.size);
    if (!parsed) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${stat.size}`
        }
      });
    }

    const stream = fs.createReadStream(filePath, { start: parsed.start, end: parsed.end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(parsed.end - parsed.start + 1),
        "Content-Range": `bytes ${parsed.start}-${parsed.end}/${stat.size}`,
        "Content-Type": contentType
      }
    });
  }

  const stream = fs.createReadStream(filePath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(stat.size),
      "Content-Type": contentType
    }
  });
}

function parseRange(range: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return null;

  const start = match[1] ? Number(match[1]) : 0;
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  const end = Math.min(requestedEnd, size - 1);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return null;
  }

  return { start, end };
}

function getContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4"
  };
  return types[ext] ?? "application/octet-stream";
}

app.whenReady().then(async () => {
  store = new DataStore(workspaceRoot);
  installSecurityGuards();

  protocol.handle("asset", (request) => {
    const url = new URL(request.url);
    const encoded = url.hostname === "local" ? url.pathname.slice(1) : "";
    const filePath = Buffer.from(decodeURIComponent(encoded), "base64url").toString("utf8");
    if (!isKnownAssetPath(filePath)) {
      return new Response("Access denied", { status: 403 });
    }
    return createAssetResponse(filePath, request);
  });

  registerIpc();
  await createWindow();
  setupSyncWatcher();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  store?.flushPendingSave();
  syncWatcher?.close().catch(() => undefined);
  if (eagleAutoSyncTimer) { clearInterval(eagleAutoSyncTimer); eagleAutoSyncTimer = null; }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});

function registerIpc() {
  ipcMain.handle("app:getInitialData", () => store.getInitialData());

  ipcMain.handle("app:openPath", async (_event, targetPath: unknown) => {
    assertString(targetPath, "targetPath");
    if (!isKnownOpenPath(targetPath)) {
      throw new Error("Path is outside managed folders");
    }
    if (!targetPath || !fs.existsSync(targetPath)) {
      throw new Error("Path not found");
    }
    await shell.openPath(targetPath);
    return true;
  });

  ipcMain.handle("projects:create", (_event, input) => store.createProject(validateCreateProjectInput(input)));

  ipcMain.handle("projects:update", (_event, input) => store.updateProject(validateUpdateProjectInput(input)));

  ipcMain.handle("projects:openFolder", async (_event, id: unknown) => {
    assertString(id, "project id");
    const project = store.markProjectOpened(id);
    await shell.openPath(project.rootPath);
    return project;
  });

  ipcMain.handle(
    "assets:import",
    async (_event, input?: unknown) => {
      const importInput = validateImportInput(input);
      const dialogOptions: OpenDialogOptions = {
        title: importInput?.destination === "project" ? "关联素材到当前项目（不复制文件）" : "关联本地素材或文件夹",
        properties: ["openFile", "openDirectory", "multiSelections"]
      };
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);

      if (result.canceled || result.filePaths.length === 0) {
        return [];
      }

      const imported = await store.importAssets(result.filePaths, importInput);
      setupSyncWatcher();
      return imported;
    }
  );

  ipcMain.handle("assets:open", async (_event, id: unknown) => {
    assertString(id, "asset id");
    const asset = store.getAssetById(id);
    if (!asset) throw new Error("Asset not found");
    await shell.openPath(asset.path);
    return true;
  });

  ipcMain.handle("assets:reveal", (_event, id: unknown) => {
    assertString(id, "asset id");
    const asset = store.getAssetById(id);
    if (!asset) throw new Error("Asset not found");
    shell.showItemInFolder(asset.path);
    return true;
  });

  ipcMain.handle("assets:unlink", (_event, id: unknown) => {
    assertString(id, "asset id");
    return store.unlinkAsset(id);
  });

  ipcMain.handle("assets:rescan", () => {
    const synced = store.syncExistingRoots();
    setupSyncWatcher();
    return { addedCount: synced.length };
  });

  ipcMain.handle("assets:markMissing", () => store.markMissingAssets());

  ipcMain.handle("assets:pruneMissing", () => store.pruneMissingAssets());

  ipcMain.handle("folders:unlink", (_event, folderPath: unknown) => {
    assertString(folderPath, "folderPath");
    const result = store.unlinkWatchedFolder(folderPath);
    setupSyncWatcher();
    return result;
  });

  ipcMain.handle("eagle:checkConnection", () => checkEagleConnection());

  ipcMain.handle("eagle:selectLibrary", async () => {
    const dialogOptions: OpenDialogOptions = {
      title: "选择 Eagle .library 目录（只读同步）",
      properties: ["openDirectory"]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return store.setEagleLibrary({ libraryPath: result.filePaths[0] });
  });

  ipcMain.handle("eagle:sync", async (_event, input?: unknown) => {
    const syncInput = validateEagleSyncInput(input);
    const source = store.getEagleSource(syncInput?.sourceId);
    const payload = await buildEagleSyncPayload({ source });
    return store.applyEagleSync(payload);
  });

  ipcMain.handle("eagle:unlinkSource", (_event, sourceId: unknown) => {
    assertString(sourceId, "sourceId");
    return store.unlinkEagleSource(sourceId);
  });

  ipcMain.handle("assets:relink", (_event, input: unknown) => {
    if (!isPlainRecord(input)) throw new Error("Invalid input");
    assertString(input.id, "id");
    assertString(input.newPath, "newPath");
    return store.relinkAsset(input.id, input.newPath);
  });

  ipcMain.handle("assets:findDuplicates", () => store.findDuplicates());

  ipcMain.handle("assets:batchUnlink", (_event, ids: unknown) => {
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) throw new Error("ids must be string[]");
    return store.batchUnlink(ids as string[]);
  });

  ipcMain.handle("assets:batchTag", (_event, input: unknown) => {
    if (!isPlainRecord(input)) throw new Error("Invalid input");
    const { ids, tag } = input;
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) throw new Error("ids must be string[]");
    assertString(tag, "tag");
    return store.batchAddTag(ids as string[], tag);
  });

  ipcMain.handle("projects:exportCsv", async (_event, projectId: unknown) => {
    assertString(projectId, "projectId");
    const csv = store.exportProjectCsv(projectId);
    const saveResult = mainWindow
      ? await dialog.showSaveDialog(mainWindow, { title: "导出素材清单", defaultPath: "assets.csv", filters: [{ name: "CSV", extensions: ["csv"] }] })
      : await dialog.showSaveDialog({ title: "导出素材清单", defaultPath: "assets.csv", filters: [{ name: "CSV", extensions: ["csv"] }] });
    if (saveResult.canceled || !saveResult.filePath) return false;
    fs.writeFileSync(saveResult.filePath, "﻿" + csv, "utf8");
    return true;
  });

  ipcMain.handle("eagle:setAutoSync", (_event, enabled: unknown) => {
    setupEagleAutoSync(Boolean(enabled));
    return Boolean(enabled);
  });
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 2048) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateCreateProjectInput(input: unknown) {
  if (!isPlainRecord(input)) throw new Error("Invalid project input");
  assertString(input.name, "project name");
  return {
    name: input.name,
    status: isProjectStatus(input.status) ? input.status : undefined,
    deadline: typeof input.deadline === "string" ? input.deadline : undefined
  };
}

function validateUpdateProjectInput(input: unknown) {
  if (!isPlainRecord(input)) throw new Error("Invalid project update input");
  assertString(input.id, "project id");
  const patch = isPlainRecord(input.patch) ? input.patch : {};
  const nextPatch: Record<string, unknown> = {};
  if (typeof patch.name === "string") nextPatch.name = patch.name;
  if (isProjectStatus(patch.status)) nextPatch.status = patch.status;
  if (typeof patch.deadline === "string" || patch.deadline === undefined) nextPatch.deadline = patch.deadline;
  if (typeof patch.coverAssetId === "string" || patch.coverAssetId === undefined) nextPatch.coverAssetId = patch.coverAssetId;
  if (typeof patch.notes === "string" || patch.notes === undefined) nextPatch.notes = patch.notes;
  return { id: input.id, patch: nextPatch };
}

function validateImportInput(input: unknown) {
  if (input === undefined) return undefined;
  if (!isPlainRecord(input)) throw new Error("Invalid import input");
  const destination = input.destination as ImportDestination | undefined;
  if (destination !== undefined && destination !== "linked" && destination !== "library" && destination !== "project") {
    throw new Error("Invalid import destination");
  }
  return {
    destination,
    projectId: typeof input.projectId === "string" ? input.projectId : undefined,
    usageType: typeof input.usageType === "string" ? input.usageType : undefined
  };
}

function validateEagleSyncInput(input: unknown) {
  if (input === undefined) return undefined;
  if (!isPlainRecord(input)) throw new Error("Invalid Eagle sync input");
  return { sourceId: typeof input.sourceId === "string" ? input.sourceId : undefined };
}

function isProjectStatus(value: unknown): value is "active" | "paused" | "finished" | "archived" {
  return value === "active" || value === "paused" || value === "finished" || value === "archived";
}

function isKnownOpenPath(targetPath: string) {
  const stat = getExistingStat(targetPath);
  if (!stat) return false;
  return isInsideAnyKnownRoot(stat.isDirectory() ? targetPath : path.dirname(targetPath));
}

function getExistingStat(filePath: string): import("fs").Stats | null {
  try { return fs.statSync(filePath); } catch { return null; }
}

function isInsideAnyKnownRoot(dir: string): boolean {
  return store.getWatchedRoots().some(root => dir === root || dir.startsWith(root + path.sep));
}

function isKnownAssetPath(filePath: string): boolean {
  return store.hasAssetPath(filePath);
}

function setupSyncWatcher() {
  const roots = store.getWatchedRoots();
  const nextKey = roots.join("\u0000");
  if (nextKey === syncWatcherRootsKey && syncWatcher) return;
  syncWatcherRootsKey = nextKey;
  syncWatcher?.close().catch(() => undefined);
  syncWatcher = watch(roots, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1200, pollInterval: 150 },
    ignored: (filePath) =>
      path.extname(filePath).toLowerCase() === ".json" ||
      filePath.includes(`${path.sep}node_modules${path.sep}`) ||
      filePath.includes(`${path.sep}data${path.sep}`) ||
      filePath.includes(`${path.sep}Cache${path.sep}`)
  });

  syncWatcher.on("add", (filePath) => {
    const asset = store.syncFile(filePath);
    if (asset) {
      notifySyncChanged("file-added", filePath);
    }
  });

  syncWatcher.on("unlink", (filePath) => {
    if (store.untrackFile(filePath)) {
      notifySyncChanged("file-removed", filePath);
    }
  });
}

function notifySyncChanged(reason: "file-added" | "file-removed", filePath: string) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("sync:changed", { reason, path: filePath, at: new Date().toISOString() });
  }
}

function setupEagleAutoSync(enabled: boolean) {
  if (eagleAutoSyncTimer) { clearInterval(eagleAutoSyncTimer); eagleAutoSyncTimer = null; }
  eagleLastKnownCount = -1;
  if (!enabled) return;
  eagleAutoSyncTimer = setInterval(() => { runEagleAutoSync().catch(() => undefined); }, 30_000);
}

async function runEagleAutoSync() {
  try {
    const conn = await checkEagleConnection();
    if (!conn.connected || !conn.apiBaseUrl) return;
    const url = new URL("/api/item/list", conn.apiBaseUrl);
    url.searchParams.set("limit", "1");
    url.searchParams.set("offset", "0");
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return;
    const body = await resp.json() as Record<string, unknown>;
    const data = (body?.data ?? body) as Record<string, unknown>;
    const total = typeof data?.total === "number" ? data.total : -1;
    if (total < 0) return;
    if (eagleLastKnownCount === -1) { eagleLastKnownCount = total; return; }
    if (total === eagleLastKnownCount) return;
    eagleLastKnownCount = total;
    const source = store.getEagleSource();
    const payload = await buildEagleSyncPayload({ source });
    const result = store.applyEagleSync(payload);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("eagle:autoSynced", { addedCount: result.run.addedCount, updatedCount: result.run.updatedCount });
    }
  } catch { /* ignore */ }
}
