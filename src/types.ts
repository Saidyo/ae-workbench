// 渲染进程使用的领域类型统一从 electron/types.ts（单一来源）再导出，
// 避免两处重复定义随时间漂移。新增/修改类型只需改 electron/types.ts。
export type {
  ProjectStatus,
  AssetType,
  AssetSource,
  AssetSourceStatus,
  EagleSyncStatus,
  Project,
  Asset,
  EagleSource,
  EagleFolder,
  EagleTag,
  EagleSyncRun,
  EagleConnectionStatus,
  DailyAssetStats,
  ProjectAsset,
  InitialData
} from "../electron/types";
