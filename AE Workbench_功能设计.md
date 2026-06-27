# AE Workbench 功能设计

## 目标

搭建一个本地 AE Workbench，用来统一管理人物立绘、素材库、参考图、参考视频、AE 工程文件、项目目录、项目时间信息和资产上传统计。

系统采用本地文件夹存放真实文件，SQLite 只保存索引、标签、预览图路径、关联关系和统计数据。

## 核心模块

### 1. 项目库

每个 AE 项目保存为一条项目记录，并关联本地项目文件夹。

字段建议：

```text
projects
- id
- name
- status              active / paused / finished / archived
- root_path
- cover_asset_id
- deadline
- created_at          项目创建时间
- updated_at          项目最后修改时间
- last_opened_at      最近打开时间，可选
- archived_at         归档时间，可选
```

交互建议：

- 创建项目时自动写入 `created_at` 和 `updated_at`。
- 修改项目名称、状态、封面、备注、路径或关联素材时，自动刷新 `updated_at`。
- 项目卡片显示：项目名、状态、创建时间、最后修改时间、最近打开时间。
- 项目详情页显示完整时间线。
- 支持按创建时间、修改时间、最近打开时间排序。

### 2. 项目目录模板

创建项目时自动生成标准文件夹：

```text
Project_Name/
├─ 01_AEP/
├─ 02_Footage/
├─ 03_Images/
├─ 04_Audio/
├─ 05_References/
├─ 06_Renders/
├─ 07_Delivery/
└─ 99_Archive/
```

### 3. 资产库

资产包括人物立绘、图片素材、视频素材、参考图、参考视频、音频、AE 工程、PSD、工程模板等。

字段建议：

```text
assets
- id
- name
- type                character / image / video / audio / reference / ae / psd / template / misc
- path
- thumbnail_path
- width
- height
- duration
- file_size
- hash                用于去重，可选
- created_at          资产首次导入系统时间
- updated_at          资产元数据修改时间
- file_modified_at    文件系统里的最后修改时间
```

交互建议：

- 拖入文件或文件夹后，系统扫描文件并创建资产记录。
- 图片生成缩略图。
- 视频生成封面帧和低清预览代理。
- 资产可打标签、收藏、关联项目。
- 支持按类型、标签、上传日期、文件大小、项目使用情况筛选。

### 4. 每日上传统计

每日上传统计用于查看资产库每天新增了多少内容。

推荐不要只靠实时计算，而是保留一张统计表，方便后续做图表和历史记录。

字段建议：

```text
daily_asset_stats
- id
- date                YYYY-MM-DD
- total_count         当日新增资产总数
- image_count
- video_count
- audio_count
- character_count
- reference_count
- ae_count
- total_size          当日新增资产总大小，单位 byte
- created_at
- updated_at
```

上传逻辑：

1. 用户拖入文件或导入文件夹。
2. 系统扫描并过滤已存在资产。
3. 新资产写入 `assets` 表。
4. 按当天日期更新 `daily_asset_stats`。
5. 如果同一天继续导入素材，就累加当天统计。

统计页面建议：

- 今日新增资产数量。
- 今日新增图片、视频、人物立绘、参考素材数量。
- 今日新增文件总大小。
- 最近 7 天 / 30 天上传趋势折线图。
- 按资产类型显示堆叠柱状图。
- 点击某一天，可以查看当天上传的所有素材。

### 5. 项目与资产关联

用于回答“这个素材被哪些 AE 工程用过”。

字段建议：

```text
project_assets
- project_id
- asset_id
- usage_type          character / footage / reference / audio / ae_file / render
- created_at
```

### 6. AE 工程信息导入

不要直接解析 `.aep` 文件。应在 AE 中运行 JSX 脚本导出 JSON，再由系统读取。

字段建议：

```text
ae_reports
- id
- project_id
- aep_path
- json_path
- missing_count
- comp_count
- footage_count
- created_at
```

## MVP 开发顺序

1. 搭 Electron + React + TypeScript + SQLite。
2. 实现项目创建，自动生成目录。
3. 为项目加入 `created_at`、`updated_at`、`last_opened_at`。
4. 实现资产导入和缩略图生成。
5. 实现每日上传统计。
6. 做资产库网格视图和项目详情页。
7. 做最近 7 天 / 30 天上传统计图。
8. 接入 AE JSX 工程扫描。
