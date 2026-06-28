export type ProjectStatus = "active" | "paused" | "finished" | "archived";

export type AssetType =
  | "character"
  | "image"
  | "video"
  | "audio"
  | "reference"
  | "ae"
  | "psd"
  | "template"
  | "misc";

export type AssetSource = "local" | "eagle";

export type AssetSourceStatus = "active" | "missing" | "unavailable" | "broken";

export type EagleSyncStatus = "success" | "partial" | "failed";

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  rootPath: string;
  coverAssetId?: string;
  notes?: string;
  deadline?: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  archivedAt?: string;
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  path: string;
  source?: AssetSource;
  sourcePath?: string;
  thumbnailPath?: string;
  width?: number;
  height?: number;
  duration?: number;
  externalId?: string;
  externalLibraryId?: string;
  externalLibraryName?: string;
  externalPath?: string;
  eagleFolderIds?: string[];
  eagleFolderNames?: string[];
  tags?: string[];
  rating?: number;
  annotation?: string;
  url?: string;
  eagleCreatedAt?: string;
  eagleUpdatedAt?: string;
  eagleImportedAt?: string;
  sourceStatus?: AssetSourceStatus;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  fileModifiedAt: string;
}

export interface EagleSource {
  id: string;
  name: string;
  libraryPath?: string;
  libraryId?: string;
  apiBaseUrl?: string;
  enabled: boolean;
  assetCount: number;
  folderCount: number;
  tagCount: number;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  lastSyncStatus?: EagleSyncStatus;
  lastSyncMessage?: string;
}

export interface EagleFolder {
  id: string;
  sourceId: string;
  eagleId: string;
  name: string;
  path?: string;
  parentId?: string;
  assetCount: number;
  updatedAt: string;
}

export interface EagleTag {
  id: string;
  sourceId: string;
  name: string;
  assetCount: number;
  updatedAt: string;
}

export interface EagleSyncRun {
  id: string;
  sourceId?: string;
  startedAt: string;
  finishedAt: string;
  status: EagleSyncStatus;
  message: string;
  totalCount: number;
  addedCount: number;
  updatedCount: number;
  missingCount: number;
  folderCount: number;
  tagCount: number;
}

export interface EagleConnectionStatus {
  connected: boolean;
  apiBaseUrl?: string;
  applicationName?: string;
  libraryPath?: string;
  libraryName?: string;
  message: string;
}

export interface EagleSyncAssetInput {
  externalId: string;
  name: string;
  type?: AssetType;
  path: string;
  thumbnailPath?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  duration?: number;
  folderIds?: string[];
  folderNames?: string[];
  tags?: string[];
  rating?: number;
  annotation?: string;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
  importedAt?: string;
  rawMetadata?: Record<string, unknown>;
}

export interface EagleSyncPayload {
  source: {
    id?: string;
    name: string;
    libraryPath?: string;
    libraryId?: string;
    apiBaseUrl?: string;
  };
  assets: EagleSyncAssetInput[];
  folders: Array<Omit<EagleFolder, "id" | "sourceId" | "updatedAt">>;
  tags: Array<Omit<EagleTag, "id" | "sourceId" | "updatedAt">>;
  warnings: string[];
}

export interface DailyAssetStats {
  id: string;
  date: string;
  totalCount: number;
  imageCount: number;
  videoCount: number;
  audioCount: number;
  characterCount: number;
  referenceCount: number;
  aeCount: number;
  /** psd + template + misc 等未单独成桶的类型，用于保证 totalCount 守恒 */
  otherCount: number;
  totalSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAsset {
  projectId: string;
  assetId: string;
  usageType: string;
  createdAt: string;
}

export interface AppData {
  projects: Project[];
  assets: Asset[];
  dailyAssetStats: DailyAssetStats[];
  projectAssets: ProjectAsset[];
  watchedFolders: string[];
  ignoredAssetPaths: string[];
  eagleSources: EagleSource[];
  eagleFolders: EagleFolder[];
  eagleTags: EagleTag[];
  eagleSyncRuns: EagleSyncRun[];
}

export interface InitialData extends AppData {
  workspaceRoot: string;
  libraryRoot: string;
  projectsRoot: string;
  cacheRoot: string;
}
