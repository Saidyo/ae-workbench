import fs from "node:fs";
import path from "node:path";
import type {
  AssetType,
  EagleConnectionStatus,
  EagleFolder,
  EagleSource,
  EagleSyncAssetInput,
  EagleSyncPayload,
  EagleTag
} from "./types";

const eagleApiBases = ["http://127.0.0.1:41595", "http://localhost:41595"];
const requestTimeoutMs = 2200;
const pageSize = 200;

const imageExts = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".svg"]);
const videoExts = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"]);
const audioExts = new Set([".mp3", ".wav", ".aac", ".flac", ".ogg", ".m4a"]);
const aeExts = new Set([".aep", ".aepx"]);
const psdExts = new Set([".psd", ".psb"]);
const templateExts = new Set([".ffx", ".mogrt"]);

type PlainRecord = Record<string, unknown>;
type EagleFolderInput = Omit<EagleFolder, "id" | "sourceId" | "updatedAt">;
type EagleTagInput = Omit<EagleTag, "id" | "sourceId" | "updatedAt">;

export async function checkEagleConnection(): Promise<EagleConnectionStatus> {
  let lastMessage = "未检测到 Eagle 本地 API";

  for (const apiBaseUrl of eagleApiBases) {
    try {
      const appInfo = asRecord(await requestEagleJson(apiBaseUrl, "/api/application/info"));
      const libraryInfo = asRecord(await requestEagleJson(apiBaseUrl, "/api/library/info").catch(() => ({})));
      const nestedLibrary = asRecord(libraryInfo.library);
      const libraryPath =
        firstString(libraryInfo, ["path", "libraryPath", "folderPath", "libraryFolder"]) ??
        firstString(nestedLibrary, ["path", "libraryPath", "folderPath", "libraryFolder"]);
      const libraryName =
        firstString(libraryInfo, ["name", "libraryName"]) ??
        firstString(nestedLibrary, ["name", "libraryName"]) ??
        (libraryPath ? path.basename(libraryPath).replace(/\.library$/i, "") : undefined);

      return {
        connected: true,
        apiBaseUrl,
        applicationName: firstString(appInfo, ["name", "application", "version"]) ?? "Eagle",
        libraryPath,
        libraryName,
        message: libraryName ? `已连接 Eagle: ${libraryName}` : "已连接 Eagle 本地 API"
      };
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : lastMessage;
    }
  }

  return {
    connected: false,
    message: `Eagle 未运行或本地 API 不可访问。可先打开 Eagle，或在设置里选择 .library 目录后用只读扫描同步。${lastMessage ? ` (${lastMessage})` : ""}`
  };
}

export async function buildEagleSyncPayload(options?: { source?: EagleSource; libraryPath?: string }): Promise<EagleSyncPayload> {
  const source = options?.source;
  const libraryPath = options?.libraryPath ?? source?.libraryPath;
  const connection = await checkEagleConnection();
  const currentLibraryPath = connection.connected ? connection.libraryPath : undefined;
  const resolvedLibraryPath = libraryPath ?? currentLibraryPath;

  if (resolvedLibraryPath) {
    const apiBaseUrl = connection.connected ? connection.apiBaseUrl : undefined;
    const canUseApiFolders =
      Boolean(apiBaseUrl && currentLibraryPath && isSamePath(resolvedLibraryPath, currentLibraryPath));
    const apiFolders = canUseApiFolders
      ? await loadApiFolders(apiBaseUrl as string).catch(() => [])
      : [];

    return scanEagleLibrary(resolvedLibraryPath, source, {
      apiBaseUrl: canUseApiFolders ? apiBaseUrl : source?.apiBaseUrl,
      folders: apiFolders,
      name: source?.name ?? connection.libraryName
    });
  }

  const apiPayload = connection.connected && connection.apiBaseUrl ? await tryBuildApiPayload(source, connection) : null;
  if (apiPayload) return apiPayload;

  throw new Error("未连接 Eagle，也没有选择 Eagle .library 目录");
}

async function tryBuildApiPayload(source?: EagleSource, existingConnection?: EagleConnectionStatus): Promise<EagleSyncPayload | null> {
  const connection = existingConnection ?? (await checkEagleConnection());
  if (!connection.connected || !connection.apiBaseUrl) return null;

  if (source?.libraryPath && connection.libraryPath && !isSamePath(source.libraryPath, connection.libraryPath)) {
    return null;
  }

  try {
    return await buildApiPayload(connection.apiBaseUrl, source, connection);
  } catch {
    return null;
  }
}

async function buildApiPayload(
  apiBaseUrl: string,
  source: EagleSource | undefined,
  connection: EagleConnectionStatus
): Promise<EagleSyncPayload> {
  const folders = await loadApiFolders(apiBaseUrl).catch(() => []);
  const folderNameById = new Map(folders.map((folder) => [folder.eagleId, folder.path || folder.name]));
  const items = await fetchAllApiItems(apiBaseUrl);
  const detailedItems = await resolveItemDetails(apiBaseUrl, items);
  const warnings: string[] = [];
  const assets: EagleSyncAssetInput[] = [];

  for (const item of detailedItems) {
    const asset = mapApiItem(item, folderNameById, connection.libraryPath);
    if (asset) {
      assets.push(asset);
    } else if (warnings.length < 3) {
      warnings.push("部分 Eagle 项缺少本地文件路径，已跳过");
    }
  }

  return {
    source: {
      id: source?.id,
      name:
        source?.name ??
        connection.libraryName ??
        (connection.libraryPath ? path.basename(connection.libraryPath).replace(/\.library$/i, "") : "Eagle Library"),
      libraryPath: connection.libraryPath ?? source?.libraryPath,
      libraryId: connection.libraryPath ? normalizePath(connection.libraryPath) : source?.libraryId,
      apiBaseUrl
    },
    assets,
    folders,
    tags: buildTags(assets),
    warnings
  };
}

async function loadApiFolders(apiBaseUrl: string): Promise<EagleFolderInput[]> {
  const folderData = await requestEagleJson(apiBaseUrl, "/api/folder/list").catch(() => []);
  return flattenApiFolders(extractArray(folderData), undefined);
}

async function fetchAllApiItems(apiBaseUrl: string): Promise<PlainRecord[]> {
  const items: PlainRecord[] = [];
  let offset = 0;

  for (let page = 0; page < 200; page += 1) {
    const data = await requestEagleJson(apiBaseUrl, "/api/item/list", { limit: pageSize, offset });
    const list = extractArray(data).map(asRecord);
    const total = readNumber(asRecord(data), ["total", "count"]);
    items.push(...list);

    if (list.length === 0 || list.length < pageSize || (total !== undefined && items.length >= total)) break;
    offset += list.length;
  }

  return items;
}

async function resolveItemDetails(apiBaseUrl: string, items: PlainRecord[]): Promise<PlainRecord[]> {
  const resolved: PlainRecord[] = [];
  for (let index = 0; index < items.length; index += 8) {
    const chunk = items.slice(index, index + 8);
    const detailed = await Promise.all(
      chunk.map(async (item) => {
        if (firstLocalPath(item)) return item;
        const id = firstString(item, ["id", "uid", "_id"]);
        if (!id) return item;
        try {
          return asRecord(await requestEagleJson(apiBaseUrl, "/api/item/info", { id }));
        } catch {
          return item;
        }
      })
    );
    resolved.push(...detailed);
  }
  return resolved;
}

function mapApiItem(item: PlainRecord, folderNameById: Map<string, string>, libraryPath?: string): EagleSyncAssetInput | null {
  const filePath = firstLocalPath(item) ?? resolveEagleInfoAssetPath(libraryPath, item);
  if (!filePath) return null;

  const externalId = firstString(item, ["id", "uid", "_id"]) ?? filePath;
  const folderIds = readStringArray(item, ["folders", "folderIds", "folderIdList"]);
  const folderNames = uniqueStrings([
    ...readStringArray(item, ["folderNames"]),
    ...folderIds.map((folderId) => folderNameById.get(folderId) ?? folderId)
  ]);

  return {
    externalId,
    name: inferAssetName(item, filePath),
    type: detectAssetType(filePath),
    path: filePath,
    thumbnailPath: firstLocalPath(item, ["thumbnailPath", "thumbPath", "thumbnail", "posterPath"]) ?? resolveEagleInfoThumbnailPath(libraryPath, item),
    fileSize: readNumber(item, ["size", "fileSize"]),
    width: readNumber(item, ["width"]),
    height: readNumber(item, ["height"]),
    duration: readNumber(item, ["duration"]),
    folderIds,
    folderNames,
    tags: readStringArray(item, ["tags"]),
    rating: readRating(item),
    annotation: firstString(item, ["annotation", "note", "description", "comment"]),
    url: firstString(item, ["url", "sourceUrl", "website"]),
    createdAt: readDate(item, ["btime", "createdAt", "createTime"]),
    updatedAt: readDate(item, ["mtime", "updatedAt", "modificationTime", "lastModified"]),
    importedAt: readDate(item, ["importedAt", "importTime"]),
    rawMetadata: item
  };
}

function flattenApiFolders(nodes: unknown[], parentPath: string | undefined, parentId?: string): EagleFolderInput[] {
  const folders: EagleFolderInput[] = [];

  for (const rawNode of nodes) {
    const node = asRecord(rawNode);
    const eagleId = firstString(node, ["id", "uid", "_id"]);
    const name = firstString(node, ["name", "title"]) ?? "未命名文件夹";
    if (!eagleId) continue;

    const folderPath = parentPath ? `${parentPath}/${name}` : name;
    folders.push({
      eagleId,
      name,
      path: folderPath,
      parentId,
      assetCount: readNumber(node, ["assetCount", "imageCount", "count"]) ?? 0
    });
    folders.push(...flattenApiFolders(extractArray(node.children ?? node.folders), folderPath, eagleId));
  }

  return folders;
}

function scanEagleLibrary(
  libraryPath: string,
  source?: EagleSource,
  options?: { apiBaseUrl?: string; folders?: EagleFolderInput[]; name?: string }
): EagleSyncPayload {
  if (!fs.existsSync(libraryPath) || !fs.statSync(libraryPath).isDirectory()) {
    throw new Error("Eagle .library 目录不存在");
  }

  const imagesRoot = path.join(libraryPath, "images");
  const metadataPaths = findMetadataFiles(fs.existsSync(imagesRoot) ? imagesRoot : libraryPath);
  const assets: EagleSyncAssetInput[] = [];
  const folders = new Map<string, EagleFolderInput>();
  const folderCounts = new Map<string, number>();
  const folderNameById = new Map((options?.folders ?? []).map((folder) => [folder.eagleId, folder.path || folder.name]));
  const warnings: string[] = [];

  for (const folder of options?.folders ?? []) {
    folders.set(folder.eagleId, { ...folder, assetCount: 0 });
  }

  for (const metadataPath of metadataPaths) {
    const metadata = readJsonRecord(metadataPath);
    if (!metadata) continue;
    const filePath = resolveMetadataAssetPath(metadataPath, metadata);
    if (!filePath) {
      if (warnings.length < 3) warnings.push(`跳过缺少原文件路径的 Eagle 元数据: ${path.dirname(metadataPath)}`);
      continue;
    }

    const folderIds = readStringArray(metadata, ["folders", "folderIds", "folderIdList"]);
    const folderNames = uniqueStrings([
      ...readStringArray(metadata, ["folderNames", "folderPath", "folder"]),
      ...folderIds.map((folderId) => folderNameById.get(folderId) ?? folderId)
    ]);
    for (const folderId of folderIds) {
      folderCounts.set(folderId, (folderCounts.get(folderId) ?? 0) + 1);
      const name = folderNameById.get(folderId) ?? folderNames[folderIds.indexOf(folderId)] ?? folderId;
      const existing = folders.get(folderId);
      folders.set(folderId, {
        eagleId: folderId,
        name: existing?.name ?? name,
        path: existing?.path ?? name,
        parentId: existing?.parentId,
        assetCount: (existing?.assetCount ?? 0) + 1
      });
    }
    for (const folderName of folderNames.filter((name) => !folderIds.includes(name))) {
      const id = folderName;
      const existing = folders.get(id);
      folders.set(id, {
        eagleId: id,
        name: folderName,
        path: folderName,
        parentId: undefined,
        assetCount: (existing?.assetCount ?? 0) + 1
      });
    }

    assets.push({
      externalId: firstString(metadata, ["id", "uid", "_id"]) ?? path.basename(path.dirname(metadataPath)),
      name: inferAssetName(metadata, filePath),
      type: detectAssetType(filePath),
      path: filePath,
      thumbnailPath: resolveMetadataThumbnailPath(metadataPath, metadata),
      fileSize: readNumber(metadata, ["size", "fileSize"]),
      width: readNumber(metadata, ["width"]),
      height: readNumber(metadata, ["height"]),
      duration: readNumber(metadata, ["duration"]),
      folderIds,
      folderNames,
      tags: readStringArray(metadata, ["tags"]),
      rating: readRating(metadata),
      annotation: firstString(metadata, ["annotation", "note", "description", "comment"]),
      url: firstString(metadata, ["url", "sourceUrl", "website"]),
      createdAt: readDate(metadata, ["btime", "createdAt", "createTime"]),
      updatedAt: readDate(metadata, ["mtime", "updatedAt", "modificationTime", "lastModified"]),
      importedAt: readDate(metadata, ["importedAt", "importTime"]),
      rawMetadata: metadata
    });
  }

  return {
    source: {
      id: source?.id,
      name: options?.name ?? source?.name ?? path.basename(libraryPath).replace(/\.library$/i, "") ?? "Eagle Library",
      libraryPath: path.resolve(libraryPath),
      libraryId: normalizePath(libraryPath),
      apiBaseUrl: options?.apiBaseUrl ?? source?.apiBaseUrl
    },
    assets,
    folders: Array.from(folders.values()).map((folder) => ({
      ...folder,
      assetCount: folderCounts.get(folder.eagleId) ?? folder.assetCount
    })),
    tags: buildTags(assets),
    warnings
  };
}

async function requestEagleJson(apiBaseUrl: string, endpoint: string, params?: Record<string, string | number>) {
  const url = new URL(endpoint, apiBaseUrl);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Eagle API ${response.status}`);
    }
    return unwrapEagleResponse(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

function unwrapEagleResponse(value: unknown): unknown {
  const record = asRecord(value);
  const status = firstString(record, ["status", "code"]);
  if (status && !["success", "ok", "200"].includes(status.toLowerCase())) {
    throw new Error(firstString(record, ["message", "msg", "error"]) ?? `Eagle API returned ${status}`);
  }
  return record.data ?? record.result ?? value;
}

function findMetadataFiles(root: string) {
  const result: string[] = [];
  const stack = [path.resolve(root)];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && entry.name.toLowerCase() === "metadata.json" && path.basename(current).toLowerCase().endsWith(".info")) {
        result.push(entryPath);
      }
    }
  }

  return result;
}

function readJsonRecord(filePath: string): PlainRecord | null {
  try {
    return asRecord(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
}

function resolveMetadataAssetPath(metadataPath: string, metadata: PlainRecord) {
  const direct = firstLocalPath(metadata, ["filePath", "path", "originalPath", "originPath", "localPath"]);
  if (direct) return direct;

  const folder = path.dirname(metadataPath);
  const relative = firstString(metadata, ["file", "filename", "fileName"]);
  if (relative) {
    const candidate = path.resolve(folder, relative);
    if (fs.existsSync(candidate)) return candidate;
  }

  const name = firstString(metadata, ["name", "title"]);
  const ext = normalizeExt(firstString(metadata, ["ext", "extension"]));
  if (name && ext) {
    const candidate = path.join(folder, `${name}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }

  try {
    const candidates = fs
      .readdirSync(folder)
      .filter((fileName) => {
        const lower = fileName.toLowerCase();
        const extname = path.extname(lower);
        return !lower.endsWith(".json") && !isThumbnailFileName(fileName) && isKnownAssetExt(extname);
      })
      .map((fileName) => path.join(folder, fileName));
    return candidates[0];
  } catch {
    return undefined;
  }
}

function resolveMetadataThumbnailPath(metadataPath: string, metadata: PlainRecord) {
  const direct = firstLocalPath(metadata, ["thumbnailPath", "thumbPath", "thumbnail", "posterPath"]);
  if (direct) return direct;

  const folder = path.dirname(metadataPath);
  try {
    const thumbnail = fs
      .readdirSync(folder)
      .find((fileName) => isThumbnailFileName(fileName) && imageExts.has(path.extname(fileName).toLowerCase()));
    return thumbnail ? path.join(folder, thumbnail) : undefined;
  } catch {
    return undefined;
  }
}

function resolveEagleInfoAssetPath(libraryPath: string | undefined, item: PlainRecord) {
  const infoDir = resolveEagleInfoDir(libraryPath, item);
  if (!infoDir) return undefined;

  const exactName = inferAssetFileName(item);
  if (exactName) {
    const exact = path.join(infoDir, exactName);
    if (fs.existsSync(exact) && fs.statSync(exact).isFile()) return exact;
  }

  const expectedExt = normalizeExt(firstString(item, ["ext", "extension"])).toLowerCase();
  const expectedSize = readNumber(item, ["size", "fileSize"]);
  const candidates = readInfoDirAssets(infoDir);
  const sized = candidates.find((candidate) => {
    try {
      return expectedSize !== undefined && fs.statSync(candidate).size === expectedSize;
    } catch {
      return false;
    }
  });
  if (sized) return sized;

  if (expectedExt) {
    const extMatched = candidates.find((candidate) => path.extname(candidate).toLowerCase() === expectedExt);
    if (extMatched) return extMatched;
  }

  return candidates[0];
}

function resolveEagleInfoThumbnailPath(libraryPath: string | undefined, item: PlainRecord) {
  const infoDir = resolveEagleInfoDir(libraryPath, item);
  if (!infoDir) return undefined;

  try {
    const thumbnail = fs
      .readdirSync(infoDir)
      .find((fileName) => isThumbnailFileName(fileName) && imageExts.has(path.extname(fileName).toLowerCase()));
    return thumbnail ? path.join(infoDir, thumbnail) : undefined;
  } catch {
    return undefined;
  }
}

function resolveEagleInfoDir(libraryPath: string | undefined, item: PlainRecord) {
  const id = firstString(item, ["id", "uid", "_id"]);
  if (!libraryPath || !id) return undefined;
  const infoDir = path.join(libraryPath, "images", `${id}.info`);
  return fs.existsSync(infoDir) && fs.statSync(infoDir).isDirectory() ? infoDir : undefined;
}

function inferAssetFileName(record: PlainRecord) {
  const name = firstString(record, ["name", "title", "fileName", "filename"]);
  const ext = normalizeExt(firstString(record, ["ext", "extension"]));
  if (!name) return undefined;
  return path.extname(name) ? name : ext ? `${name}${ext}` : name;
}

function readInfoDirAssets(infoDir: string) {
  try {
    return fs
      .readdirSync(infoDir)
      .filter((fileName) => {
        const lower = fileName.toLowerCase();
        const extname = path.extname(lower);
        return (
          lower !== "metadata.json" &&
          !isThumbnailFileName(fileName) &&
          isKnownAssetExt(extname)
        );
      })
      .map((fileName) => path.join(infoDir, fileName));
  } catch {
    return [];
  }
}

function isThumbnailFileName(fileName: string) {
  return /(?:^|[_\-. ])(?:thumb|thumbnail|poster)$/i.test(path.parse(fileName).name);
}

function buildTags(assets: EagleSyncAssetInput[]): EagleTagInput[] {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    for (const tag of asset.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
    .map(([name, assetCount]) => ({
      eagleId: name,
      name,
      assetCount
    }));
}

function extractArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  for (const key of ["items", "list", "folders", "data", "results"]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function firstLocalPath(record: PlainRecord, keys = ["filePath", "path", "localPath", "originalPath", "originPath"]) {
  const candidate = firstString(record, keys);
  const decodedCandidate = candidate ? decodeLocalPath(candidate) : undefined;
  if (!decodedCandidate || isWebUrl(decodedCandidate)) return undefined;
  if (path.isAbsolute(decodedCandidate) && fs.existsSync(decodedCandidate)) return decodedCandidate;

  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string" || isWebUrl(value)) continue;
    const decoded = decodeLocalPath(value);
    if (path.isAbsolute(decoded)) return decoded;
  }

  return undefined;
}

function decodeLocalPath(value: string) {
  try {
    return decodeURIComponent(value).replace(/\//g, path.sep);
  } catch {
    return value.replace(/\//g, path.sep);
  }
}

function inferAssetName(record: PlainRecord, filePath: string) {
  const name = firstString(record, ["name", "title", "fileName", "filename"]);
  const ext = normalizeExt(firstString(record, ["ext", "extension"]));
  if (name && path.extname(name)) return name;
  if (name && ext) return `${name}${ext}`;
  return path.basename(filePath);
}

function readStringArray(record: PlainRecord, keys: string[]) {
  const values: string[] = [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      values.push(...value.map((item) => (typeof item === "string" ? item : firstString(asRecord(item), ["name", "id", "title"]))).filter(Boolean) as string[]);
    } else if (typeof value === "string") {
      values.push(...value.split(",").map((item) => item.trim()));
    }
  }
  return uniqueStrings(values);
}

function firstString(record: PlainRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function readNumber(record: PlainRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function readDate(record: PlainRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const iso = toIsoDate(value);
    if (iso) return iso;
  }
  return undefined;
}

function readRating(record: PlainRecord) {
  const rating = readNumber(record, ["rating", "rate", "stars"]);
  if (rating !== undefined) return Math.max(0, Math.min(5, rating));
  const star = record.star ?? record.starred ?? record.favorite;
  if (typeof star === "boolean") return star ? 5 : 0;
  if (typeof star === "number" && Number.isFinite(star)) return Math.max(0, Math.min(5, star));
  return undefined;
}

function toIsoDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(millis).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return toIsoDate(numeric);
  }
  return undefined;
}

function detectAssetType(filePath: string): AssetType {
  const ext = path.extname(filePath).toLowerCase();
  const lowerName = path.basename(filePath).toLowerCase();
  if (lowerName.includes("character") || lowerName.includes("char") || lowerName.includes("立绘")) return "character";
  if (lowerName.includes("ref") || lowerName.includes("reference") || lowerName.includes("参考")) return "reference";
  if (imageExts.has(ext)) return "image";
  if (videoExts.has(ext)) return "video";
  if (audioExts.has(ext)) return "audio";
  if (aeExts.has(ext)) return "ae";
  if (psdExts.has(ext)) return "psd";
  if (templateExts.has(ext)) return "template";
  return "misc";
}

function isKnownAssetExt(ext: string) {
  return imageExts.has(ext) || videoExts.has(ext) || audioExts.has(ext) || aeExts.has(ext) || psdExts.has(ext) || templateExts.has(ext);
}

function normalizeExt(ext?: string) {
  if (!ext) return "";
  return ext.startsWith(".") ? ext : `.${ext}`;
}

function isWebUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function asRecord(value: unknown): PlainRecord {
  return value && typeof value === "object" ? (value as PlainRecord) : {};
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isSamePath(left: string, right: string) {
  return normalizePath(left) === normalizePath(right);
}

function normalizePath(filePath: string) {
  return path.resolve(filePath).toLowerCase();
}
