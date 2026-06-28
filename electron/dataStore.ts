import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AppData,
  Asset,
  AssetSourceStatus,
  AssetType,
  DailyAssetStats,
  EagleConnectionStatus,
  EagleSource,
  EagleSyncPayload,
  EagleSyncRun,
  InitialData,
  Project,
  ProjectStatus
} from "./types";

export type ImportDestination = "linked" | "library" | "project";

const folderTemplate = [
  "01_AEP",
  "02_Footage",
  "03_Images",
  "04_Audio",
  "05_References",
  "06_Renders",
  "07_Delivery",
  "99_Archive"
];

const defaultData: AppData = {
  projects: [],
  assets: [],
  dailyAssetStats: [],
  projectAssets: [],
  watchedFolders: [],
  ignoredAssetPaths: [],
  eagleSources: [],
  eagleFolders: [],
  eagleTags: [],
  eagleSyncRuns: []
};

const typeFolders: Record<AssetType, string> = {
  character: "Characters",
  image: "Images",
  video: "Videos",
  audio: "Audio",
  reference: "References",
  ae: "AE",
  psd: "PSD",
  template: "Templates",
  misc: "Misc"
};

const projectTypeFolders: Record<AssetType, string> = {
  character: "03_Images",
  image: "03_Images",
  video: "02_Footage",
  audio: "04_Audio",
  reference: "05_References",
  ae: "01_AEP",
  psd: "03_Images",
  template: "01_AEP",
  misc: "02_Footage"
};

const libraryFolderTypes = new Map<string, AssetType>(
  Object.entries(typeFolders).map(([type, folder]) => [folder.toLowerCase(), type as AssetType])
);

const projectFolderTypes = new Map<string, AssetType>([
  ["01_aep", "ae"],
  ["02_footage", "video"],
  ["03_images", "image"],
  ["04_audio", "audio"],
  ["05_references", "reference"],
  ["06_renders", "video"],
  ["07_delivery", "video"]
]);

const imageExts = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".svg"]);
const videoExts = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"]);
const audioExts = new Set([".mp3", ".wav", ".aac", ".flac", ".ogg", ".m4a"]);
const aeExts = new Set([".aep", ".aepx"]);
const psdExts = new Set([".psd", ".psb"]);
const templateExts = new Set([".ffx", ".mogrt"]);

export class DataStore {
  readonly workspaceRoot: string;
  readonly dataRoot: string;
  readonly libraryRoot: string;
  readonly projectsRoot: string;
  readonly cacheRoot: string;

  private readonly dataPath: string;
  private data: AppData = structuredClone(defaultData);
  private assetById = new Map<string, Asset>();
  private assetByPath = new Map<string, Asset>();
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.dataRoot = path.join(workspaceRoot, "data");
    this.libraryRoot = path.join(workspaceRoot, "Library");
    this.projectsRoot = path.join(workspaceRoot, "Projects");
    this.cacheRoot = path.join(workspaceRoot, "Cache");
    this.dataPath = path.join(this.dataRoot, "app-data.json");

    this.ensureBaseFolders();
    this.load();
  }

  getInitialData(): InitialData {
    this.enrichPreviewMetadata();
    return {
      ...this.data,
      workspaceRoot: this.workspaceRoot,
      libraryRoot: this.libraryRoot,
      projectsRoot: this.projectsRoot,
      cacheRoot: this.cacheRoot
    };
  }

  getWatchedRoots() {
    return [this.libraryRoot, this.projectsRoot, ...this.data.watchedFolders];
  }

  getAssetById(id: string): Asset | undefined {
    return this.assetById.get(id);
  }

  hasAssetPath(filePath: string): boolean {
    const n = normalizePath(filePath);
    for (const asset of this.data.assets) {
      if (normalizePath(asset.path) === n) return true;
      if (asset.thumbnailPath && normalizePath(asset.thumbnailPath) === n) return true;
    }
    return false;
  }

  getKnownRoots(): { workspaceRoot: string; libraryRoot: string; projectsRoot: string; cacheRoot: string; watchedFolders: string[]; eagleLibraryPaths: string[] } {
    return {
      workspaceRoot: this.workspaceRoot,
      libraryRoot: this.libraryRoot,
      projectsRoot: this.projectsRoot,
      cacheRoot: this.cacheRoot,
      watchedFolders: [...this.data.watchedFolders],
      eagleLibraryPaths: this.data.eagleSources.map((s) => s.libraryPath).filter((p): p is string => Boolean(p))
    };
  }

  private rebuildIndex() {
    this.assetById = new Map(this.data.assets.map((a) => [a.id, a]));
    this.assetByPath = new Map(this.data.assets.map((a) => [normalizePath(a.path), a]));
  }

  private scheduleSave() {
    if (this.saveDebounceTimer !== null) clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = setTimeout(() => { this.saveDebounceTimer = null; this.save(); }, 400);
  }

  flushPendingSave() {
    if (this.saveDebounceTimer === null) return;
    clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = null;
    this.save();
  }

  relinkAsset(id: string, newPath: string): Asset {
    const asset = this.assetById.get(id);
    if (!asset) throw new Error("Asset not found");
    if (!fs.existsSync(newPath) || !fs.statSync(newPath).isFile()) throw new Error("文件不存在: " + newPath);
    const stat = fs.statSync(newPath);
    asset.path = newPath;
    asset.sourceStatus = "active";
    asset.fileSize = stat.size;
    asset.fileModifiedAt = stat.mtime.toISOString();
    asset.updatedAt = new Date().toISOString();
    this.save();
    return asset;
  }

  findDuplicates(): Asset[][] {
    const groups = new Map<string, Asset[]>();
    for (const asset of this.data.assets) {
      const key = path.basename(asset.path).toLowerCase() + "|" + asset.fileSize;
      const group = groups.get(key) ?? [];
      group.push(asset);
      groups.set(key, group);
    }
    return Array.from(groups.values()).filter((g) => g.length > 1);
  }

  batchUnlink(ids: string[]): { removedCount: number } {
    const idSet = new Set(ids);
    const removed = this.data.assets.filter((a) => idSet.has(a.id));
    this.data.assets = this.data.assets.filter((a) => !idSet.has(a.id));
    this.data.projectAssets = this.data.projectAssets.filter((item) => !idSet.has(item.assetId));
    for (const asset of removed) {
      this.data.ignoredAssetPaths = Array.from(new Set([...this.data.ignoredAssetPaths, normalizePath(asset.path)]));
    }
    this.save();
    return { removedCount: removed.length };
  }

  batchAddTag(ids: string[], tag: string): { updatedCount: number } {
    const trimmed = tag.trim();
    if (!trimmed) return { updatedCount: 0 };
    let count = 0;
    for (const id of ids) {
      const asset = this.assetById.get(id);
      if (!asset) continue;
      if (!asset.tags) asset.tags = [];
      if (!asset.tags.includes(trimmed)) { asset.tags = [...asset.tags, trimmed]; count++; }
      asset.updatedAt = new Date().toISOString();
    }
    if (count > 0) this.save();
    return { updatedCount: count };
  }

  exportProjectCsv(projectId: string): string {
    const project = this.data.projects.find((p) => p.id === projectId);
    if (!project) throw new Error("Project not found");
    const assetIds = new Set(this.data.projectAssets.filter((pa) => pa.projectId === projectId).map((pa) => pa.assetId));
    const assets = this.data.assets.filter((a) => assetIds.has(a.id));
    const rows = [["名称", "类型", "路径", "来源", "大小(字节)", "入库时间", "标签"].join(",")];
    for (const asset of assets) {
      rows.push([
        csvEscape(asset.name), asset.type, csvEscape(asset.path),
        asset.source ?? "local", String(asset.fileSize),
        asset.createdAt.slice(0, 10), csvEscape((asset.tags ?? []).join(";"))
      ].join(","));
    }
    return rows.join("\r\n");
  }

  getEagleSource(sourceId?: string): EagleSource | undefined {
    if (sourceId) {
      return this.data.eagleSources.find((source) => source.id === sourceId);
    }
    return this.data.eagleSources.find((source) => source.enabled) ?? this.data.eagleSources[0];
  }

  setEagleLibrary(input: { libraryPath: string; name?: string; apiBaseUrl?: string }): EagleSource {
    const libraryPath = path.resolve(input.libraryPath);
    if (!fs.existsSync(libraryPath) || !fs.statSync(libraryPath).isDirectory()) {
      throw new Error("Eagle library folder not found");
    }

    const now = new Date().toISOString();
    const existing = this.data.eagleSources.find(
      (source) => source.libraryPath && normalizePath(source.libraryPath) === normalizePath(libraryPath)
    );
    const name = input.name?.trim() || path.basename(libraryPath).replace(/\.library$/i, "") || "Eagle Library";

    if (existing) {
      existing.name = name;
      existing.libraryPath = libraryPath;
      existing.apiBaseUrl = input.apiBaseUrl ?? existing.apiBaseUrl;
      existing.enabled = true;
      existing.updatedAt = now;
      this.save();
      return existing;
    }

    const source: EagleSource = {
      id: randomUUID(),
      name,
      libraryPath,
      libraryId: normalizePath(libraryPath),
      apiBaseUrl: input.apiBaseUrl,
      enabled: true,
      assetCount: 0,
      folderCount: 0,
      tagCount: 0,
      createdAt: now,
      updatedAt: now
    };

    this.data.eagleSources.unshift(source);
    this.save();
    return source;
  }

  unlinkEagleSource(sourceId: string): { source: EagleSource; removedCount: number } {
    const source = this.data.eagleSources.find((item) => item.id === sourceId);
    if (!source) {
      throw new Error("Eagle source not found");
    }

    const removedAssetIds = new Set(
      this.data.assets
        .filter((asset) => asset.source === "eagle" && asset.externalLibraryId === source.id)
        .map((asset) => asset.id)
    );

    this.data.assets = this.data.assets.filter((asset) => !removedAssetIds.has(asset.id));
    this.data.projectAssets = this.data.projectAssets.filter((item) => !removedAssetIds.has(item.assetId));
    this.data.eagleSources = this.data.eagleSources.filter((item) => item.id !== source.id);
    this.data.eagleFolders = this.data.eagleFolders.filter((item) => item.sourceId !== source.id);
    this.data.eagleTags = this.data.eagleTags.filter((item) => item.sourceId !== source.id);
    this.save();

    return { source, removedCount: removedAssetIds.size };
  }

  applyEagleSync(payload: EagleSyncPayload): { source: EagleSource; run: EagleSyncRun } {
    const startedAt = new Date().toISOString();
    const now = startedAt;
    const source = this.upsertEagleSource(payload, now);
    const folderNameById = new Map(payload.folders.map((folder) => [folder.eagleId, folder.path || folder.name]));
    const seenExternalIds = new Set<string>();
    const addedAssets: Asset[] = [];
    let updatedCount = 0;
    let skippedCount = 0;

    for (const input of payload.assets) {
      if (!input.externalId || !input.path || shouldIgnoreAssetFile(input.path) || this.shouldIgnorePath(input.path)) {
        skippedCount += 1;
        continue;
      }

      const normalizedPath = normalizePath(input.path);
      const existing =
        this.data.assets.find(
          (asset) =>
            asset.source === "eagle" &&
            asset.externalLibraryId === source.id &&
            asset.externalId === input.externalId
        ) ?? this.data.assets.find((asset) => normalizePath(asset.path) === normalizedPath);
      const stat = getFileStat(input.path);
      const sourceStatus: AssetSourceStatus = stat ? "active" : "missing";
      const folderNames = uniqueStrings([...(input.folderNames ?? []), ...(input.folderIds ?? []).map((id) => folderNameById.get(id) ?? id)]);
      const tags = uniqueStrings(input.tags ?? []);
      const updatedAt = input.updatedAt ?? stat?.mtime.toISOString() ?? now;
      const fileModifiedAt = stat?.mtime.toISOString() ?? input.updatedAt ?? now;
      const assetPatch: Partial<Asset> = {
        name: input.name || path.basename(input.path),
        type: input.type ?? detectAssetType(input.path),
        path: input.path,
        source: "eagle",
        thumbnailPath: input.thumbnailPath,
        width: input.width,
        height: input.height,
        duration: input.duration,
        externalId: input.externalId,
        externalLibraryId: source.id,
        externalLibraryName: source.name,
        externalPath: input.path,
        eagleFolderIds: uniqueStrings(input.folderIds ?? []),
        eagleFolderNames: folderNames,
        tags,
        rating: input.rating,
        annotation: input.annotation,
        url: input.url,
        eagleCreatedAt: input.createdAt,
        eagleUpdatedAt: input.updatedAt,
        eagleImportedAt: input.importedAt,
        sourceStatus,
        fileSize: stat?.size ?? input.fileSize ?? 0,
        updatedAt,
        fileModifiedAt
      };

      seenExternalIds.add(input.externalId);

      if (existing) {
        Object.assign(existing, assetPatch);
        if (!existing.createdAt) {
          existing.createdAt = input.importedAt ?? input.createdAt ?? now;
        }
        updatedCount += 1;
        continue;
      }

      const asset: Asset = {
        id: randomUUID(),
        name: assetPatch.name ?? path.basename(input.path),
        type: assetPatch.type ?? "misc",
        path: input.path,
        source: "eagle",
        thumbnailPath: input.thumbnailPath,
        width: input.width,
        height: input.height,
        duration: input.duration,
        externalId: input.externalId,
        externalLibraryId: source.id,
        externalLibraryName: source.name,
        externalPath: input.path,
        eagleFolderIds: uniqueStrings(input.folderIds ?? []),
        eagleFolderNames: folderNames,
        tags,
        rating: input.rating,
        annotation: input.annotation,
        url: input.url,
        eagleCreatedAt: input.createdAt,
        eagleUpdatedAt: input.updatedAt,
        eagleImportedAt: input.importedAt,
        sourceStatus,
        fileSize: stat?.size ?? input.fileSize ?? 0,
        createdAt: input.importedAt ?? input.createdAt ?? now,
        updatedAt,
        fileModifiedAt
      };

      this.data.assets.unshift(asset);
      addedAssets.push(asset);
    }

    let missingCount = 0;
    for (const asset of this.data.assets) {
      if (asset.source !== "eagle" || asset.externalLibraryId !== source.id || !asset.externalId) continue;
      if (!seenExternalIds.has(asset.externalId)) {
        asset.sourceStatus = "unavailable";
        asset.updatedAt = now;
        missingCount += 1;
      }
    }

    this.data.eagleFolders = [
      ...this.data.eagleFolders.filter((folder) => folder.sourceId !== source.id),
      ...payload.folders.map((folder) => ({
        ...folder,
        id: `${source.id}:${folder.eagleId}`,
        sourceId: source.id,
        updatedAt: now
      }))
    ];
    this.data.eagleTags = [
      ...this.data.eagleTags.filter((tag) => tag.sourceId !== source.id),
      ...payload.tags.map((tag) => ({
        ...tag,
        id: `${source.id}:${tag.name}`,
        sourceId: source.id,
        updatedAt: now
      }))
    ];

    source.assetCount = this.data.assets.filter((asset) => asset.source === "eagle" && asset.externalLibraryId === source.id).length;
    source.folderCount = payload.folders.length;
    source.tagCount = payload.tags.length;
    const syncStatus = payload.warnings.length > 0 || skippedCount > 0 ? "partial" : "success";
    source.lastSyncAt = now;
    source.lastSyncStatus = syncStatus;
    source.lastSyncMessage =
      payload.warnings[0] ??
      (skippedCount > 0 ? `已跳过 ${skippedCount} 个缺少路径或被屏蔽的 Eagle 项` : `已同步 ${payload.assets.length} 个 Eagle 素材`);
    source.updatedAt = now;

    const run: EagleSyncRun = {
      id: randomUUID(),
      sourceId: source.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: syncStatus,
      message: source.lastSyncMessage,
      totalCount: payload.assets.length,
      addedCount: addedAssets.length,
      updatedCount,
      missingCount,
      folderCount: payload.folders.length,
      tagCount: payload.tags.length
    };

    this.data.eagleSyncRuns = [run, ...this.data.eagleSyncRuns].slice(0, 50);
    if (addedAssets.length > 0) {
      this.updateDailyStats(addedAssets, now);
    }
    this.repairDailyStatsTotals();
    this.save();
    return { source, run };
  }

  unlinkAsset(id: string): Asset {
    const asset = this.data.assets.find((item) => item.id === id);
    if (!asset) {
      throw new Error("Asset not found");
    }

    this.data.assets = this.data.assets.filter((item) => item.id !== id);
    this.data.projectAssets = this.data.projectAssets.filter((item) => item.assetId !== id);
    this.data.ignoredAssetPaths = Array.from(new Set([...this.data.ignoredAssetPaths, normalizePath(asset.path)]));
    this.save();
    return asset;
  }

  unlinkWatchedFolder(folderPath: string): { folderPath: string; removedCount: number } {
    const normalizedFolder = normalizePath(folderPath);
    const watchedFolder = this.data.watchedFolders.find((item) => normalizePath(item) === normalizedFolder);
    if (!watchedFolder) {
      throw new Error("Watched folder not found");
    }

    const removedAssetIds = new Set(
      this.data.assets
        .filter((asset) => isInsideNormalized(normalizePath(asset.path), normalizedFolder))
        .map((asset) => asset.id)
    );

    this.data.watchedFolders = this.data.watchedFolders.filter((item) => normalizePath(item) !== normalizedFolder);
    this.data.assets = this.data.assets.filter((asset) => !removedAssetIds.has(asset.id));
    this.data.projectAssets = this.data.projectAssets.filter((item) => !removedAssetIds.has(item.assetId));
    this.data.ignoredAssetPaths = this.data.ignoredAssetPaths.filter((item) => !isInsideNormalized(item, normalizedFolder));
    this.save();

    return { folderPath: watchedFolder, removedCount: removedAssetIds.size };
  }

  createProject(input: { name: string; status?: ProjectStatus; deadline?: string }): Project {
    const name = input.name.trim();
    if (!name) {
      throw new Error("Project name is required");
    }

    const now = new Date().toISOString();
    const folderName = this.uniqueFolderName(this.projectsRoot, sanitizeName(name));
    const rootPath = path.join(this.projectsRoot, folderName);
    fs.mkdirSync(rootPath, { recursive: true });
    for (const folder of folderTemplate) {
      fs.mkdirSync(path.join(rootPath, folder), { recursive: true });
    }

    const project: Project = {
      id: randomUUID(),
      name,
      status: input.status ?? "active",
      rootPath,
      deadline: input.deadline,
      createdAt: now,
      updatedAt: now
    };

    this.data.projects.unshift(project);
    this.save();
    return project;
  }

  updateProject(input: { id: string; patch: Partial<Pick<Project, "name" | "status" | "deadline" | "coverAssetId" | "notes">> }): Project {
    const project = this.data.projects.find((item) => item.id === input.id);
    if (!project) {
      throw new Error("Project not found");
    }

    Object.assign(project, input.patch, { updatedAt: new Date().toISOString() });
    if (project.status === "archived" && !project.archivedAt) {
      project.archivedAt = new Date().toISOString();
    }
    this.save();
    return project;
  }

  markProjectOpened(id: string): Project {
    const project = this.data.projects.find((item) => item.id === id);
    if (!project) {
      throw new Error("Project not found");
    }

    const now = new Date().toISOString();
    project.lastOpenedAt = now;
    project.updatedAt = now;
    this.save();
    return project;
  }

  async importAssets(
    pathsToImport: string[],
    options?: { destination?: ImportDestination; projectId?: string; usageType?: string }
  ): Promise<Asset[]> {
    const files = (await Promise.all(pathsToImport.map((itemPath) => this.expandFilesAsync(itemPath)))).flat();
    const newAssets: Asset[] = [];
    const now = new Date().toISOString();
    const destination = options?.destination ?? "linked";

    if (destination === "linked" || destination === "project") {
      this.addWatchedFolders(pathsToImport);
    }

    for (let index = 0; index < files.length; index += 1) {
      const filePath = files[index];
      if (!isRegularFile(filePath) || shouldIgnoreAssetFile(filePath)) continue;

      const type = detectAssetType(filePath);
      const shouldLinkInPlace = destination === "linked" || destination === "project";
      const targetFolder = path.join(this.libraryRoot, typeFolders[type]);

      const targetPath =
        shouldLinkInPlace
          ? filePath
          : isInside(filePath, targetFolder)
            ? filePath
            : this.uniqueFilePath(targetFolder, path.basename(filePath));

      if (!shouldLinkInPlace) {
        fs.mkdirSync(targetFolder, { recursive: true });
        if (!isSamePath(filePath, targetPath)) {
          await fs.promises.copyFile(filePath, targetPath);
        }
      }

      this.allowPathRegistration(targetPath);
      const asset = this.registerFile(targetPath, {
        countStats: true,
        now,
        sourcePath: isSamePath(filePath, targetPath) ? undefined : filePath,
        projectId: destination === "project" ? options?.projectId : undefined,
        usageType: options?.usageType ?? type,
        returnLinkedExisting: destination === "project"
      });

      if (asset) {
        newAssets.push(asset);
      }

      if (index > 0 && index % 25 === 0) {
        await waitForEventLoop();
      }
    }

    if (newAssets.length > 0) {
      this.save();
    }

    return newAssets;
  }

  syncExistingRoots(): Asset[] {
    const synced: Asset[] = [];
    for (const root of this.getWatchedRoots()) {
      for (const filePath of this.expandFiles(root)) {
        const asset = this.registerFile(filePath, { countStats: false });
        if (asset) synced.push(asset);
      }
    }
    if (synced.length > 0) this.save();
    return synced;
  }

  syncFile(filePath: string): Asset | null {
    const asset = this.registerFile(filePath, { countStats: true });
    if (asset) this.scheduleSave();
    return asset;
  }

  addWatchedFolders(pathsToWatch: string[]) {
    const next = new Set(this.data.watchedFolders.map((item) => path.resolve(item)));

    for (const itemPath of pathsToWatch) {
      if (!fs.existsSync(itemPath)) continue;
      const stat = fs.statSync(itemPath);
      const folder = stat.isDirectory() ? itemPath : path.dirname(itemPath);
      if (isInside(folder, this.workspaceRoot)) continue;
      next.add(path.resolve(folder));
    }

    const folders = Array.from(next).filter((folder) => fs.existsSync(folder));
    this.data.watchedFolders = pruneNestedFolders(folders);
    this.save();
  }

  untrackFile(filePath: string): boolean {
    const normalized = normalizePath(filePath);
    const asset = this.data.assets.find((item) => normalizePath(item.path) === normalized);
    if (!asset) return false;

    if (asset.source === "eagle") {
      asset.sourceStatus = "missing";
      asset.updatedAt = new Date().toISOString();
      this.scheduleSave();
      return true;
    }

    this.data.assets = this.data.assets.filter((item) => item.id !== asset.id);
    this.data.projectAssets = this.data.projectAssets.filter((item) => item.assetId !== asset.id);
    this.scheduleSave();
    return true;
  }

  pruneMissingAssets(): { removedAssets: number; removedProjectLinks: number } {
    const now = new Date().toISOString();
    this.refreshAssetSourceStatuses(now);

    const existingIds = new Set(
      this.data.assets
        .filter((asset) => asset.source === "eagle" || (asset.sourceStatus ?? "active") === "active")
        .map((asset) => asset.id)
    );
    const removedAssets = this.data.assets.length - existingIds.size;
    if (removedAssets === 0) {
      this.save();
      return { removedAssets: 0, removedProjectLinks: 0 };
    }

    const beforeLinks = this.data.projectAssets.length;
    this.data.assets = this.data.assets.filter((asset) => existingIds.has(asset.id));
    this.data.projectAssets = this.data.projectAssets.filter((item) => existingIds.has(item.assetId));
    const removedProjectLinks = beforeLinks - this.data.projectAssets.length;
    this.save();
    return { removedAssets, removedProjectLinks };
  }

  markMissingAssets(): { markedCount: number; restoredCount: number; brokenCount: number } {
    const result = this.refreshAssetSourceStatuses();
    if (result.changed) {
      this.save();
    } else {
      this.rebuildIndex();
    }

    return {
      markedCount: result.markedCount,
      restoredCount: result.restoredCount,
      brokenCount: this.data.assets.filter((asset) => isBrokenSourceStatus(asset.sourceStatus)).length
    };
  }

  private upsertEagleSource(payload: EagleSyncPayload, now: string): EagleSource {
    const payloadSourceId = payload.source.id;
    const normalizedPath = payload.source.libraryPath ? normalizePath(payload.source.libraryPath) : undefined;
    let source =
      (payloadSourceId ? this.data.eagleSources.find((item) => item.id === payloadSourceId) : undefined) ??
      (normalizedPath
        ? this.data.eagleSources.find((item) => item.libraryPath && normalizePath(item.libraryPath) === normalizedPath)
        : undefined);

    if (source) {
      source.name = payload.source.name || source.name;
      source.libraryPath = payload.source.libraryPath ?? source.libraryPath;
      source.libraryId = payload.source.libraryId ?? source.libraryId ?? (source.libraryPath ? normalizePath(source.libraryPath) : source.id);
      source.apiBaseUrl = payload.source.apiBaseUrl ?? source.apiBaseUrl;
      source.enabled = true;
      source.updatedAt = now;
      return source;
    }

    source = {
      id: payloadSourceId ?? randomUUID(),
      name: payload.source.name || "Eagle Library",
      libraryPath: payload.source.libraryPath,
      libraryId: payload.source.libraryId ?? normalizedPath,
      apiBaseUrl: payload.source.apiBaseUrl,
      enabled: true,
      assetCount: 0,
      folderCount: 0,
      tagCount: 0,
      createdAt: now,
      updatedAt: now
    };

    this.data.eagleSources.unshift(source);
    return source;
  }

  private registerFile(
    filePath: string,
    options?: {
      countStats?: boolean;
      now?: string;
      sourcePath?: string;
      projectId?: string;
      usageType?: string;
      returnLinkedExisting?: boolean;
    }
  ): Asset | null {
    if (!isRegularFile(filePath) || this.shouldIgnorePath(filePath)) return null;

    const normalized = normalizePath(filePath);
    const existing = this.data.assets.find((asset) => normalizePath(asset.path) === normalized);
    const project = options?.projectId ? this.data.projects.find((item) => item.id === options.projectId) : this.findProjectForPath(filePath);

    if (existing) {
      let linked = false;
      if (project) {
        const now = options?.now ?? new Date().toISOString();
        linked = this.linkAssetToProject(existing.id, project.id, options?.usageType ?? existing.type, now);
        if (linked) {
          project.updatedAt = now;
          this.save();
        }
      }
      return options?.returnLinkedExisting && linked ? existing : null;
    }

    const now = options?.now ?? new Date().toISOString();
    const stat = fs.statSync(filePath);
    const type = this.inferTypeFromPath(filePath);
    const asset: Asset = {
      id: randomUUID(),
      name: path.basename(filePath),
      type,
      path: filePath,
      source: "local",
      sourceStatus: "active",
      sourcePath: options?.sourcePath,
      thumbnailPath: findSiblingThumbnail(filePath),
      fileSize: stat.size,
      createdAt: now,
      updatedAt: now,
      fileModifiedAt: stat.mtime.toISOString()
    };

    this.data.assets.unshift(asset);

    if (project) {
      this.linkAssetToProject(asset.id, project.id, options?.usageType ?? type, now);
      project.updatedAt = now;
    }

    if (options?.countStats) {
      this.updateDailyStats([asset], now);
    }

    return asset;
  }

  private linkAssetToProject(assetId: string, projectId: string, usageType: string, now = new Date().toISOString()) {
    const exists = this.data.projectAssets.some((item) => item.assetId === assetId && item.projectId === projectId);
    if (!exists) {
      this.data.projectAssets.push({ assetId, projectId, usageType, createdAt: now });
      return true;
    }
    return false;
  }

  private getProjectTargetFolder(projectId: string, type: AssetType) {
    const project = this.data.projects.find((item) => item.id === projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    return path.join(project.rootPath, projectTypeFolders[type]);
  }

  private findProjectForPath(filePath: string): Project | undefined {
    const normalized = normalizePath(filePath);
    return this.data.projects.find((project) => isInsideNormalized(normalized, normalizePath(project.rootPath)));
  }

  private inferTypeFromPath(filePath: string): AssetType {
    const libraryRelative = getRelativeIfInside(filePath, this.libraryRoot);
    if (libraryRelative) {
      const topFolder = libraryRelative.split(path.sep)[0]?.toLowerCase();
      const type = libraryFolderTypes.get(topFolder);
      if (type) return type;
    }

    const project = this.findProjectForPath(filePath);
    if (project) {
      const projectRelative = path.relative(project.rootPath, filePath);
      const topFolder = projectRelative.split(path.sep)[0]?.toLowerCase();
      const type = projectFolderTypes.get(topFolder);
      if (type) {
        if (type === "image" || type === "video") {
          return detectAssetType(filePath);
        }
        return type;
      }
    }

    return detectAssetType(filePath);
  }

  private shouldIgnorePath(filePath: string) {
    const normalized = normalizePath(filePath);
    return (
      shouldIgnoreAssetFile(filePath) ||
      this.data.ignoredAssetPaths.some((ignoredPath) => normalized === ignoredPath) ||
      isInsideNormalized(normalized, normalizePath(this.dataRoot)) ||
      isInsideNormalized(normalized, normalizePath(this.cacheRoot)) ||
      normalized.includes(`${path.sep.toLowerCase()}node_modules${path.sep.toLowerCase()}`)
    );
  }

  private allowPathRegistration(filePath: string) {
    const normalized = normalizePath(filePath);
    const next = this.data.ignoredAssetPaths.filter((ignoredPath) => ignoredPath !== normalized);
    if (next.length !== this.data.ignoredAssetPaths.length) {
      this.data.ignoredAssetPaths = next;
    }
  }

  private ensureBaseFolders() {
    fs.mkdirSync(this.dataRoot, { recursive: true });
    fs.mkdirSync(this.libraryRoot, { recursive: true });
    fs.mkdirSync(this.projectsRoot, { recursive: true });
    fs.mkdirSync(this.cacheRoot, { recursive: true });

    for (const folder of Object.values(typeFolders)) {
      fs.mkdirSync(path.join(this.libraryRoot, folder), { recursive: true });
    }
  }

  private load() {
    const bak = `${this.dataPath}.bak`;

    const parse = (filePath: string): AppData | null => {
      try {
        const raw = fs.readFileSync(filePath, "utf8");
        return { ...structuredClone(defaultData), ...JSON.parse(raw) } as AppData;
      } catch {
        return null;
      }
    };

    let loaded: AppData | null = null;
    if (fs.existsSync(this.dataPath)) {
      loaded = parse(this.dataPath);
      if (!loaded && fs.existsSync(bak)) {
        loaded = parse(bak);
      }
    }

    this.data = loaded ?? structuredClone(defaultData);
    this.data.watchedFolders = this.data.watchedFolders ?? [];
    this.data.ignoredAssetPaths = this.data.ignoredAssetPaths ?? [];
    this.data.eagleSources = this.data.eagleSources ?? [];
    this.data.eagleFolders = this.data.eagleFolders ?? [];
    this.data.eagleTags = this.data.eagleTags ?? [];
    this.data.eagleSyncRuns = this.data.eagleSyncRuns ?? [];
    for (const asset of this.data.assets) {
      asset.source = asset.source ?? "local";
      asset.sourceStatus = asset.sourceStatus ?? "active";
      asset.tags = asset.tags ?? [];
      asset.eagleFolderIds = asset.eagleFolderIds ?? [];
      asset.eagleFolderNames = asset.eagleFolderNames ?? [];
      // 迁移旧数据：清除不再持久化的 rawEagleMetadata
      delete (asset as unknown as Record<string, unknown>)["rawEagleMetadata"];
    }
    this.cleanupIgnoredAssets();
    const statusResult = this.refreshAssetSourceStatuses();
    const rebuiltStats = this.rebuildDailyStatsFromAssets();
    if (!loaded || statusResult.changed || rebuiltStats) {
      this.save();
    } else {
      this.rebuildIndex();
    }
    this.enrichPreviewMetadata();
  }

  private save() {
    const tmp = `${this.dataPath}.tmp`;
    const bak = `${this.dataPath}.bak`;
    fs.writeFileSync(tmp, JSON.stringify(this.data), "utf8");
    if (fs.existsSync(this.dataPath)) {
      try { fs.copyFileSync(this.dataPath, bak); } catch { /* 备份失败不阻断写入 */ }
    }
    fs.renameSync(tmp, this.dataPath);
    this.rebuildIndex();
  }

  private enrichPreviewMetadata() {
    let changed = false;
    for (const asset of this.data.assets) {
      if (!asset.thumbnailPath) {
        const thumbnailPath = findSiblingThumbnail(asset.path);
        if (thumbnailPath) {
          asset.thumbnailPath = thumbnailPath;
          changed = true;
        }
      }
    }
    if (changed) {
      this.save();
    }
  }

  private cleanupIgnoredAssets() {
    const ignoredAssets = this.data.assets.filter((asset) => shouldIgnoreAssetFile(asset.path));
    if (ignoredAssets.length === 0) return;

    const ignoredIds = new Set(ignoredAssets.map((asset) => asset.id));
    this.data.assets = this.data.assets.filter((asset) => !ignoredIds.has(asset.id));
    this.data.projectAssets = this.data.projectAssets.filter((item) => !ignoredIds.has(item.assetId));

    this.repairDailyStatsTotals();
    this.save();
  }

  private expandFiles(itemPath: string): string[] {
    if (!fs.existsSync(itemPath)) return [];

    const stat = fs.statSync(itemPath);
    if (stat.isFile()) return [itemPath];
    if (!stat.isDirectory()) return [];

    const files: string[] = [];
    for (const entry of fs.readdirSync(itemPath)) {
      files.push(...this.expandFiles(path.join(itemPath, entry)));
    }
    return files.filter((filePath) => !shouldIgnoreAssetFile(filePath));
  }

  private async expandFilesAsync(itemPath: string): Promise<string[]> {
    try {
      const stat = await fs.promises.stat(itemPath);
      if (stat.isFile()) return shouldIgnoreAssetFile(itemPath) ? [] : [itemPath];
      if (!stat.isDirectory() || this.shouldIgnorePath(itemPath)) return [];

      const entries = await fs.promises.readdir(itemPath, { withFileTypes: true });
      const files: string[] = [];

      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const entryPath = path.join(itemPath, entry.name);
        if (this.shouldIgnorePath(entryPath)) continue;
        if (entry.isFile()) {
          if (!shouldIgnoreAssetFile(entryPath)) files.push(entryPath);
        } else if (entry.isDirectory()) {
          files.push(...(await this.expandFilesAsync(entryPath)));
        }

        if (index > 0 && index % 100 === 0) {
          await waitForEventLoop();
        }
      }

      return files;
    } catch {
      return [];
    }
  }

  private uniqueFolderName(parent: string, baseName: string): string {
    let candidate = baseName;
    let index = 2;
    while (fs.existsSync(path.join(parent, candidate))) {
      candidate = `${baseName}_${String(index).padStart(2, "0")}`;
      index += 1;
    }
    return candidate;
  }

  private uniqueFilePath(parent: string, fileName: string): string {
    const parsed = path.parse(fileName);
    let candidate = path.join(parent, fileName);
    let index = 2;
    while (fs.existsSync(candidate)) {
      candidate = path.join(parent, `${parsed.name}_${String(index).padStart(2, "0")}${parsed.ext}`);
      index += 1;
    }
    return candidate;
  }

  private updateDailyStats(assets: Asset[], now: string) {
    const date = now.slice(0, 10);
    let stats = this.data.dailyAssetStats.find((item) => item.date === date);
    if (!stats) {
      stats = this.createDailyStats(date, now);
      this.data.dailyAssetStats.unshift(stats);
    }

    for (const asset of assets) {
      this.addAssetToStats(stats, asset);
    }
    stats.updatedAt = now;
  }

  private rebuildDailyStatsFromAssets() {
    const existing = new Map(this.data.dailyAssetStats.map((item) => [item.date, item]));
    const byDate = new Map<string, DailyAssetStats>();
    const now = new Date().toISOString();

    for (const asset of this.data.assets) {
      const date = (asset.createdAt || asset.updatedAt || now).slice(0, 10);
      let stats = byDate.get(date);
      if (!stats) {
        stats = this.createDailyStats(date, now, existing.get(date));
        byDate.set(date, stats);
      }
      this.addAssetToStats(stats, asset);
    }

    const nextStats = Array.from(byDate.values()).sort((left, right) => right.date.localeCompare(left.date));
    const changed = JSON.stringify(this.data.dailyAssetStats) !== JSON.stringify(nextStats);
    this.data.dailyAssetStats = nextStats;
    return changed;
  }

  private createDailyStats(date: string, now: string, existing?: DailyAssetStats): DailyAssetStats {
    return {
      id: existing?.id ?? randomUUID(),
      date,
      totalCount: 0,
      imageCount: 0,
      videoCount: 0,
      audioCount: 0,
      characterCount: 0,
      referenceCount: 0,
      aeCount: 0,
      otherCount: 0,
      totalSize: 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
  }

  private addAssetToStats(stats: DailyAssetStats, asset: Asset) {
    stats.totalCount += 1;
    stats.totalSize += asset.fileSize;
    if (asset.type === "image") stats.imageCount += 1;
    else if (asset.type === "video") stats.videoCount += 1;
    else if (asset.type === "audio") stats.audioCount += 1;
    else if (asset.type === "character") stats.characterCount += 1;
    else if (asset.type === "reference") stats.referenceCount += 1;
    else if (asset.type === "ae") stats.aeCount += 1;
    else stats.otherCount = (stats.otherCount ?? 0) + 1;
  }

  private refreshAssetSourceStatuses(now = new Date().toISOString()) {
    let changed = false;
    let markedCount = 0;
    let restoredCount = 0;

    for (const asset of this.data.assets) {
      const stat = getFileStat(asset.path);
      const previousStatus = asset.sourceStatus ?? "active";
      const nextStatus: AssetSourceStatus = stat
        ? asset.source === "eagle" && previousStatus === "unavailable"
          ? "unavailable"
          : "active"
        : asset.source === "eagle"
        ? "missing"
        : "broken";

      if (nextStatus !== previousStatus) {
        if (isBrokenSourceStatus(nextStatus)) markedCount += 1;
        if (isBrokenSourceStatus(previousStatus) && nextStatus === "active") restoredCount += 1;
        asset.sourceStatus = nextStatus;
        asset.updatedAt = now;
        changed = true;
      }

      if (stat && (asset.fileSize !== stat.size || asset.fileModifiedAt !== stat.mtime.toISOString())) {
        asset.fileSize = stat.size;
        asset.fileModifiedAt = stat.mtime.toISOString();
        asset.updatedAt = now;
        changed = true;
      }
    }

    return { changed, markedCount, restoredCount };
  }


  private repairDailyStatsTotals() {
    for (const stats of this.data.dailyAssetStats) {
      stats.otherCount = stats.otherCount ?? 0;
      const trackedTotal =
        stats.imageCount +
        stats.videoCount +
        stats.audioCount +
        stats.characterCount +
        stats.referenceCount +
        stats.aeCount +
        stats.otherCount;
      if (stats.totalCount !== trackedTotal) {
        stats.totalCount = trackedTotal;
        stats.updatedAt = new Date().toISOString();
      }
    }
  }
}

function detectAssetType(filePath: string): AssetType {
  const ext = path.extname(filePath).toLowerCase();
  const lowerName = path.basename(filePath).toLowerCase();

  if (lowerName.includes("character") || lowerName.includes("char") || lowerName.includes("立绘")) {
    return "character";
  }
  if (lowerName.includes("ref") || lowerName.includes("reference") || lowerName.includes("参考")) {
    return "reference";
  }
  if (imageExts.has(ext)) return "image";
  if (videoExts.has(ext)) return "video";
  if (audioExts.has(ext)) return "audio";
  if (aeExts.has(ext)) return "ae";
  if (psdExts.has(ext)) return "psd";
  if (templateExts.has(ext)) return "template";
  return "misc";
}

function sanitizeName(name: string) {
  return (
    name
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "AE_Project"
  );
}

function isRegularFile(filePath: string) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function getFileStat(filePath: string) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function shouldIgnoreAssetFile(filePath: string) {
  return path.extname(filePath).toLowerCase() === ".json";
}

function getRelativeIfInside(filePath: string, parent: string) {
  if (!isInside(filePath, parent)) return null;
  return path.relative(parent, filePath);
}

function isInside(filePath: string, parent: string) {
  return isInsideNormalized(normalizePath(filePath), normalizePath(parent));
}

function isInsideNormalized(normalizedPath: string, normalizedParent: string) {
  return normalizedPath === normalizedParent || normalizedPath.startsWith(`${normalizedParent}${path.sep.toLowerCase()}`);
}

function isSamePath(left: string, right: string) {
  return normalizePath(left) === normalizePath(right);
}

function normalizePath(filePath: string) {
  return path.resolve(filePath).toLowerCase();
}

function isBrokenSourceStatus(status: AssetSourceStatus | undefined) {
  return status === "broken" || status === "missing";
}

function findSiblingThumbnail(filePath: string) {
  try {
    const folder = path.dirname(filePath);
    const parsed = path.parse(filePath);
    const directCandidates = [
      path.join(folder, `${parsed.name}_thumbnail.png`),
      path.join(folder, `${parsed.name}_thumbnail.jpg`),
      path.join(folder, `${parsed.name}_thumbnail.webp`)
    ];

    for (const candidate of directCandidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    const thumbnail = fs
      .readdirSync(folder)
      .find((name) => /_thumbnail\.(png|jpg|jpeg|webp)$/i.test(name));
    return thumbnail ? path.join(folder, thumbnail) : undefined;
  } catch {
    return undefined;
  }
}

function waitForEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function pruneNestedFolders(folders: string[]) {
  const normalized = folders
    .map((folder) => path.resolve(folder))
    .sort((left, right) => left.length - right.length);

  const result: string[] = [];
  for (const folder of normalized) {
    if (!result.some((parent) => isInside(folder, parent))) {
      result.push(folder);
    }
  }
  return result;
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
