import type { Asset, EagleConnectionStatus, EagleSource, EagleSyncRun, InitialData, Project, ProjectStatus } from "./types";

declare global {
  interface Window {
    aeManager: {
      getInitialData: () => Promise<InitialData>;
      openPath: (targetPath: string) => Promise<boolean>;
      createProject: (input: { name: string; status?: ProjectStatus; deadline?: string }) => Promise<Project>;
      updateProject: (input: { id: string; patch: Record<string, unknown> }) => Promise<Project>;
      openProjectFolder: (id: string) => Promise<Project>;
      importAssets: (input?: { destination?: "linked" | "library" | "project"; projectId?: string; usageType?: string }) => Promise<unknown[]>;
      openAsset: (id: string) => Promise<boolean>;
      revealAsset: (id: string) => Promise<boolean>;
      unlinkAsset: (id: string) => Promise<Asset>;
      rescanAssets: () => Promise<{ addedCount: number }>;
      markMissingAssets: () => Promise<{ markedCount: number; restoredCount: number; brokenCount: number }>;
      pruneMissingAssets: () => Promise<{ removedAssets: number; removedProjectLinks: number }>;
      unlinkWatchedFolder: (folderPath: string) => Promise<{ folderPath: string; removedCount: number }>;
      checkEagleConnection: () => Promise<EagleConnectionStatus>;
      selectEagleLibrary: () => Promise<EagleSource | null>;
      syncEagleLibrary: (input?: { sourceId?: string }) => Promise<{ source: EagleSource; run: EagleSyncRun }>;
      unlinkEagleSource: (sourceId: string) => Promise<{ source: EagleSource; removedCount: number }>;
      relinkAsset: (id: string, newPath: string) => Promise<Asset>;
      findDuplicates: () => Promise<Asset[][]>;
      batchUnlink: (ids: string[]) => Promise<{ removedCount: number }>;
      batchAddTag: (ids: string[], tag: string) => Promise<{ updatedCount: number }>;
      exportProjectCsv: (projectId: string) => Promise<boolean>;
      setEagleAutoSync: (enabled: boolean) => Promise<boolean>;
      assetUrl: (filePath: string) => string;
      onSyncChanged: (
        callback: (payload: { reason: "file-added" | "file-removed"; path: string; at: string }) => void
      ) => () => void;
      onEagleAutoSynced: (
        callback: (payload: { addedCount: number; updatedCount: number }) => void
      ) => () => void;
    };
  }
}

export {};
