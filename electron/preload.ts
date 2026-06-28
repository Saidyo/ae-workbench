import { contextBridge, ipcRenderer } from "electron";

const api = {
  getInitialData: () => ipcRenderer.invoke("app:getInitialData"),
  openPath: (targetPath: string) => ipcRenderer.invoke("app:openPath", targetPath),
  createProject: (input: { name: string; status?: string; deadline?: string }) =>
    ipcRenderer.invoke("projects:create", input),
  updateProject: (input: { id: string; patch: Record<string, unknown> }) =>
    ipcRenderer.invoke("projects:update", input),
  openProjectFolder: (id: string) => ipcRenderer.invoke("projects:openFolder", id),
  importAssets: (input?: { destination?: "linked" | "library" | "project"; projectId?: string; usageType?: string }) =>
    ipcRenderer.invoke("assets:import", input),
  openAsset: (id: string) => ipcRenderer.invoke("assets:open", id),
  revealAsset: (id: string) => ipcRenderer.invoke("assets:reveal", id),
  unlinkAsset: (id: string) => ipcRenderer.invoke("assets:unlink", id),
  rescanAssets: () => ipcRenderer.invoke("assets:rescan"),
  markMissingAssets: () => ipcRenderer.invoke("assets:markMissing"),
  pruneMissingAssets: () => ipcRenderer.invoke("assets:pruneMissing"),
  unlinkWatchedFolder: (folderPath: string) => ipcRenderer.invoke("folders:unlink", folderPath),
  checkEagleConnection: () => ipcRenderer.invoke("eagle:checkConnection"),
  selectEagleLibrary: () => ipcRenderer.invoke("eagle:selectLibrary"),
  syncEagleLibrary: (input?: { sourceId?: string }) => ipcRenderer.invoke("eagle:sync", input),
  unlinkEagleSource: (sourceId: string) => ipcRenderer.invoke("eagle:unlinkSource", sourceId),
  relinkAsset: (id: string, newPath: string) => ipcRenderer.invoke("assets:relink", { id, newPath }),
  findDuplicates: () => ipcRenderer.invoke("assets:findDuplicates"),
  batchUnlink: (ids: string[]) => ipcRenderer.invoke("assets:batchUnlink", ids),
  batchAddTag: (ids: string[], tag: string) => ipcRenderer.invoke("assets:batchTag", { ids, tag }),
  exportProjectCsv: (projectId: string) => ipcRenderer.invoke("projects:exportCsv", projectId),
  setEagleAutoSync: (enabled: boolean) => ipcRenderer.invoke("eagle:setAutoSync", enabled),
  assetUrl: (filePath: string) => toFileUrl(filePath),
  onSyncChanged: (callback: (payload: { reason: "file-added" | "file-removed"; path: string; at: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { reason: "file-added" | "file-removed"; path: string; at: string }) =>
      callback(payload);
    ipcRenderer.on("sync:changed", listener);
    return () => ipcRenderer.removeListener("sync:changed", listener);
  },
  onEagleAutoSynced: (callback: (payload: { addedCount: number; updatedCount: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { addedCount: number; updatedCount: number }) => callback(payload);
    ipcRenderer.on("eagle:autoSynced", listener);
    return () => ipcRenderer.removeListener("eagle:autoSynced", listener);
  }
};

contextBridge.exposeInMainWorld("aeManager", api);

export type AeManagerApi = typeof api;

function toFileUrl(filePath: string) {
  const encodedPath = encodeBase64Url(filePath);
  return `asset://local/${encodedPath}`;
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
