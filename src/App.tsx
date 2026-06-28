import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clapperboard,
  Clock3,
  Copy,
  Database,
  Eye,
  EyeOff,
  FileDown,
  FileText,
  FolderOpen,
  HardDrive,
  Image,
  Import,
  Layers,
  Library,
  Link2,
  Link2Off,
  ListChecks,
  Moon,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  StickyNote,
  Star,
  Sun,
  Tags,
  Trash2,
  Video,
  Wifi,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import type { Asset, AssetSource, AssetSourceStatus, AssetType, DailyAssetStats, InitialData, Project, ProjectStatus } from "./types";

const emptyData: InitialData = {
  projects: [],
  assets: [],
  dailyAssetStats: [],
  projectAssets: [],
  watchedFolders: [],
  ignoredAssetPaths: [],
  eagleSources: [],
  eagleFolders: [],
  eagleTags: [],
  eagleSyncRuns: [],
  workspaceRoot: "",
  libraryRoot: "",
  projectsRoot: "",
  cacheRoot: ""
};

const statusLabel: Record<ProjectStatus, string> = {
  active: "进行中",
  paused: "暂停",
  finished: "完成",
  archived: "归档"
};

const statusTone: Record<ProjectStatus, string> = {
  active: "success",
  paused: "warning",
  finished: "info",
  archived: "muted"
};

const typeLabel: Record<AssetType | "all", string> = {
  all: "全部",
  character: "人物立绘",
  image: "图片",
  video: "视频",
  audio: "音频",
  reference: "参考",
  ae: "AE工程",
  psd: "PSD",
  template: "模板",
  misc: "其他"
};

const assetTypes: Array<AssetType | "all"> = ["all", "character", "image", "video", "reference", "audio", "ae", "psd", "template", "misc"];
const minZoom = 70;
const maxZoom = 220;
const zoomStep = 10;
const defaultSidebarWidth = 216;
const minSidebarWidth = 184;
const maxSidebarWidth = 340;
const sidebarWidthStorageKey = "ae-manager-sidebar-width";
const defaultLibraryFilterWidth = 330;
const minLibraryFilterWidth = 248;
const maxLibraryFilterWidth = 520;
const libraryFilterWidthStorageKey = "ae-manager-library-filter-width";
const themeStorageKey = "ae-workbench-theme";
type AssetScope = "all" | "project";
type AppSection = "overview" | "projects" | "library" | "daily" | "settings";
type ThemeMode = "light" | "dark";
type AssetTimeField = "createdAt" | "fileModifiedAt";
type AssetTimePreset = "all" | "today" | "7d" | "30d" | "custom";
type AssetSortDirection = "asc" | "desc";
type AssetSourceFilter = AssetSource | "all";
type EagleStatusFilter = AssetSourceStatus | "all";
type EagleRatingFilter = "all" | "rated" | "5" | "4" | "3";
type SmartCollectionId = "recent" | "highRated" | "unassigned" | "broken" | "frequent";
type AssetProjectReference = { project: Project; usageType: string; createdAt: string };

const assetTimeFieldLabel: Record<AssetTimeField, string> = {
  createdAt: "入库时间",
  fileModifiedAt: "文件修改"
};

const assetTimePresets: Array<{ label: string; value: AssetTimePreset }> = [
  { label: "全部时间", value: "all" },
  { label: "今天", value: "today" },
  { label: "近7天", value: "7d" },
  { label: "近30天", value: "30d" },
  { label: "自定义", value: "custom" }
];

const assetSourceLabel: Record<AssetSourceFilter, string> = {
  all: "全部来源",
  local: "本地",
  eagle: "Eagle"
};

const eagleStatusLabel: Record<EagleStatusFilter, string> = {
  all: "全部状态",
  active: "可用",
  missing: "文件缺失",
  unavailable: "未在 Eagle 列表",
  broken: "断链"
};

const smartCollectionLabel: Record<SmartCollectionId, string> = {
  recent: "最近添加",
  highRated: "高评分素材",
  unassigned: "未分配项目",
  broken: "失效素材",
  frequent: "常用素材"
};

const eagleRatingOptions: Array<{ label: string; value: EagleRatingFilter }> = [
  { label: "全部评分", value: "all" },
  { label: "有评分", value: "rated" },
  { label: "5星", value: "5" },
  { label: "4星以上", value: "4" },
  { label: "3星以上", value: "3" }
];

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getStoredSidebarWidth() {
  const stored = Number(window.localStorage.getItem(sidebarWidthStorageKey));
  return Number.isFinite(stored) ? clampNumber(stored, minSidebarWidth, maxSidebarWidth) : defaultSidebarWidth;
}

function getStoredLibraryFilterWidth() {
  const stored = Number(window.localStorage.getItem(libraryFilterWidthStorageKey));
  return Number.isFinite(stored) ? clampNumber(stored, minLibraryFilterWidth, maxLibraryFilterWidth) : defaultLibraryFilterWidth;
}

function getStoredTheme(): ThemeMode {
  const stored = window.localStorage.getItem(themeStorageKey);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const pageMeta: Record<AppSection, { eyebrow: string; title: string; accent: string; copy: string }> = {
  overview: {
    eyebrow: "总览",
    title: "工作台",
    accent: "概览",
    copy: "项目、素材、同步和今日入库保持在一个视图里，适合快速判断本地工程状态。"
  },
  projects: {
    eyebrow: "项目",
    title: "项目",
    accent: "工作台",
    copy: "创建、打开和切换 AE 项目，右侧保持当前项目目录、状态和原位素材上下文。"
  },
  library: {
    eyebrow: "素材",
    title: "素材",
    accent: "控制台",
    copy: "管理链接进来的图片、视频、立绘、参考和 AE 工程，文件仍保留在本地原文件夹。"
  },
  daily: {
    eyebrow: "统计",
    title: "入库",
    accent: "节奏",
    copy: "用入库热力和类型拆分查看每天新增素材，快速判断当前项目资产节奏。"
  },
  settings: {
    eyebrow: "维护",
    title: "设置",
    accent: "维护",
    copy: "打开本地目录、重新扫描索引、清理失效记录，并重置素材浏览偏好。"
  }
};

export function App() {
  const [data, setData] = useState<InitialData>(emptyData);
  const [projectName, setProjectName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [activeSection, setActiveSection] = useState<AppSection>("overview");
  const [assetScope, setAssetScope] = useState<AssetScope>("all");
  const [smartCollection, setSmartCollection] = useState<SmartCollectionId | null>(null);
  const [assetFilter, setAssetFilter] = useState<AssetType | "all">("all");
  const [assetSourceFilter, setAssetSourceFilter] = useState<AssetSourceFilter>("all");
  const [eagleFolderFilter, setEagleFolderFilter] = useState("all");
  const [eagleTagFilter, setEagleTagFilter] = useState("all");
  const [eagleRatingFilter, setEagleRatingFilter] = useState<EagleRatingFilter>("all");
  const [eagleStatusFilter, setEagleStatusFilter] = useState<EagleStatusFilter>("all");
  const [assetTimeField, setAssetTimeField] = useState<AssetTimeField>("createdAt");
  const [assetSortField, setAssetSortField] = useState<AssetTimeField>("createdAt");
  const [assetSortDirection, setAssetSortDirection] = useState<AssetSortDirection>("desc");
  const [assetTimePreset, setAssetTimePreset] = useState<AssetTimePreset>("all");
  const [assetDateFrom, setAssetDateFrom] = useState("");
  const [assetDateTo, setAssetDateTo] = useState("");
  const [excludedAssetTypes, setExcludedAssetTypes] = useState<Set<AssetType>>(() => new Set());
  const [excludedProjectIds, setExcludedProjectIds] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("文件夹同步已准备");
  const [assetZoom, setAssetZoom] = useState(100);
  const [displayRows, setDisplayRows] = useState(4);
  const [gridWidth, setGridWidth] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(getStoredSidebarWidth);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [libraryFilterWidth, setLibraryFilterWidth] = useState(getStoredLibraryFilterWidth);
  const [isLibraryFilterResizing, setIsLibraryFilterResizing] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(() => new Set());
  const [batchTagInput, setBatchTagInput] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<Asset[][] | null>(null);
  const [assetSizeMin, setAssetSizeMin] = useState("");
  const [assetSizeMax, setAssetSizeMax] = useState("");
  const [eagleAutoSync, setEagleAutoSync] = useState(false);
  const [projectNotes, setProjectNotes] = useState("");
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredTheme);
  const [isPending, startUiTransition] = useTransition();
  const deferredSearch = useDeferredValue(search);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const projectConsoleRef = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const assetConsoleRef = useRef<HTMLElement | null>(null);
  const dailyCardRef = useRef<HTMLElement | null>(null);
  const settingsRef = useRef<HTMLElement | null>(null);
  const projectNameRef = useRef<HTMLInputElement | null>(null);
  const sidebarResizeRef = useRef<{ startWidth: number; startX: number } | null>(null);
  const libraryFilterResizeRef = useRef<{ startWidth: number; startX: number } | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const desktopApi = window.aeManager;

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem(themeStorageKey, themeMode);
  }, [themeMode]);

  const refresh = useCallback(async () => {
    if (!desktopApi) {
      setMessage("请使用 open-ae-workbench.cmd 打开桌面版");
      return;
    }

    const initialData = await desktopApi.getInitialData();
    setData(initialData);
    setSelectedProjectId((current) => current || initialData.projects[0]?.id || "");
  }, [desktopApi]);

  useEffect(() => {
    refresh().catch((error) => setMessage(error instanceof Error ? error.message : "读取本地数据失败"));
  }, [refresh]);

  useEffect(() => {
    if (!desktopApi) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    return desktopApi.onSyncChanged((payload) => {
      const verb = payload.reason === "file-added" ? "新增" : "移除";
      setMessage(`本地文件夹已同步${verb}: ${getFileName(payload.path)}`);
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { refresh().catch(() => undefined); }, 300);
    });
  }, [desktopApi, refresh]);

  useEffect(() => {
    if (!desktopApi?.onEagleAutoSynced) return;
    return desktopApi.onEagleAutoSynced((payload) => {
      setMessage(`Eagle 自动同步: 新增 ${payload.addedCount}，更新 ${payload.updatedCount}`);
      refresh().catch(() => undefined);
    });
  }, [desktopApi, refresh]);


  useEffect(() => {
    window.localStorage.setItem(sidebarWidthStorageKey, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(libraryFilterWidthStorageKey, String(libraryFilterWidth));
  }, [libraryFilterWidth]);

  useEffect(() => {
    if (!isSidebarResizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const start = sidebarResizeRef.current;
      if (!start) return;
      const nextWidth = clampNumber(start.startWidth + event.clientX - start.startX, minSidebarWidth, maxSidebarWidth);
      setSidebarWidth(nextWidth);
    };

    const finishResize = () => {
      sidebarResizeRef.current = null;
      setIsSidebarResizing(false);
    };

    document.body.classList.add("is-sidebar-resizing");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);

    return () => {
      document.body.classList.remove("is-sidebar-resizing");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };
  }, [isSidebarResizing]);

  useEffect(() => {
    if (!isLibraryFilterResizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const start = libraryFilterResizeRef.current;
      if (!start) return;
      const nextWidth = clampNumber(start.startWidth + event.clientX - start.startX, minLibraryFilterWidth, maxLibraryFilterWidth);
      setLibraryFilterWidth(nextWidth);
    };

    const finishResize = () => {
      libraryFilterResizeRef.current = null;
      setIsLibraryFilterResizing(false);
    };

    document.body.classList.add("is-library-filter-resizing");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);

    return () => {
      document.body.classList.remove("is-library-filter-resizing");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };
  }, [isLibraryFilterResizing]);

  const todayStats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return data.dailyAssetStats.find((item) => item.date === today) ?? createEmptyStats(today);
  }, [data.dailyAssetStats]);

  const recentStats = useMemo(() => {
    const byDate = new Map(data.dailyAssetStats.map((item) => [item.date, item]));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      return byDate.get(key) ?? createEmptyStats(key);
    });
  }, [data.dailyAssetStats]);

  const recentMaxCount = useMemo(() => Math.max(1, ...recentStats.map((item) => item.totalCount)), [recentStats]);
  const selectedProject = data.projects.find((project) => project.id === selectedProjectId);

  useEffect(() => {
    setProjectNotes(selectedProject?.notes ?? "");
  }, [selectedProject?.id, selectedProject?.notes]);
  const selectedProjectAssetIds = useMemo(
    () => new Set(data.projectAssets.filter((item) => item.projectId === selectedProjectId).map((item) => item.assetId)),
    [data.projectAssets, selectedProjectId]
  );
  const projectAssetCounts = useMemo(() => {
    return data.projectAssets.reduce((counts, item) => {
      counts.set(item.projectId, (counts.get(item.projectId) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
  }, [data.projectAssets]);
  const projectById = useMemo(() => new Map(data.projects.map((project) => [project.id, project])), [data.projects]);
  const coverUrlById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of data.projects) {
      if (!project.coverAssetId) continue;
      const asset = data.assets.find((a) => a.id === project.coverAssetId);
      if (asset?.path) map.set(project.id, safeAssetUrl(asset.path));
    }
    return map;
  }, [data.projects, data.assets]);
  const assetProjectIds = useMemo(() => {
    return data.projectAssets.reduce((byAsset, item) => {
      const projectIds = byAsset.get(item.assetId) ?? new Set<string>();
      projectIds.add(item.projectId);
      byAsset.set(item.assetId, projectIds);
      return byAsset;
    }, new Map<string, Set<string>>());
  }, [data.projectAssets]);
  const assetUsageCounts = useMemo(() => {
    return data.projectAssets.reduce((counts, item) => {
      counts.set(item.assetId, (counts.get(item.assetId) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
  }, [data.projectAssets]);
  const assetProjectReferences = useMemo(() => {
    return data.projectAssets.reduce((references, item) => {
      const project = projectById.get(item.projectId);
      if (!project) return references;
      const list = references.get(item.assetId) ?? [];
      list.push({ project, usageType: item.usageType, createdAt: item.createdAt });
      references.set(item.assetId, list);
      return references;
    }, new Map<string, AssetProjectReference[]>());
  }, [data.projectAssets, projectById]);
  const frequentAssetIds = useMemo(() => {
    const ranked = Array.from(assetUsageCounts.entries())
      .filter(([, count]) => count > 0)
      .sort((left, right) => right[1] - left[1]);
    const limit = Math.max(1, Math.ceil(ranked.length * 0.2));
    return new Set(ranked.slice(0, limit).map(([assetId]) => assetId));
  }, [assetUsageCounts]);
  const recentCollectionStart = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return startOfLocalDay(date).getTime();
  }, [data.assets.length]);
  const smartCollectionCounts = useMemo(() => {
    return data.assets.reduce(
      (counts, asset) => {
        if (isRecentAsset(asset, recentCollectionStart)) counts.recent += 1;
        if ((asset.rating ?? 0) >= 4) counts.highRated += 1;
        if (!assetProjectIds.get(asset.id)?.size) counts.unassigned += 1;
        if (isBrokenAsset(asset)) counts.broken += 1;
        if (frequentAssetIds.has(asset.id)) counts.frequent += 1;
        return counts;
      },
      { recent: 0, highRated: 0, unassigned: 0, broken: 0, frequent: 0 } satisfies Record<SmartCollectionId, number>
    );
  }, [assetProjectIds, data.assets, frequentAssetIds, recentCollectionStart]);
  const selectedProjectAssets = useMemo(() => data.assets.filter((asset) => selectedProjectAssetIds.has(asset.id)), [data.assets, selectedProjectAssetIds]);
  const projectPreviewAssets = useMemo(() => selectedProjectAssets.slice(0, 6), [selectedProjectAssets]);
  const selectedProjectTypeCounts = useMemo(() => {
    return selectedProjectAssets.reduce((counts, asset) => {
      counts.set(asset.type, (counts.get(asset.type) ?? 0) + 1);
      return counts;
    }, new Map<AssetType, number>());
  }, [selectedProjectAssets]);
  const eagleAssets = useMemo(() => data.assets.filter((asset) => asset.source === "eagle"), [data.assets]);
  const primaryEagleSource = data.eagleSources[0];
  const lastEagleRun = data.eagleSyncRuns[0];
  const eagleFolderOptions = useMemo(
    () => [...data.eagleFolders].sort((left, right) => (left.path || left.name).localeCompare(right.path || right.name, "zh-CN")),
    [data.eagleFolders]
  );
  const eagleTagOptions = useMemo(
    () => [...data.eagleTags].sort((left, right) => right.assetCount - left.assetCount || left.name.localeCompare(right.name, "zh-CN")),
    [data.eagleTags]
  );
  const selectedEagleFolder = eagleFolderOptions.find((folder) => folder.id === eagleFolderFilter);
  const selectedEagleTag = eagleTagOptions.find((tag) => tag.id === eagleTagFilter);
  const assetTimeRange = useMemo(
    () => resolveAssetTimeRange(assetTimePreset, assetDateFrom, assetDateTo),
    [assetDateFrom, assetDateTo, assetTimePreset]
  );
  const timeFilterSummary = useMemo(
    () => formatTimeFilterSummary(assetTimePreset, assetDateFrom, assetDateTo),
    [assetDateFrom, assetDateTo, assetTimePreset]
  );

  const filteredAssets = useMemo(() => {
    const normalized = deferredSearch.trim().toLowerCase();
    const scopedAssets = assetScope === "project" ? data.assets.filter((asset) => selectedProjectAssetIds.has(asset.id)) : data.assets;
    return scopedAssets.filter((asset) => {
      const projectIds = assetProjectIds.get(asset.id);
      const source = asset.source ?? "local";
      const matchesType = assetFilter === "all" || asset.type === assetFilter;
      const matchesSearch =
        !normalized ||
        [asset.name, asset.path, asset.annotation, asset.url, ...(asset.tags ?? []), ...(asset.eagleFolderNames ?? [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      const matchesTime = isAssetInsideTimeRange(asset, assetTimeField, assetTimeRange);
      const matchesSource = assetSourceFilter === "all" || source === assetSourceFilter;
      const matchesEagleFolder =
        eagleFolderFilter === "all" ||
        (selectedEagleFolder
          ? source === "eagle" &&
            asset.externalLibraryId === selectedEagleFolder.sourceId &&
            (asset.eagleFolderIds?.includes(selectedEagleFolder.eagleId) || asset.eagleFolderNames?.includes(selectedEagleFolder.path || selectedEagleFolder.name))
          : true);
      const matchesEagleTag =
        eagleTagFilter === "all" ||
        (selectedEagleTag ? source === "eagle" && asset.externalLibraryId === selectedEagleTag.sourceId && asset.tags?.includes(selectedEagleTag.name) : true);
      const matchesEagleRating = matchesRatingFilter(asset.rating, eagleRatingFilter);
      const matchesEagleStatus = eagleStatusFilter === "all" || (asset.sourceStatus ?? "active") === eagleStatusFilter;
      const matchesSmartCollection =
        !smartCollection ||
        matchesSmartCollectionFilter(asset, smartCollection, {
          assetProjectIds,
          frequentAssetIds,
          recentCollectionStart
        });
      const sizeMinBytes = assetSizeMin ? Number(assetSizeMin) * 1024 * 1024 : undefined;
      const sizeMaxBytes = assetSizeMax ? Number(assetSizeMax) * 1024 * 1024 : undefined;
      const matchesSize =
        (sizeMinBytes === undefined || asset.fileSize >= sizeMinBytes) &&
        (sizeMaxBytes === undefined || asset.fileSize <= sizeMaxBytes);
      const isExcludedType = excludedAssetTypes.has(asset.type);
      const isExcludedProject = projectIds ? Array.from(projectIds).some((projectId) => excludedProjectIds.has(projectId)) : false;
      return (
        matchesType &&
        matchesSearch &&
        matchesTime &&
        matchesSource &&
        matchesEagleFolder &&
        matchesEagleTag &&
        matchesEagleRating &&
        matchesEagleStatus &&
        matchesSmartCollection &&
        matchesSize &&
        !isExcludedType &&
        !isExcludedProject
      );
    });
  }, [
    assetFilter,
    assetProjectIds,
    assetScope,
    assetSizeMax,
    assetSizeMin,
    assetSourceFilter,
    assetTimeField,
    assetTimeRange,
    data.assets,
    eagleFolderFilter,
    eagleRatingFilter,
    eagleStatusFilter,
    eagleTagFilter,
    excludedAssetTypes,
    excludedProjectIds,
    frequentAssetIds,
    deferredSearch,
    recentCollectionStart,
    selectedEagleFolder,
    selectedEagleTag,
    selectedProjectAssetIds,
    smartCollection
  ]);

  const sortedAssets = useMemo(() => {
    return [...filteredAssets].sort((left, right) => {
      const leftTime = new Date(left[assetSortField]).getTime();
      const rightTime = new Date(right[assetSortField]).getTime();
      const normalizedLeft = Number.isFinite(leftTime) ? leftTime : 0;
      const normalizedRight = Number.isFinite(rightTime) ? rightTime : 0;
      return assetSortDirection === "asc" ? normalizedLeft - normalizedRight : normalizedRight - normalizedLeft;
    });
  }, [assetSortDirection, assetSortField, filteredAssets]);

  const selectedProjectAssetCount = selectedProjectAssetIds.size;
  const hasActiveExclusions = excludedAssetTypes.size > 0 || excludedProjectIds.size > 0;
  const hasActiveTimeFilter = Boolean(assetTimeRange);
  const hasActiveSizeFilter = Boolean(assetSizeMin || assetSizeMax);
  const hasActiveEagleFilter =
    assetSourceFilter !== "all" ||
    eagleFolderFilter !== "all" ||
    eagleTagFilter !== "all" ||
    eagleRatingFilter !== "all" ||
    eagleStatusFilter !== "all";
  const hasAnyAssetFilter =
    Boolean(smartCollection) ||
    assetFilter !== "all" ||
    hasActiveExclusions ||
    hasActiveTimeFilter ||
    hasActiveSizeFilter ||
    hasActiveEagleFilter ||
    Boolean(deferredSearch.trim());
  const excludedAssetTypeCount = excludedAssetTypes.size;
  const excludedProjectCount = excludedProjectIds.size;
  const libraryDirectoryName = assetScope === "project" && selectedProject ? selectedProject.name : "全部素材";
  const libraryDirectoryPath = assetScope === "project" && selectedProject ? selectedProject.rootPath : data.libraryRoot;
  const emptyAssetTitle = smartCollection
    ? `${smartCollectionLabel[smartCollection]}集合暂无素材`
    : hasActiveExclusions
    ? "当前排除条件下没有素材"
    : hasActiveTimeFilter
    ? "当前时间范围没有素材"
    : assetScope === "project" && selectedProject
    ? `${selectedProject.name} 还没有关联素材`
    : "素材库是空的";
  const emptyAssetBody =
    smartCollection
      ? "清除智能集合或切换到全部素材后，可以继续用类型、时间和 Eagle 条件细筛。"
      : hasActiveExclusions
      ? "取消部分屏蔽类型或屏蔽项目后，这里会重新显示符合条件的素材。"
      : hasActiveTimeFilter
      ? "切换到更宽的时间范围，或改用文件修改时间查看历史素材。"
      : assetScope === "project" && selectedProject
      ? "点击“关联素材”选择本地文件或文件夹，系统会把它记录到这个项目分类里，不和其它项目混在一起。"
      : "导入人物立绘、参考图、视频或 AE 工程后，这里会显示可预览的素材卡片。";

  const activeProjects = data.projects.filter((project) => project.status === "active").length;
  const deadlineSoonProjects = data.projects.filter(isDeadlineSoon).length;
  const brokenAssetCount = data.assets.filter(isBrokenAsset).length;
  const showAssetEmptyActions = data.assets.length === 0 && !hasAnyAssetFilter && assetScope === "all";
  const totalSize = data.assets.reduce((sum, asset) => sum + asset.fileSize, 0);
  const assetCardMin = useMemo(() => Math.round(186 * (assetZoom / 100)), [assetZoom]);
  const visibleColumns = useMemo(() => {
    if (!gridWidth) return 3;
    return Math.max(1, Math.floor((gridWidth + 16) / (assetCardMin + 16)));
  }, [assetCardMin, gridWidth]);
  const baseRows = useMemo(() => Math.max(2, Math.round(4 * (100 / assetZoom))), [assetZoom]);
  const visibleLimit = visibleColumns * displayRows;
  const visibleAssets = useMemo(() => sortedAssets.slice(0, visibleLimit), [sortedAssets, visibleLimit]);
  const previewAssetReferences = previewAsset ? assetProjectReferences.get(previewAsset.id) ?? [] : [];

  useEffect(() => {
    setDisplayRows(baseRows);
  }, [
    assetDateFrom,
    assetDateTo,
    assetFilter,
    assetScope,
    assetSortDirection,
    assetSortField,
    assetSourceFilter,
    assetTimeField,
    assetTimePreset,
    baseRows,
    eagleFolderFilter,
    eagleRatingFilter,
    eagleStatusFilter,
    eagleTagFilter,
    excludedAssetTypes,
    excludedProjectIds,
    search,
    selectedProjectId
  ]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    if (visibleAssets.length >= sortedAssets.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setDisplayRows((current) => current + baseRows);
        }
      },
      { rootMargin: "360px 0px" }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [baseRows, sortedAssets.length, visibleAssets.length]);

  useEffect(() => {
    if (assetScope === "project" && !selectedProjectId) {
      setAssetScope("all");
    }
  }, [assetScope, selectedProjectId]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setGridWidth(width);
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, [activeSection]);

  const changeAssetZoom = (nextZoom: number) => {
    const clamped = clampNumber(nextZoom, minZoom, maxZoom);
    setAssetZoom(clamped);
    setDisplayRows(Math.max(2, Math.round(4 * (100 / clamped))));
  };

  useEffect(() => {
    const handleAssetZoomWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest("[data-asset-zoom-surface='true']")) return;

      event.preventDefault();
      const delta = event.deltaY > 0 ? -zoomStep : zoomStep;
      setAssetZoom((current) => {
        const nextZoom = clampNumber(current + delta, minZoom, maxZoom);
        setDisplayRows(Math.max(2, Math.round(4 * (100 / nextZoom))));
        return nextZoom;
      });
    };

    window.addEventListener("wheel", handleAssetZoomWheel, { capture: true, passive: false });
    return () => window.removeEventListener("wheel", handleAssetZoomWheel, { capture: true });
  }, []);

  const focusProjectCreator = () => {
    setActiveSection("projects");
    requestAnimationFrame(() => {
      projectNameRef.current?.focus();
      projectNameRef.current?.select();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    setMessage("输入项目名称后点击创建项目");
  };

  const selectProject = (projectId: string) => {
    const project = data.projects.find((item) => item.id === projectId);
    startUiTransition(() => {
      setSelectedProjectId(projectId);
      setAssetScope("project");
      setSmartCollection(null);
      setAssetFilter("all");
      setSearch("");
    });
    setMessage(`已切换到项目目录: ${project?.name ?? "当前项目"}`);
  };

  const showAllAssets = () => {
    startUiTransition(() => {
      setAssetScope("all");
      setSmartCollection(null);
      setAssetFilter("all");
      setSearch("");
    });
    setMessage("正在查看全部素材");
  };

  const applySmartCollection = (collection: SmartCollectionId) => {
    startUiTransition(() => {
      setActiveSection("library");
      setAssetScope("all");
      setSmartCollection(collection);
      setAssetFilter("all");
      setSearch("");
      setDisplayRows(baseRows);
    });
    setMessage(`正在查看智能集合: ${smartCollectionLabel[collection]}`);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const clearSmartCollection = () => {
    setSmartCollection(null);
    setMessage("已清除智能集合筛选");
  };

  const toggleExcludedAssetType = (type: AssetType) => {
    setExcludedAssetTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) {
        next.delete(type);
        setMessage(`已取消屏蔽类型: ${typeLabel[type]}`);
      } else {
        next.add(type);
        setMessage(`已屏蔽类型: ${typeLabel[type]}`);
      }
      return next;
    });
  };

  const toggleExcludedProject = (project: Project) => {
    setExcludedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(project.id)) {
        next.delete(project.id);
        setMessage(`已取消屏蔽项目: ${project.name}`);
      } else {
        next.add(project.id);
        setMessage(`已屏蔽项目: ${project.name}`);
      }
      return next;
    });
  };

  const clearAssetExclusions = () => {
    setExcludedAssetTypes(new Set());
    setExcludedProjectIds(new Set());
    setMessage("已清空素材排除条件");
  };

  const clearProjectExclusions = () => {
    setExcludedProjectIds(new Set());
    setMessage("已清空屏蔽项目");
  };

  const clearTypeExclusions = () => {
    setExcludedAssetTypes(new Set());
    setMessage("已清空屏蔽类型");
  };

  const openSection = (section: AppSection) => {
    startUiTransition(() => setActiveSection(section));
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const showCurrentProjectAssets = () => {
    if (!selectedProject) {
      focusProjectCreator();
      setMessage("先新建或选择一个项目，再查看项目关联素材");
      return;
    }

    startUiTransition(() => {
      setAssetScope("project");
      setSmartCollection(null);
      setAssetFilter("all");
      setSearch("");
      setDisplayRows(baseRows);
      setActiveSection("library");
    });
    setMessage(`正在查看 ${selectedProject.name} 的关联素材`);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const openSystemPath = async (targetPath: string, label: string) => {
    if (!desktopApi) {
      setMessage("请使用 open-ae-workbench.cmd 打开桌面版后再打开本地目录");
      return;
    }
    if (!targetPath) {
      setMessage(`${label} 路径不可用`);
      return;
    }

    try {
      await desktopApi.openPath(targetPath);
      setMessage(`已打开${label}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `打开${label}失败`);
    }
  };

  const previewAssetFromCard = useCallback((asset: Asset) => {
    setPreviewAsset(asset);
  }, []);

  const unlinkAsset = useCallback(
    async (asset: Asset) => {
      if (!desktopApi) return;
      const confirmed = window.confirm(`取消关联「${asset.name}」？\n本地文件不会被删除。`);
      if (!confirmed) return;

      setBusy(true);
      try {
        await desktopApi.unlinkAsset(asset.id);
        if (previewAsset?.id === asset.id) {
          setPreviewAsset(null);
        }
        setMessage(`已取消关联: ${asset.name}`);
        await refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "取消关联失败");
      } finally {
        setBusy(false);
      }
    },
    [desktopApi, previewAsset?.id, refresh]
  );

  const rescanAssets = async () => {
    if (!desktopApi) {
      setMessage("请使用 open-ae-workbench.cmd 打开桌面版后再重新扫描");
      return;
    }

    setBusy(true);
    try {
      const result = await desktopApi.rescanAssets();
      setMessage(`索引扫描完成，新增 ${result.addedCount} 个素材`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重新扫描失败");
    } finally {
      setBusy(false);
    }
  };

  const pruneMissingAssets = async () => {
    if (!desktopApi) {
      setMessage("请使用 open-ae-workbench.cmd 打开桌面版后再清理索引");
      return;
    }
    const confirmed = window.confirm("清理已不存在的素材记录？\n本地文件不会被删除，只会移除系统里的失效记录。");
    if (!confirmed) return;

    setBusy(true);
    try {
      const result = await desktopApi.pruneMissingAssets();
      setMessage(`已清理 ${result.removedAssets} 个失效素材记录，移除 ${result.removedProjectLinks} 条项目关联`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "清理失效记录失败");
    } finally {
      setBusy(false);
    }
  };

  const markMissingAssets = async () => {
    if (!desktopApi) {
      setMessage("请使用 open-ae-workbench.cmd 打开桌面版后再检测失效素材");
      return;
    }

    setBusy(true);
    try {
      const result = await desktopApi.markMissingAssets();
      setMessage(`失效检测完成: 新标记 ${result.markedCount} 个，恢复 ${result.restoredCount} 个，当前失效 ${result.brokenCount} 个`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "检测失效素材失败");
    } finally {
      setBusy(false);
    }
  };

  const resetAssetView = () => {
    setAssetScope("all");
    setSmartCollection(null);
    setAssetFilter("all");
    setAssetSourceFilter("all");
    setEagleFolderFilter("all");
    setEagleTagFilter("all");
    setEagleRatingFilter("all");
    setEagleStatusFilter("all");
    setSearch("");
    setAssetTimeField("createdAt");
    setAssetSortField("createdAt");
    setAssetSortDirection("desc");
    setAssetTimePreset("all");
    setAssetDateFrom("");
    setAssetDateTo("");
    setAssetSizeMin("");
    setAssetSizeMax("");
    setSelectedAssetIds(new Set());
    clearAssetExclusions();
    changeAssetZoom(100);
    setMessage("已恢复默认浏览");
    openSection("library");
  };

  const clearTimeFilter = () => {
    setAssetTimePreset("all");
    setAssetDateFrom("");
    setAssetDateTo("");
    setMessage("已清除时间筛选");
  };

  const clearEagleFilters = () => {
    setAssetSourceFilter("all");
    setEagleFolderFilter("all");
    setEagleTagFilter("all");
    setEagleRatingFilter("all");
    setEagleStatusFilter("all");
    setMessage("已清除 Eagle 筛选");
  };

  const createProject = async () => {
    if (!projectName.trim()) {
      setMessage("先给项目起个名字");
      return;
    }

    setBusy(true);
    try {
      if (!desktopApi) return;
      const project = await desktopApi.createProject({
        name: projectName,
        status: "active",
        deadline: deadline || undefined
      });
      setProjectName("");
      setDeadline("");
      setSelectedProjectId(project.id);
      setAssetScope("project");
      setSmartCollection(null);
      setAssetFilter("all");
      setSearch("");
      setMessage(`已创建项目: ${project.name}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建项目失败");
    } finally {
      setBusy(false);
    }
  };

  const importAssets = async (destination: "linked" | "project") => {
    if (destination === "project" && !selectedProjectId) {
      setMessage("先选择一个项目，再关联素材到当前项目");
      return;
    }
    if (!desktopApi) {
      setMessage("请使用 open-ae-workbench.cmd 打开桌面版后再关联素材");
      return;
    }

    setBusy(true);
    try {
      await waitForPaint();
      const imported = await desktopApi.importAssets({
        destination,
        projectId: destination === "project" ? selectedProjectId : undefined
      });
      if (destination === "project") {
        setAssetScope("project");
        setSmartCollection(null);
        setAssetFilter("all");
      }
      setMessage(destination === "project" ? `已关联 ${imported.length} 个素材到当前项目（未复制文件）` : `已关联 ${imported.length} 个本地素材`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入素材失败");
    } finally {
      setBusy(false);
    }
  };

  const checkEagleConnection = async () => {
    if (!desktopApi) {
      setMessage("请使用 open-ae-workbench.cmd 打开桌面版后再检测 Eagle");
      return;
    }

    setBusy(true);
    try {
      const result = await desktopApi.checkEagleConnection();
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "检测 Eagle 失败");
    } finally {
      setBusy(false);
    }
  };

  const selectEagleLibrary = async () => {
    if (!desktopApi) {
      setMessage("请使用 open-ae-workbench.cmd 打开桌面版后再选择 Eagle 库");
      return;
    }

    setBusy(true);
    try {
      const source = await desktopApi.selectEagleLibrary();
      if (source) {
        setMessage(`已关联 Eagle 库: ${source.name}`);
        await refresh();
      } else {
        setMessage("未选择 Eagle 库");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "关联 Eagle 库失败");
    } finally {
      setBusy(false);
    }
  };

  const syncEagleLibrary = async () => {
    if (!desktopApi) {
      setMessage("请使用 open-ae-workbench.cmd 打开桌面版后再同步 Eagle");
      return;
    }

    setBusy(true);
    try {
      const result = await desktopApi.syncEagleLibrary({ sourceId: primaryEagleSource?.id });
      setAssetSourceFilter("eagle");
      setMessage(
        `Eagle 同步完成: 新增 ${result.run.addedCount}，更新 ${result.run.updatedCount}，缺失 ${result.run.missingCount}`
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "同步 Eagle 失败");
    } finally {
      setBusy(false);
    }
  };

  const unlinkEagleSource = async () => {
    if (!desktopApi || !primaryEagleSource) return;
    const confirmed = window.confirm(`取消关联 Eagle 库「${primaryEagleSource.name}」？\n本地文件和 Eagle 数据不会被删除，只移除系统里的同步索引。`);
    if (!confirmed) return;

    setBusy(true);
    try {
      const result = await desktopApi.unlinkEagleSource(primaryEagleSource.id);
      clearEagleFilters();
      setMessage(`已取消 Eagle 关联: ${result.source.name}，移除 ${result.removedCount} 条索引`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "取消 Eagle 关联失败");
    } finally {
      setBusy(false);
    }
  };

  const openProject = async (project: Project) => {
    if (!desktopApi) return;
    const updated = await desktopApi.openProjectFolder(project.id);
    setData((current) => ({
      ...current,
      projects: current.projects.map((item) => (item.id === updated.id ? updated : item))
    }));
  };

  const updateProjectStatus = async (project: Project, status: ProjectStatus) => {
    if (!desktopApi) return;
    const updated = await desktopApi.updateProject({ id: project.id, patch: { status } });
    setData((current) => ({
      ...current,
      projects: current.projects.map((item) => (item.id === updated.id ? updated : item))
    }));
  };

  const saveProjectNotes = async () => {
    if (!desktopApi || !selectedProject) return;
    const updated = await desktopApi.updateProject({ id: selectedProject.id, patch: { notes: projectNotes } });
    setData((current) => ({
      ...current,
      projects: current.projects.map((item) => (item.id === updated.id ? updated : item))
    }));
    setMessage("项目备注已保存");
  };

  const setCoverAsset = async (assetId: string) => {
    if (!desktopApi || !selectedProject) return;
    const updated = await desktopApi.updateProject({ id: selectedProject.id, patch: { coverAssetId: assetId } });
    setData((current) => ({
      ...current,
      projects: current.projects.map((item) => (item.id === updated.id ? updated : item))
    }));
    setMessage("已设为项目封面");
  };

  const exportProjectCsv = async () => {
    if (!desktopApi || !selectedProject) return;
    setBusy(true);
    try {
      await desktopApi.exportProjectCsv(selectedProject.id);
      setMessage("素材清单已导出");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出失败");
    } finally {
      setBusy(false);
    }
  };

  const relinkAsset = useCallback(async (asset: Asset) => {
    if (!desktopApi) return;
    const newPath = window.prompt(`重新指定文件路径:\n当前: ${asset.path}\n\n请输入新的完整文件路径:`);
    if (!newPath?.trim()) return;
    setBusy(true);
    try {
      const updated = await desktopApi.relinkAsset(asset.id, newPath.trim());
      setData((current) => ({
        ...current,
        assets: current.assets.map((item) => (item.id === updated.id ? updated : item))
      }));
      setMessage(`已重新关联: ${updated.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重新关联失败");
    } finally {
      setBusy(false);
    }
  }, [desktopApi]);

  const findAndShowDuplicates = async () => {
    if (!desktopApi) return;
    setBusy(true);
    try {
      const groups = await desktopApi.findDuplicates();
      setDuplicateGroups(groups);
      setMessage(groups.length > 0 ? `发现 ${groups.length} 组重复素材` : "未发现重复素材");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "查找重复失败");
    } finally {
      setBusy(false);
    }
  };

  const toggleSelectAsset = useCallback((id: string) => {
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  const clearSelection = () => setSelectedAssetIds(new Set());

  const toggleAssetSelect = useCallback((id: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAllVisible = () => setSelectedAssetIds(new Set(visibleAssets.map((a) => a.id)));

  const batchUnlinkSelected = async () => {
    if (!desktopApi || selectedAssetIds.size === 0) return;
    const confirmed = window.confirm(`取消关联选中的 ${selectedAssetIds.size} 个素材？\n本地文件不会被删除。`);
    if (!confirmed) return;
    setBusy(true);
    try {
      const result = await desktopApi.batchUnlink(Array.from(selectedAssetIds));
      setSelectedAssetIds(new Set());
      setMessage(`已取消关联 ${result.removedCount} 个素材`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量取消关联失败");
    } finally {
      setBusy(false);
    }
  };

  const batchTagSelected = async () => {
    const tag = batchTagInput.trim();
    if (!desktopApi || selectedAssetIds.size === 0 || !tag) return;
    setBusy(true);
    try {
      const result = await desktopApi.batchAddTag(Array.from(selectedAssetIds), tag);
      setBatchTagInput("");
      setMessage(`已为 ${result.updatedCount} 个素材添加标签: ${tag}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量打标签失败");
    } finally {
      setBusy(false);
    }
  };

  const toggleEagleAutoSync = async () => {
    if (!desktopApi) return;
    const next = !eagleAutoSync;
    await desktopApi.setEagleAutoSync(next);
    setEagleAutoSync(next);
    setMessage(next ? "Eagle 自动同步已开启（每 30 秒检测变化）" : "Eagle 自动同步已关闭");
  };

  const addToSearchHistory = (term: string) => {
    if (!term.trim()) return;
    setSearchHistory((prev) => {
      const next = [term, ...prev.filter((h) => h !== term)].slice(0, 10);
      return next;
    });
  };

  const applySearch = (term: string) => {
    setSearch(term);
    setShowSearchHistory(false);
    if (term) addToSearchHistory(term);
  };

  const activePage = pageMeta[activeSection];
  const systemStatus = busy ? "正在处理本地操作" : isPending ? "正在切换视图" : desktopApi ? "桌面服务在线" : "浏览器预览模式";

  const beginSidebarResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    sidebarResizeRef.current = {
      startWidth: sidebarWidth,
      startX: event.clientX
    };
    setIsSidebarResizing(true);
  };

  const resizeSidebarWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 24 : 12;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSidebarWidth((current) => clampNumber(current - step, minSidebarWidth, maxSidebarWidth));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setSidebarWidth((current) => clampNumber(current + step, minSidebarWidth, maxSidebarWidth));
    }
    if (event.key === "Home") {
      event.preventDefault();
      setSidebarWidth(minSidebarWidth);
    }
    if (event.key === "End") {
      event.preventDefault();
      setSidebarWidth(maxSidebarWidth);
    }
  };

  const resetSidebarWidth = () => {
    setSidebarWidth(defaultSidebarWidth);
    setMessage("侧边栏已恢复默认宽度");
  };

  const beginLibraryFilterResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    libraryFilterResizeRef.current = {
      startWidth: libraryFilterWidth,
      startX: event.clientX
    };
    setIsLibraryFilterResizing(true);
  };

  const resizeLibraryFilterWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 24 : 12;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setLibraryFilterWidth((current) => clampNumber(current - step, minLibraryFilterWidth, maxLibraryFilterWidth));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setLibraryFilterWidth((current) => clampNumber(current + step, minLibraryFilterWidth, maxLibraryFilterWidth));
    }
    if (event.key === "Home") {
      event.preventDefault();
      setLibraryFilterWidth(minLibraryFilterWidth);
    }
    if (event.key === "End") {
      event.preventDefault();
      setLibraryFilterWidth(maxLibraryFilterWidth);
    }
  };

  const resetLibraryFilterWidth = () => {
    setLibraryFilterWidth(defaultLibraryFilterWidth);
    setMessage("素材筛选栏已恢复默认宽度");
  };

  return (
    <main
      className={`app-frame ${isSidebarResizing ? "is-resizing-sidebar" : ""} ${isLibraryFilterResizing ? "is-resizing-library-filter" : ""}`}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <aside className="sidebar">
        <div className="brand-mark">
          <span>A</span>
          <div>
            <strong>AE Workbench</strong>
            <em>本地索引</em>
          </div>
        </div>

        <nav className="side-nav" aria-label="主导航">
          <NavItem active={activeSection === "overview"} icon={<BarChart3 size={16} />} label="概览" onClick={() => openSection("overview")} />
          <NavItem active={activeSection === "projects"} icon={<Clapperboard size={16} />} label="项目库" meta={data.projects.length.toString()} onClick={() => openSection("projects")} />
          <NavItem active={activeSection === "library"} icon={<Library size={16} />} label="素材库" meta={data.assets.length.toString()} onClick={() => openSection("library")} />
          <NavItem active={activeSection === "daily"} icon={<Activity size={16} />} label="每日统计" meta={todayStats.totalCount.toString()} onClick={() => openSection("daily")} />
          <NavItem active={activeSection === "settings"} icon={<Settings2 size={16} />} label="设置" meta={data.watchedFolders.length.toString()} onClick={() => openSection("settings")} />
        </nav>

        <section className="smart-collections" aria-label="智能集合">
          <div className="smart-collections-head">
            <span>智能集合</span>
            <strong>{data.assets.length}</strong>
          </div>
          <SmartCollectionButton
            active={smartCollection === "recent"}
            count={smartCollectionCounts.recent}
            icon={<Clock3 size={13} />}
            label="最近添加"
            onClick={() => applySmartCollection("recent")}
          />
          <SmartCollectionButton
            active={smartCollection === "highRated"}
            count={smartCollectionCounts.highRated}
            icon={<Star size={13} />}
            label="高评分素材"
            onClick={() => applySmartCollection("highRated")}
          />
          <SmartCollectionButton
            active={smartCollection === "unassigned"}
            count={smartCollectionCounts.unassigned}
            icon={<Link2Off size={13} />}
            label="未分配项目"
            onClick={() => applySmartCollection("unassigned")}
          />
          <SmartCollectionButton
            active={smartCollection === "broken"}
            count={smartCollectionCounts.broken}
            icon={<AlertTriangle size={13} />}
            label="失效素材"
            onClick={() => applySmartCollection("broken")}
          />
          <SmartCollectionButton
            active={smartCollection === "frequent"}
            count={smartCollectionCounts.frequent}
            icon={<Layers size={13} />}
            label="常用素材"
            onClick={() => applySmartCollection("frequent")}
          />
        </section>

        <div className="side-footer">
          <span>状态</span>
          <strong>
            <CheckCircle2 size={13} />
            {desktopApi ? "本地服务运行中" : "等待桌面环境"}
          </strong>
          <button className="theme-toggle" onClick={() => setThemeMode((current) => (current === "light" ? "dark" : "light"))} type="button">
            {themeMode === "light" ? <Moon size={13} /> : <Sun size={13} />}
            {themeMode === "light" ? "深色模式" : "浅色模式"}
          </button>
        </div>
        <button
          aria-label="调整侧边栏宽度"
          aria-orientation="vertical"
          aria-valuemax={maxSidebarWidth}
          aria-valuemin={minSidebarWidth}
          aria-valuenow={sidebarWidth}
          className="sidebar-resize-handle"
          onDoubleClick={resetSidebarWidth}
          onKeyDown={resizeSidebarWithKeyboard}
          onPointerDown={beginSidebarResize}
          role="separator"
          title="拖拽调整侧边栏宽度，双击恢复默认"
          type="button"
        />
      </aside>

      <section className="workspace" ref={workspaceRef}>
        <header className="command-bar">
          <div className="command-context">
            <p className="folio-line">
              <span>{activePage.eyebrow}</span>
              <time>{formatLongDate(new Date())}</time>
            </p>
            <h1>
              {activePage.title}<span>{activePage.accent}</span>
            </h1>
            <p className="hero-copy">{activePage.copy}</p>
          </div>
          <div className="command-cluster">
            <div className="status-chip">
              <CheckCircle2 size={14} />
              <span>{systemStatus}</span>
            </div>
            <div className="scope-chip" title={libraryDirectoryPath}>
              <FolderOpen size={14} />
              <span>{libraryDirectoryName}</span>
            </div>
            <div className="hero-actions">
              <button className="quiet-button" onClick={() => refresh()} disabled={busy}>
                <Wifi size={15} />
                刷新索引
              </button>
              <button className="dark-button" onClick={() => importAssets("linked")} disabled={busy}>
                <Import size={15} />
                关联素材
              </button>
            </div>
          </div>
        </header>

        {!desktopApi ? (
          <section className="desktop-warning">
            <h2>当前不是桌面运行环境</h2>
            <p>请双击项目目录中的 open-ae-workbench.cmd。浏览器预览只能查看界面，不能访问本地文件夹。</p>
          </section>
        ) : null}

        {activeSection === "overview" ? (
          <section className="metric-strip">
            <MetricCard icon={<Clapperboard size={19} />} label="项目" value={data.projects.length.toString()} hint={`${activeProjects} 个进行中`} />
            <MetricCard icon={<CalendarClock size={19} />} label="近截止" value={deadlineSoonProjects.toString()} hint="3 天内需要关注" />
            <MetricCard icon={<Library size={19} />} label="素材" value={data.assets.length.toString()} hint={formatSize(totalSize)} />
            <MetricCard icon={<Import size={19} />} label="今日入库" value={todayStats.totalCount.toString()} hint={formatSize(todayStats.totalSize)} />
            <MetricCard icon={<AlertTriangle size={19} />} label="失效素材" value={brokenAssetCount.toString()} hint="断链或缺失路径" />
          </section>
        ) : null}

        <section className={activeSection === "overview" ? "dashboard-grid overview-grid" : `dashboard-grid page-grid ${activeSection}-page`}>
          {activeSection === "overview" || activeSection === "projects" ? (
          <section className="folio-card project-workbench" ref={projectConsoleRef}>
            <PanelHeader
              action={<Plus size={18} />}
              actionDisabled={busy}
              actionLabel="新建项目"
              eyebrow="项目"
              onAction={focusProjectCreator}
              title="项目库"
            />

            <div className="project-workbench-grid">
              <aside className="project-rail" aria-label="项目列表">
                <div className="create-docket">
                  <input
                    aria-label="新项目名称"
                    autoComplete="off"
                    name="project-name"
                    ref={projectNameRef}
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    placeholder="新项目名称…"
                  />
                  <input aria-label="项目截止日期" autoComplete="off" name="project-deadline" value={deadline} onChange={(event) => setDeadline(event.target.value)} type="date" />
                  <button className="dark-button" onClick={createProject} disabled={busy}>
                    <Plus size={15} />
                    创建项目
                  </button>
                </div>

                <div className="project-list">
                  {data.projects.length === 0 ? (
                    <EmptyState title="新建第一个项目" body="创建项目后会自动生成标准目录，并把关联素材沉淀到项目维度里。">
                      <button className="empty-action-button" onClick={focusProjectCreator} type="button">
                        <Plus size={14} />
                        新建项目
                      </button>
                    </EmptyState>
                  ) : (
                    data.projects.map((project, index) => {
                      const isSelected = selectedProjectId === project.id;
                      return (
                      <article
                        aria-current={isSelected ? "true" : undefined}
                        className={`project-row ${isSelected ? "selected" : ""}`}
                        key={project.id}
                      >
                        <button
                          aria-pressed={isSelected}
                          className="project-select-area"
                          onClick={() => selectProject(project.id)}
                          type="button"
                        >
                          {coverUrlById.get(project.id) ? (
                            <img className="project-cover-thumb" src={coverUrlById.get(project.id)} alt="封面" />
                          ) : (
                            <span className={`status-dot ${statusTone[project.status]}`} aria-hidden="true" />
                          )}
                          <div className="project-main">
                            <h3>{project.name}</h3>
                            <p>{project.deadline ? `截止 ${formatDate(project.deadline)}` : "未设置截止日期"}</p>
                          </div>
                          <span className="project-asset-count">
                            <strong>{projectAssetCounts.get(project.id) ?? 0}</strong>
                            素材
                          </span>
                        </button>
                        <select
                          aria-label={`${project.name} 项目状态`}
                          value={project.status}
                          onChange={(event) => updateProjectStatus(project, event.target.value as ProjectStatus)}
                          className={`status-select ${statusTone[project.status]}`}
                        >
                          {Object.entries(statusLabel).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <button aria-label={`打开 ${project.name} 文件夹`} className="icon-command" onClick={(event) => { event.stopPropagation(); openProject(project); }} title="打开文件夹">
                          <FolderOpen size={15} />
                        </button>
                      </article>
                      );
                    })
                  )}
                </div>
              </aside>

              <section className="project-detail" aria-label="当前项目详情">
                {selectedProject ? (
                  <>
                    <div className="project-detail-head">
                      <div className="project-title-block">
                        <span className={`badge ${statusTone[selectedProject.status]}`}>{statusLabel[selectedProject.status]}</span>
                        <h2>{selectedProject.name}</h2>
                        <p>{selectedProject.rootPath}</p>
                      </div>
                      <div className="project-detail-actions">
                        <button className="dark-button" onClick={() => importAssets("project")} disabled={busy || !selectedProject}>
                          <Link2 size={15} />
                          关联素材
                        </button>
                        <button className="quiet-button" onClick={() => openProject(selectedProject)}>
                          <FolderOpen size={15} />
                          打开目录
                        </button>
                        <button className="quiet-button" onClick={exportProjectCsv} disabled={busy}>
                          <FileDown size={15} />
                          导出清单
                        </button>
                      </div>
                    </div>

                    <div className="project-facts">
                      <MiniStat label="已关联素材" value={selectedProjectAssetCount.toString()} />
                      <MiniStat label="创建时间" value={formatDateTime(selectedProject.createdAt)} />
                      <MiniStat label="修改时间" value={formatDateTime(selectedProject.updatedAt)} />
                      <MiniStat label="最近打开" value={selectedProject.lastOpenedAt ? formatDateTime(selectedProject.lastOpenedAt) : "-"} />
                    </div>

                    <div className="project-notes-section">
                      <div className="project-notes-head">
                        <StickyNote size={13} />
                        <span>项目备注</span>
                      </div>
                      <textarea
                        aria-label="项目备注"
                        className="project-notes-input"
                        value={projectNotes}
                        onChange={(e) => setProjectNotes(e.target.value)}
                        onBlur={saveProjectNotes}
                        placeholder="记录项目细节、参考链接或注意事项…"
                        rows={3}
                      />
                    </div>

                    <div className="project-assets-panel" data-asset-zoom-surface="true">
                      <div className="project-assets-header">
                        <div>
                          <span>项目素材</span>
                          <h3>当前项目素材</h3>
                        </div>
                        <button className="quiet-button" onClick={showCurrentProjectAssets}>
                          <Eye size={15} />
                          素材控制台
                        </button>
                      </div>

                      {selectedProjectAssets.length === 0 ? (
                        <EmptyState title="当前项目还没有关联素材" body="点击关联素材，选择本地文件或文件夹后会以原路径进入项目，不复制文件。" />
                      ) : (
                        <>
                          <div className="project-type-strip" aria-label="项目素材类型统计">
                            {assetTypes
                              .filter((type): type is AssetType => type !== "all")
                              .filter((type) => selectedProjectTypeCounts.has(type))
                              .map((type) => (
                                <span key={type}>
                                  {typeLabel[type]}
                                  <strong>{selectedProjectTypeCounts.get(type)}</strong>
                                </span>
                              ))}
                          </div>
                          <div className="project-asset-grid" style={{ "--asset-card-min": `${assetCardMin}px` } as CSSProperties}>
                            {projectPreviewAssets.map((asset) => (
                              <div key={asset.id} className="project-asset-with-cover">
                                <AssetCard asset={asset} onPreview={setPreviewAsset} onUnlink={unlinkAsset} projectCount={assetUsageCounts.get(asset.id) ?? 0} showPath />
                                <button
                                  className="set-cover-btn"
                                  title="设为项目封面"
                                  onClick={() => setCoverAsset(asset.id)}
                                >
                                  <Image size={11} />
                                  {selectedProject.coverAssetId === asset.id ? "当前封面" : "设为封面"}
                                </button>
                              </div>
                            ))}
                          </div>
                          {selectedProjectAssets.length > projectPreviewAssets.length ? (
                            <button className="project-more-button" onClick={showCurrentProjectAssets}>
                              还有 {selectedProjectAssets.length - projectPreviewAssets.length} 个素材，在素材控制台查看
                              <ChevronRight size={15} />
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <EmptyState title="未选择项目" body="从左侧项目库里选择一个项目，右侧会显示它的目录、时间记录和关联素材。" />
                )}
              </section>
            </div>
          </section>
          ) : null}

          {activeSection === "overview" || activeSection === "library" ? (
          <section className={`folio-card asset-console ${activeSection === "library" ? "library-mode" : "overview-mode"}`} data-asset-zoom-surface="true" ref={assetConsoleRef}>
            <PanelHeader
              action={assetScope === "project" && selectedProject ? <Link2 size={18} /> : <Import size={18} />}
              actionDisabled={busy || (assetScope === "project" && !selectedProject)}
              actionLabel={assetScope === "project" && selectedProject ? `关联素材到 ${selectedProject.name}（不复制文件）` : "关联本地素材或文件夹"}
              eyebrow="素材"
              onAction={() => importAssets(assetScope === "project" && selectedProject ? "project" : "linked")}
              title={assetScope === "project" && selectedProject ? `素材库 / ${selectedProject.name}` : "素材控制台"}
            />

            <div className="library-shell" style={{ "--library-filter-width": `${libraryFilterWidth}px` } as CSSProperties}>
              <aside className="library-filter-sidebar" aria-label="素材库筛选分类">
                <div className="library-filter-head">
                  <div>
                    <span>筛选分类</span>
                    <strong>{filteredAssets.length} 个匹配素材</strong>
                  </div>
                  <div className="filter-head-actions">
                    {smartCollection ? (
                      <button className="smart-active-chip" onClick={clearSmartCollection} type="button" title="清除智能集合">
                        <Layers size={12} />
                        {smartCollectionLabel[smartCollection]}
                        <X size={11} />
                      </button>
                    ) : null}
                    <button className="filter-reset-button" onClick={resetAssetView} type="button">
                      <RefreshCw size={13} />
                      重置
                    </button>
                  </div>
                </div>

                <div className="library-project-panel">
                  <div className="library-directory">
                    <span>当前目录</span>
                    <strong>{libraryDirectoryName}</strong>
                    <em title={libraryDirectoryPath}>{libraryDirectoryPath || "-"}</em>
                  </div>
                  <div className="project-category-head">
                    <span>项目分类</span>
                    <em>与项目库同步</em>
                  </div>
                  <div className="project-category-row" aria-label="素材库项目分类">
                    <button aria-label={`查看全部素材，${data.assets.length} 个`} aria-pressed={assetScope === "all"} className={assetScope === "all" ? "project-category active" : "project-category"} onClick={showAllAssets}>
                      <Library size={14} />
                      <span>全部素材</span>
                      <strong aria-hidden="true">{data.assets.length}</strong>
                    </button>
                    {data.projects.map((project) => {
                      const count = projectAssetCounts.get(project.id) ?? 0;
                      const isActiveProject = assetScope === "project" && selectedProjectId === project.id;
                      return (
                        <button aria-label={`查看 ${project.name} 的素材，${count} 个`} aria-pressed={isActiveProject} className={isActiveProject ? "project-category active" : "project-category"} key={project.id} onClick={() => selectProject(project.id)}>
                          <Clapperboard size={14} />
                          <span>{project.name}</span>
                          <strong aria-hidden="true">{count}</strong>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="type-filter-panel" aria-label="素材类型筛选">
                  <div className="type-filter-head">
                    <span>素材类型</span>
                    <em>
                      {typeLabel[assetFilter]}
                      {excludedAssetTypeCount > 0 ? ` / 已屏蔽 ${excludedAssetTypeCount} 类` : ""}
                    </em>
                  </div>
                  <div className="type-filter-actions">
                    <button aria-pressed={assetFilter === "all"} className={assetFilter === "all" ? "filter active" : "filter"} onClick={() => setAssetFilter("all")} type="button">
                      全部素材
                    </button>
                    {excludedAssetTypeCount > 0 ? (
                      <button className="exclude-clear" onClick={clearTypeExclusions} type="button">
                        <X size={12} />
                        清空类型屏蔽
                      </button>
                    ) : null}
                  </div>
                  <div className="type-control-list">
                    {assetTypes
                      .filter((type): type is AssetType => type !== "all")
                      .map((type) => {
                        const isSelected = assetFilter === type;
                        const isExcluded = excludedAssetTypes.has(type);
                        return (
                          <div className={`type-control ${isSelected ? "selected" : ""} ${isExcluded ? "excluded" : ""}`} key={type}>
                            <button aria-pressed={isSelected} className="type-select-button" onClick={() => setAssetFilter(type)} type="button">
                              <span>{typeLabel[type]}</span>
                            </button>
                            <button
                              aria-label={`${isExcluded ? "取消屏蔽" : "屏蔽"}${typeLabel[type]}`}
                              aria-pressed={isExcluded}
                              className="type-exclude-button"
                              onClick={() => toggleExcludedAssetType(type)}
                              type="button"
                            >
                              <EyeOff size={13} />
                              <span>{isExcluded ? "已屏蔽" : "屏蔽"}</span>
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>

                <div className="exclude-panel project-exclude-panel" aria-label="屏蔽项目筛选">
                  <div className="exclude-head">
                    <div>
                      <span>屏蔽项目</span>
                      <em>{excludedProjectCount > 0 ? `已屏蔽 ${excludedProjectCount} 个项目` : "未屏蔽项目"}</em>
                    </div>
                    {excludedProjectCount > 0 ? (
                      <button className="exclude-clear" onClick={clearProjectExclusions} type="button">
                        <X size={12} />
                        清空项目
                      </button>
                    ) : null}
                  </div>

                  <div className="exclude-chip-row">
                    {data.projects.length === 0 ? (
                      <em>暂无项目</em>
                    ) : (
                      data.projects.map((project) => {
                        const isExcluded = excludedProjectIds.has(project.id);
                        return (
                          <button aria-label={`${isExcluded ? "取消屏蔽" : "屏蔽"}${project.name} 的素材`} aria-pressed={isExcluded} className={isExcluded ? "exclude-chip excluded" : "exclude-chip"} key={project.id} onClick={() => toggleExcludedProject(project)}>
                            <EyeOff size={13} />
                            <span>{project.name}</span>
                            <strong aria-hidden="true">{projectAssetCounts.get(project.id) ?? 0}</strong>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="time-filter-panel" aria-label="素材时间筛选">
                  <div className="time-filter-head">
                    <div>
                      <CalendarClock size={14} />
                      <span>时间筛选</span>
                      <em>{assetTimeFieldLabel[assetTimeField]} / {timeFilterSummary}</em>
                    </div>
                    {hasActiveTimeFilter ? (
                      <button className="time-clear" onClick={clearTimeFilter} type="button">
                        <X size={12} />
                        清除时间
                      </button>
                    ) : null}
                  </div>

                  <div className="time-filter-controls">
                    <label className="time-field-select">
                      <span>依据</span>
                      <select value={assetTimeField} onChange={(event) => setAssetTimeField(event.target.value as AssetTimeField)}>
                        <option value="createdAt">入库时间</option>
                        <option value="fileModifiedAt">文件修改时间</option>
                      </select>
                    </label>

                    <div className="time-preset-row">
                      {assetTimePresets.map((preset) => (
                        <button
                          aria-pressed={assetTimePreset === preset.value}
                          className={assetTimePreset === preset.value ? "time-preset active" : "time-preset"}
                          key={preset.value}
                          onClick={() => setAssetTimePreset(preset.value)}
                          type="button"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    {assetTimePreset === "custom" ? (
                      <div className="date-range-row">
                        <label>
                          <span>开始</span>
                          <input aria-label="开始日期" type="date" value={assetDateFrom} onChange={(event) => setAssetDateFrom(event.target.value)} />
                        </label>
                        <label>
                          <span>结束</span>
                          <input aria-label="结束日期" type="date" value={assetDateTo} onChange={(event) => setAssetDateTo(event.target.value)} />
                        </label>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="size-filter-panel" aria-label="文件大小筛选">
                  <div className="time-filter-head">
                    <div>
                      <HardDrive size={14} />
                      <span>大小筛选</span>
                      <em>{hasActiveSizeFilter ? `${assetSizeMin || "0"} ~ ${assetSizeMax || "∞"} MB` : "全部大小"}</em>
                    </div>
                    {hasActiveSizeFilter ? (
                      <button className="time-clear" onClick={() => { setAssetSizeMin(""); setAssetSizeMax(""); }} type="button">
                        <X size={12} />
                        清除
                      </button>
                    ) : null}
                  </div>
                  <div className="date-range-row">
                    <label>
                      <span>最小(MB)</span>
                      <input type="number" min="0" step="1" value={assetSizeMin} onChange={(e) => setAssetSizeMin(e.target.value)} placeholder="0" />
                    </label>
                    <label>
                      <span>最大(MB)</span>
                      <input type="number" min="0" step="1" value={assetSizeMax} onChange={(e) => setAssetSizeMax(e.target.value)} placeholder="∞" />
                    </label>
                  </div>
                </div>

                <div className="eagle-filter-panel" aria-label="Eagle 素材筛选">                  <div className="eagle-filter-head">
                    <div>
                      <Database size={14} />
                      <span>Eagle 筛选</span>
                      <em>{eagleAssets.length} 个素材 / {data.eagleFolders.length} 个文件夹 / {data.eagleTags.length} 个标签</em>
                    </div>
                    {hasActiveEagleFilter ? (
                      <button className="time-clear" onClick={clearEagleFilters} type="button">
                        <X size={12} />
                        清除 Eagle
                      </button>
                    ) : null}
                  </div>
                  <div className="eagle-filter-controls">
                    <label>
                      <span>来源</span>
                      <select value={assetSourceFilter} onChange={(event) => setAssetSourceFilter(event.target.value as AssetSourceFilter)}>
                        {(["all", "local", "eagle"] as AssetSourceFilter[]).map((source) => (
                          <option key={source} value={source}>
                            {assetSourceLabel[source]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>文件夹</span>
                      <select value={eagleFolderFilter} onChange={(event) => setEagleFolderFilter(event.target.value)} disabled={data.eagleFolders.length === 0}>
                        <option value="all">全部 Eagle 文件夹</option>
                        {eagleFolderOptions.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {(folder.path || folder.name)} ({folder.assetCount})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>标签</span>
                      <select value={eagleTagFilter} onChange={(event) => setEagleTagFilter(event.target.value)} disabled={data.eagleTags.length === 0}>
                        <option value="all">全部标签</option>
                        {eagleTagOptions.slice(0, 160).map((tag) => (
                          <option key={tag.id} value={tag.id}>
                            {tag.name} ({tag.assetCount})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>评分</span>
                      <select value={eagleRatingFilter} onChange={(event) => setEagleRatingFilter(event.target.value as EagleRatingFilter)}>
                        {eagleRatingOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>状态</span>
                      <select value={eagleStatusFilter} onChange={(event) => setEagleStatusFilter(event.target.value as EagleStatusFilter)}>
                        {(["all", "active", "missing", "broken", "unavailable"] as EagleStatusFilter[]).map((status) => (
                          <option key={status} value={status}>
                            {eagleStatusLabel[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </aside>

              <button
                aria-label="调整素材筛选栏宽度"
                aria-orientation="vertical"
                aria-valuemax={maxLibraryFilterWidth}
                aria-valuemin={minLibraryFilterWidth}
                aria-valuenow={libraryFilterWidth}
                className="library-filter-resize-handle"
                onDoubleClick={resetLibraryFilterWidth}
                onKeyDown={resizeLibraryFilterWithKeyboard}
                onPointerDown={beginLibraryFilterResize}
                role="separator"
                title="拖拽调整素材筛选栏宽度，双击恢复默认"
                type="button"
              />

              <section className="library-content" aria-label="素材结果">
                {selectedAssetIds.size > 0 ? (
                  <div className="batch-toolbar">
                    <span>
                      <CheckSquare size={14} />
                      已选 {selectedAssetIds.size} 个
                    </span>
                    <button onClick={selectAllVisible} type="button" title="全选当前页">全选</button>
                    <button onClick={clearSelection} type="button" title="取消选择">取消</button>
                    <div className="batch-tag-row">
                      <input
                        value={batchTagInput}
                        onChange={(e) => setBatchTagInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && batchTagSelected()}
                        placeholder="批量添加标签…"
                      />
                      <button onClick={batchTagSelected} disabled={!batchTagInput.trim() || busy} type="button">
                        <Tags size={13} />
                      </button>
                    </div>
                    <button className="danger-action" onClick={batchUnlinkSelected} disabled={busy} type="button">
                      <Link2Off size={14} />
                      批量取消关联
                    </button>
                  </div>
                ) : null}
                <div className="toolbar">
                  <div className="search-box" style={{ position: "relative" }}>
                    <Search size={17} />
                    <input
                      aria-label="搜索文件名、路径、Eagle 标签或备注"
                      autoComplete="off"
                      name="asset-search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      onFocus={() => setShowSearchHistory(true)}
                      onBlur={() => setTimeout(() => setShowSearchHistory(false), 150)}
                      onKeyDown={(e) => { if (e.key === "Enter" && search.trim()) { addToSearchHistory(search.trim()); setShowSearchHistory(false); } }}
                      placeholder="搜索文件名或路径…"
                    />
                    {search ? (
                      <button style={{ background: "none", border: "none", cursor: "pointer", padding: "0 4px", color: "var(--text-muted)" }} onClick={() => applySearch("")} title="清除搜索">
                        <X size={13} />
                      </button>
                    ) : null}
                    {showSearchHistory && searchHistory.length > 0 ? (
                      <div className="search-history-dropdown">
                        {searchHistory.map((term, i) => (
                          <button key={i} className="search-history-item" onMouseDown={() => applySearch(term)}>
                            <Clock3 size={12} />
                            <span>{term}</span>
                          </button>
                        ))}
                        <button className="search-history-clear" onMouseDown={() => setSearchHistory([])}>
                          <X size={11} />
                          清除历史
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="sort-control" aria-label="素材时间排序">
                    <ArrowUpDown size={15} />
                    <select aria-label="素材排序字段" value={assetSortField} onChange={(event) => setAssetSortField(event.target.value as AssetTimeField)}>
                      <option value="createdAt">按入库时间</option>
                      <option value="fileModifiedAt">按修改时间</option>
                    </select>
                    <button
                      aria-label={assetSortDirection === "desc" ? "切换为正序" : "切换为倒序"}
                      onClick={() => setAssetSortDirection((current) => (current === "desc" ? "asc" : "desc"))}
                      title={assetSortDirection === "desc" ? "当前倒序，点击切换正序" : "当前正序，点击切换倒序"}
                      type="button"
                    >
                      {assetSortDirection === "desc" ? "倒序" : "正序"}
                    </button>
                  </div>
                  <div className="zoom-control" aria-label="素材浏览缩放">
                    <button aria-label="缩小素材卡片" onClick={() => changeAssetZoom(assetZoom - zoomStep)} disabled={assetZoom <= minZoom} title="缩小">
                      <ZoomOut size={15} />
                    </button>
                    <input
                      aria-label="素材卡片缩放"
                      max={maxZoom}
                      min={minZoom}
                      onChange={(event) => changeAssetZoom(Number(event.target.value))}
                      step={zoomStep}
                      type="range"
                      value={assetZoom}
                    />
                    <button aria-label="放大素材卡片" onClick={() => changeAssetZoom(assetZoom + zoomStep)} disabled={assetZoom >= maxZoom} title="放大">
                      <ZoomIn size={15} />
                    </button>
                    <span>{assetZoom}%</span>
                  </div>
                </div>

                <div
                  className={filteredAssets.length === 0 ? "asset-grid is-empty" : "asset-grid"}
                  ref={gridRef}
                  style={{ "--asset-card-min": `${assetCardMin}px` } as CSSProperties}
                >
                  {filteredAssets.length === 0 ? (
                    <EmptyState title={emptyAssetTitle} body={emptyAssetBody}>
                      {showAssetEmptyActions ? (
                        <div className="empty-actions">
                          <button className="empty-action-button" onClick={() => importAssets("linked")} type="button" disabled={busy}>
                            <Import size={14} />
                            导入本地素材
                          </button>
                          <button className="empty-action-button secondary" onClick={syncEagleLibrary} type="button" disabled={busy}>
                            <Database size={14} />
                            同步 Eagle
                          </button>
                        </div>
                      ) : null}
                    </EmptyState>
                  ) : (
                    visibleAssets.map((asset) => (
                      <AssetCard asset={asset} key={asset.id} onPreview={previewAssetFromCard} onUnlink={unlinkAsset} onRelink={relinkAsset} onToggleSelect={toggleAssetSelect} isSelected={selectedAssetIds.has(asset.id)} projectCount={assetUsageCounts.get(asset.id) ?? 0} showPath={assetScope === "project"} />
                    ))
                  )}
                </div>
                {filteredAssets.length > 0 ? (
                  <div className="auto-load-sentinel" ref={loadMoreRef}>
                    {filteredAssets.length > visibleAssets.length
                      ? `继续向下滑动自动加载 (${visibleAssets.length} / ${filteredAssets.length})`
                      : `已显示全部素材 (${filteredAssets.length})`}
                  </div>
                ) : null}
              </section>
            </div>
          </section>
          ) : null}

          {activeSection === "overview" || activeSection === "settings" ? (
          <section className="folio-card settings-console" ref={settingsRef}>
            <PanelHeader
              action={<Settings2 size={18} />}
              actionDisabled={busy}
              actionLabel="刷新设置数据"
              eyebrow="设置"
              onAction={() => refresh()}
              title="设置与维护"
            />
            <div className="settings-grid">
              <section className="settings-group">
                <div className="settings-group-head">
                  <HardDrive size={16} />
                  <h3>路径快捷入口</h3>
                </div>
                <div className="settings-actions">
                  <button className="setting-action" onClick={() => openSystemPath(data.workspaceRoot, "工作区")}>
                    <FolderOpen size={15} />
                    <span>工作区</span>
                    <em>{shortPath(data.workspaceRoot)}</em>
                  </button>
                  <button className="setting-action" onClick={() => openSystemPath(data.libraryRoot, "素材库目录")}>
                    <Library size={15} />
                    <span>素材库</span>
                    <em>{shortPath(data.libraryRoot)}</em>
                  </button>
                  <button className="setting-action" onClick={() => openSystemPath(data.projectsRoot, "项目库目录")}>
                    <Clapperboard size={15} />
                    <span>项目库</span>
                    <em>{shortPath(data.projectsRoot)}</em>
                  </button>
                  <button className="setting-action" onClick={() => openSystemPath(data.cacheRoot, "缓存目录")}>
                    <Database size={15} />
                    <span>缓存</span>
                    <em>{shortPath(data.cacheRoot)}</em>
                  </button>
                </div>
              </section>

              <section className="settings-group eagle-settings-group">
                <div className="settings-group-head">
                  <Database size={16} />
                  <h3>Eagle 只读联动</h3>
                </div>
                <div className="eagle-sync-summary">
                  <MiniStat label="Eagle 素材" value={`${eagleAssets.length}`} />
                  <MiniStat label="文件夹 / 标签" value={`${data.eagleFolders.length}/${data.eagleTags.length}`} />
                </div>
                <div className="eagle-source-card">
                  <div>
                    <strong>{primaryEagleSource?.name ?? "未关联 Eagle 库"}</strong>
                    <span>{primaryEagleSource?.libraryPath ?? "可连接 Eagle 本地 API，或选择 .library 目录只读同步"}</span>
                  </div>
                  <em>{primaryEagleSource?.lastSyncAt ? `上次同步 ${formatDateTime(primaryEagleSource.lastSyncAt)}` : "只同步到本系统，不写回 Eagle"}</em>
                </div>
                <div className="settings-actions two-up">
                  <button className="setting-action" onClick={checkEagleConnection} disabled={busy}>
                    <Wifi size={15} />
                    <span>检测 Eagle</span>
                    <em>本地 API</em>
                  </button>
                  <button className="setting-action" onClick={selectEagleLibrary} disabled={busy}>
                    <FolderOpen size={15} />
                    <span>选择库</span>
                    <em>.library</em>
                  </button>
                  <button className="setting-action strong" onClick={syncEagleLibrary} disabled={busy}>
                    <RefreshCw size={15} />
                    <span>立即同步</span>
                    <em>{primaryEagleSource ? "当前库" : "API 或目录"}</em>
                  </button>
                  <button className="setting-action danger-lite" onClick={unlinkEagleSource} disabled={busy || !primaryEagleSource}>
                    <Link2Off size={15} />
                    <span>取消关联</span>
                    <em>{primaryEagleSource ? primaryEagleSource.assetCount : "无来源"}</em>
                  </button>
                </div>
                {lastEagleRun ? (
                  <div className={`eagle-run-log ${lastEagleRun.status}`}>
                    <span>{lastEagleRun.status === "success" ? "同步成功" : lastEagleRun.status === "partial" ? "部分同步" : "同步失败"}</span>
                    <p>{lastEagleRun.message}</p>
                    <em>
                      新增 {lastEagleRun.addedCount} / 更新 {lastEagleRun.updatedCount} / 缺失 {lastEagleRun.missingCount}
                    </em>
                  </div>
                ) : null}
              </section>

              <section className="settings-group">
                <div className="settings-group-head">
                  <RefreshCw size={16} />
                  <h3>索引维护</h3>
                </div>
                <div className="settings-actions two-up">
                  <button className="setting-action strong" onClick={rescanAssets} disabled={busy}>
                    <RefreshCw size={15} />
                    <span>重新扫描</span>
                    <em>{data.watchedFolders.length + 2} 个根目录</em>
                  </button>
                  <button className="setting-action" onClick={markMissingAssets} disabled={busy}>
                    <AlertTriangle size={15} />
                    <span>检测失效</span>
                    <em>{brokenAssetCount} 个已标记</em>
                  </button>
                  <button className="setting-action danger-lite" onClick={pruneMissingAssets} disabled={busy}>
                    <Trash2 size={15} />
                    <span>清理记录</span>
                    <em>移除断链素材</em>
                  </button>
                </div>
              </section>

              <section className="settings-group">
                <div className="settings-group-head">
                  <Settings2 size={16} />
                  <h3>浏览偏好</h3>
                </div>
                <div className="settings-summary">
                  <MiniStat label="当前缩放" value={`${assetZoom}%`} />
                  <MiniStat label="可见素材" value={`${visibleAssets.length}/${filteredAssets.length}`} />
                </div>
                <button className="setting-action strong" onClick={resetAssetView}>
                  <ZoomOut size={15} />
                  <span>恢复默认浏览</span>
                  <em>全部 / 100%</em>
                </button>
              </section>
            </div>
          </section>
          ) : null}

          {activeSection === "overview" || activeSection === "daily" ? (
          <aside className="inspector-stack">
            <section className="folio-card daily-card" ref={dailyCardRef}>
              <PanelHeader eyebrow="今日" title="入库热力" action={<Activity size={18} />} />
              <div className="today-number">
                <strong>{todayStats.totalCount}</strong>
                <span>今日新增素材</span>
              </div>
              <div className="type-breakdown">
                <StatLine label="图片" value={todayStats.imageCount} />
                <StatLine label="视频" value={todayStats.videoCount} />
                <StatLine label="人物" value={todayStats.characterCount} />
                <StatLine label="参考" value={todayStats.referenceCount} />
                <StatLine label="AE" value={todayStats.aeCount} />
                <StatLine label="其他" value={todayStats.otherCount} />
              </div>
              <div className="bar-chart">
                {recentStats.map((item) => (
                  <div
                    className={item.date === todayStats.date ? "bar-item is-today" : "bar-item"}
                    key={item.date}
                    title={`${item.date} 新增 ${item.totalCount} 个素材`}
                  >
                    <strong>{item.totalCount}</strong>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ height: `${Math.max(6, (item.totalCount / recentMaxCount) * 96)}px` }} />
                    </div>
                    <time>{item.date.slice(5).replace("-", "/")}</time>
                  </div>
                ))}
              </div>
            </section>

            <section className="folio-card sync-card">
              <PanelHeader eyebrow="同步" title="路径与同步" action={<Wifi size={18} />} />
              <PathBox label="Workspace" value={data.workspaceRoot || "-"} />
              <PathBox label="Library" value={data.libraryRoot || "-"} />
              <PathBox label="Projects" value={data.projectsRoot || "-"} />
              <div className="linked-folder-section">
                <div className="linked-folder-head">
                  <span>外部文件夹</span>
                  <strong>{data.watchedFolders.length}</strong>
                </div>
                {data.watchedFolders.length === 0 ? (
                  <p className="linked-folder-empty">暂无外部关联文件夹</p>
                ) : (
                  <div className="linked-folder-list">
                    {data.watchedFolders.map((folderPath) => (
                      <article className="linked-folder-card" key={folderPath}>
                        <div>
                          <FolderOpen size={14} />
                          <p title={folderPath}>{folderPath}</p>
                        </div>
                        <button onClick={() => unlinkWatchedFolder(folderPath)} disabled={busy}>
                          <Link2Off size={13} />
                          取消关联
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>
              <div aria-live="polite" className="status-line" role="status">{message}</div>
            </section>
          </aside>
          ) : null}
        </section>
      </section>

      {previewAsset ? <PreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} references={previewAssetReferences} /> : null}
    </main>
  );

  async function unlinkWatchedFolder(folderPath: string) {
    if (!desktopApi) return;
    const confirmed = window.confirm(`取消关联这个文件夹？\n${folderPath}\n\n本地文件不会被删除，该文件夹下的素材记录会从系统移除。`);
    if (!confirmed) return;

    setBusy(true);
    try {
      const result = await desktopApi.unlinkWatchedFolder(folderPath);
      setMessage(`已取消关联文件夹: ${getFileName(result.folderPath)}，移除 ${result.removedCount} 个素材记录`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "取消文件夹关联失败");
    } finally {
      setBusy(false);
    }
  }
}

function NavItem({ active, icon, label, meta, onClick }: { active?: boolean; icon: ReactNode; label: string; meta?: string; onClick: () => void }) {
  return (
    <button aria-current={active ? "page" : undefined} aria-label={label} className={active ? "nav-item active" : "nav-item"} onClick={onClick} type="button">
      {icon}
      <span>{label}</span>
      {meta ? <strong aria-hidden="true">{meta}</strong> : null}
    </button>
  );
}

function SmartCollectionButton({
  active,
  count,
  icon,
  label,
  onClick
}: {
  active: boolean;
  count: number;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button aria-pressed={active} className={active ? "smart-collection active" : "smart-collection"} onClick={onClick} type="button">
      {icon}
      <span>{label}</span>
      <strong>{count}</strong>
    </button>
  );
}

function PanelHeader({
  action,
  actionDisabled,
  actionLabel,
  eyebrow,
  onAction,
  title
}: {
  action: ReactNode;
  actionDisabled?: boolean;
  actionLabel?: string;
  eyebrow: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <header className="panel-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {onAction ? (
        <button aria-label={actionLabel ?? title} className="panel-action panel-action-button" disabled={actionDisabled} onClick={onAction} title={actionLabel}>
          {action}
        </button>
      ) : (
        <div aria-hidden="true" className="panel-action">
          {action}
        </div>
      )}
    </header>
  );
}

function MetricCard({ hint, icon, label, value }: { hint: string; icon: ReactNode; label: string; value: string }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <em>{hint}</em>
      </div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PathBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="path-box">
      <span>{label}</span>
      <p>{value}</p>
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const AssetCard = memo(function AssetCard({
  asset,
  onPreview,
  onUnlink,
  onRelink,
  onToggleSelect,
  isSelected,
  projectCount = 0,
  showPath
}: {
  asset: Asset;
  onPreview: (asset: Asset) => void;
  onUnlink: (asset: Asset) => void;
  onRelink?: (asset: Asset) => void;
  onToggleSelect?: (id: string) => void;
  isSelected?: boolean;
  projectCount?: number;
  showPath?: boolean;
}) {
  const isImage = asset.type === "image" || asset.type === "character" || asset.type === "reference";
  const isVideo = asset.type === "video";
  const url = safeAssetUrl(asset.path);
  const posterUrl = asset.thumbnailPath ? safeAssetUrl(asset.thumbnailPath) : "";
  const source = asset.source ?? "local";
  const primaryFolder = asset.eagleFolderNames?.[0];
  const primaryTags = asset.tags?.slice(0, 2) ?? [];

  const isMissingLocal = isBrokenAsset(asset);

  return (
    <article className={`asset-card ${isSelected ? "is-selected" : ""} ${isMissingLocal ? "is-missing" : ""}`}>
      {onToggleSelect ? (
        <button className="asset-checkbox" aria-label="选择此素材" aria-pressed={isSelected} onClick={() => onToggleSelect(asset.id)} type="button">
          {isSelected ? <CheckSquare size={15} /> : <div className="asset-checkbox-empty" />}
        </button>
      ) : null}
      <button
        aria-label={`${isVideo ? "播放预览" : "预览"} ${asset.name}`}
        className={`asset-preview ${isImage ? "image-surface" : ""} ${isVideo ? "video-surface" : ""}`}
        onClick={() => onPreview(asset)}
      >
        {isImage && url ? <ImagePreview src={url} name={asset.name} /> : null}
        {isVideo && url ? <VideoPreview src={url} poster={posterUrl} name={asset.name} /> : null}
        {(isImage || isVideo) && !url ? (
          <div className="preview-fallback">
            {isVideo ? <Video size={28} /> : <Image size={28} />}
            <span>请用桌面版预览</span>
          </div>
        ) : null}
        {!isImage && !isVideo ? (
          <div className={`file-preview ${asset.type}-file-preview`}>
            {asset.type === "ae" ? <Clapperboard size={32} /> : <FileText size={32} />}
          </div>
        ) : null}
        <span className="asset-preview-cta">
          {isVideo ? <Play size={14} /> : <Eye size={14} />}
          <span>{isVideo ? "播放" : "预览"}</span>
        </span>
      </button>
      <div className="asset-body">
        <div className="asset-title-row">
          <span className={source === "eagle" ? "asset-type eagle-type" : "asset-type"}>
            {source === "eagle" ? `Eagle / ${typeLabel[asset.type]}` : typeLabel[asset.type]}
          </span>
          <h3 title={asset.name}>{asset.name}</h3>
          <span className="asset-size">{formatSize(asset.fileSize)}</span>
        </div>
        {source === "eagle" ? (
          <div className="asset-meta-row" title={[primaryFolder, ...(asset.tags ?? [])].filter(Boolean).join(" / ")}>
            {asset.rating ? (
              <span>
                <Star size={11} />
                {asset.rating}
              </span>
            ) : null}
            {primaryFolder ? (
              <span>
                <FolderOpen size={11} />
                {primaryFolder}
              </span>
            ) : null}
            {primaryTags.map((tag) => (
              <span key={tag}>
                <Tags size={11} />
                {tag}
              </span>
            ))}
            {asset.sourceStatus && asset.sourceStatus !== "active" ? <span className="asset-status-warn">{eagleStatusLabel[asset.sourceStatus]}</span> : null}
          </div>
        ) : null}
        {projectCount > 0 ? (
          <div className="asset-meta-row asset-reference-row">
            <span>
              <Link2 size={11} />
              被 {projectCount} 个项目引用
            </span>
          </div>
        ) : null}
        {showPath ? (
          <p className="asset-path" title={asset.path}>
            <FolderOpen size={12} />
            <span>{asset.path}</span>
          </p>
        ) : null}
        {isMissingLocal ? <span className="asset-missing-badge"><AlertTriangle size={11} />{asset.sourceStatus === "broken" ? "断链" : "文件缺失"}</span> : null}
        <div className="asset-actions">
          <button aria-label="打开素材" onClick={() => window.aeManager?.openAsset(asset.id)} title="打开素材">
            {asset.type === "video" ? <Play size={14} /> : <Eye size={14} />}
          </button>
          <button aria-label="定位文件" onClick={() => window.aeManager?.revealAsset(asset.id)} title="定位文件">
            <FolderOpen size={14} />
          </button>
          {isMissingLocal && onRelink ? (
            <button aria-label="修复断链" className="relink-action" onClick={() => onRelink(asset)} title="重新选择文件路径">
              <Link2 size={14} />
            </button>
          ) : null}
          <button aria-label="取消关联" className="danger-action" onClick={() => onUnlink(asset)} title="取消关联">
            <Link2Off size={14} />
          </button>
        </div>
      </div>
    </article>
  );
});

function PreviewModal({ asset, onClose, references }: { asset: Asset; onClose: () => void; references: AssetProjectReference[] }) {
  const url = safeAssetUrl(asset.path);
  const posterUrl = asset.thumbnailPath ? safeAssetUrl(asset.thumbnailPath) : "";
  const isImage = asset.type === "image" || asset.type === "character" || asset.type === "reference";
  const isVideo = asset.type === "video";

  return (
    <div className="preview-modal" onClick={onClose}>
      <section className="preview-dialog" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>{asset.name}</strong>
            <span>{asset.path}</span>
          </div>
          <button onClick={onClose}>
            <X size={15} />
            关闭
          </button>
        </header>
        <div className={`preview-stage ${isImage ? "image-surface" : ""}`}>
          {isImage && url ? <img src={url} alt={asset.name} /> : null}
          {isVideo && url ? <video src={url} poster={posterUrl || undefined} controls autoPlay muted loop playsInline /> : null}
          {!isImage && !isVideo ? <div className="preview-fallback">该文件类型暂无内嵌预览</div> : null}
        </div>
        <section className="asset-reference-panel" aria-label="素材引用项目">
          <div className="asset-reference-head">
            <Link2 size={14} />
            <span>被以下项目引用</span>
            <strong>{references.length}</strong>
          </div>
          {references.length === 0 ? (
            <p className="asset-reference-empty">尚未关联到任何项目。</p>
          ) : (
            <div className="asset-reference-list">
              {references.map((reference) => (
                <article className="asset-reference-item" key={`${reference.project.id}:${reference.usageType}:${reference.createdAt}`}>
                  <span className={`status-dot ${statusTone[reference.project.status]}`} aria-hidden="true" />
                  <div>
                    <strong>{reference.project.name}</strong>
                    <em>
                      {statusLabel[reference.project.status]} / {typeLabel[(reference.usageType as AssetType) ?? "misc"] ?? reference.usageType} / {formatDate(reference.createdAt)}
                    </em>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

const ImagePreview = memo(function ImagePreview({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="preview-fallback">
        <Image size={28} />
        <span>图片预览失败</span>
      </div>
    );
  }

  return <img src={src} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
});

const VideoPreview = memo(function VideoPreview({ src, poster, name }: { src: string; poster?: string; name: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const play = () => {
    setIsPlaying(true);
    videoRef.current?.play().catch(() => undefined);
  };

  const pause = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    video.pause();
    try {
      video.currentTime = Number.isFinite(video.duration) ? Math.min(0.1, Math.max(video.duration / 20, 0.04)) : 0.08;
    } catch {
      // Leave unsupported codecs at their current frame.
    }
    setIsPlaying(false);
  };

  if (failed) {
    return (
      <div className="preview-fallback">
        <Video size={28} />
        <span>视频预览失败</span>
      </div>
    );
  }

  return (
    <div className="video-preview-wrapper" onMouseEnter={play} onMouseLeave={pause}>
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        title={name}
        muted
        loop
        playsInline
        preload="metadata"
        onCanPlay={() => {
          if (isPlaying) play();
        }}
        onLoadedMetadata={() => {
          const video = videoRef.current;
          if (!video || poster) return;
          const frameTime = Number.isFinite(video.duration) ? Math.min(0.1, Math.max(video.duration / 20, 0.04)) : 0.08;
          try {
            video.currentTime = frameTime;
          } catch {
            // Some containers/codecs do not support seeking before enough data is available.
          }
        }}
        onError={() => setFailed(true)}
      />
      {poster && !isPlaying ? <img className="video-poster" src={poster} alt={name} loading="lazy" decoding="async" /> : null}
      {!isPlaying ? (
        <span className="video-play-badge">
          <Play size={18} />
        </span>
      ) : null}
    </div>
  );
});

function EmptyState({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <ListChecks size={28} />
      <h3>{title}</h3>
      <p>{body}</p>
      {children}
    </div>
  );
}

function createEmptyStats(date: string): DailyAssetStats {
  return {
    id: date,
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
    createdAt: date,
    updatedAt: date
  };
}

function matchesSmartCollectionFilter(
  asset: Asset,
  collection: SmartCollectionId,
  context: {
    assetProjectIds: Map<string, Set<string>>;
    frequentAssetIds: Set<string>;
    recentCollectionStart: number;
  }
) {
  if (collection === "recent") return isRecentAsset(asset, context.recentCollectionStart);
  if (collection === "highRated") return (asset.rating ?? 0) >= 4;
  if (collection === "unassigned") return !context.assetProjectIds.get(asset.id)?.size;
  if (collection === "broken") return isBrokenAsset(asset);
  return context.frequentAssetIds.has(asset.id);
}

function isRecentAsset(asset: Asset, startTime: number) {
  const createdAt = new Date(asset.createdAt).getTime();
  return Number.isFinite(createdAt) && createdAt >= startTime;
}

function isBrokenAsset(asset: Asset) {
  return asset.sourceStatus === "broken" || asset.sourceStatus === "missing";
}

function isDeadlineSoon(project: Project) {
  if (!project.deadline || project.status === "finished" || project.status === "archived") return false;
  const deadline = parseDateInputEnd(project.deadline);
  if (deadline === undefined) return false;
  const now = Date.now();
  const threeDays = 3 * 24 * 60 * 60 * 1000;
  return deadline >= now && deadline <= now + threeDays;
}

function resolveAssetTimeRange(preset: AssetTimePreset, from: string, to: string) {
  const today = new Date();
  const todayStart = startOfLocalDay(today);
  const todayEnd = endOfLocalDay(today);

  if (preset === "today") {
    return { from: todayStart.getTime(), to: todayEnd.getTime() };
  }

  if (preset === "7d" || preset === "30d") {
    const days = preset === "7d" ? 7 : 30;
    const start = new Date(todayStart);
    start.setDate(start.getDate() - (days - 1));
    return { from: start.getTime(), to: todayEnd.getTime() };
  }

  if (preset === "custom") {
    const fromTime = from ? parseDateInputStart(from) : undefined;
    const toTime = to ? parseDateInputEnd(to) : undefined;
    if (fromTime === undefined && toTime === undefined) return null;
    if (fromTime !== undefined && toTime !== undefined) {
      return {
        from: Math.min(fromTime, toTime),
        to: Math.max(fromTime, toTime)
      };
    }
    return { from: fromTime, to: toTime };
  }

  return null;
}

function isAssetInsideTimeRange(asset: Asset, field: AssetTimeField, range: { from?: number; to?: number } | null) {
  if (!range) return true;
  const time = new Date(asset[field]).getTime();
  if (!Number.isFinite(time)) return false;
  if (range.from !== undefined && time < range.from) return false;
  if (range.to !== undefined && time > range.to) return false;
  return true;
}

function matchesRatingFilter(rating: number | undefined, filter: EagleRatingFilter) {
  if (filter === "all") return true;
  if (filter === "rated") return (rating ?? 0) > 0;
  return (rating ?? 0) >= Number(filter);
}


function formatTimeFilterSummary(preset: AssetTimePreset, from: string, to: string) {
  if (preset === "today") return "今天";
  if (preset === "7d") return "近7天";
  if (preset === "30d") return "近30天";
  if (preset === "custom") {
    if (from && to) return `${from} 至 ${to}`;
    if (from) return `${from} 之后`;
    if (to) return `${to} 之前`;
    return "自定义日期";
  }
  return "全部时间";
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function parseDateInputStart(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day).getTime();
}

function parseDateInputEnd(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatLongDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(value);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function getFileName(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function shortPath(filePath: string) {
  if (!filePath) return "-";
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return filePath;
  return `${parts[0]}/.../${parts[parts.length - 1]}`;
}

function waitForPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function safeAssetUrl(filePath: string) {
  if (!filePath) return "";

  try {
    const fromDesktop = window.aeManager?.assetUrl(filePath);
    if (fromDesktop) return fromDesktop;
  } catch {
    // Fall back below; older preload builds could fail while encoding paths.
  }

  return buildAssetUrl(filePath);
}

function buildAssetUrl(filePath: string) {
  try {
    const bytes = new TextEncoder().encode(filePath);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    const encodedPath = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    return `asset://local/${encodedPath}`;
  } catch {
    return "";
  }
}
