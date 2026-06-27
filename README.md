# AE Workbench

本地桌面工作台，用来管理 AE 项目、人物立绘、图片素材、视频素材、参考素材、Eagle 素材和每日导入统计。

## 启动

给别人首次使用，推荐双击：

```text
一键部署并打开AE Workbench.cmd
```

它会自动检查 Node.js/npm、安装依赖、构建桌面版、创建本地目录、检测 Eagle 本地 API，并打开应用。

推荐双击当前目录下的：

```text
open-ae-workbench.cmd
```

也可以双击中文快捷脚本：

```text
一键打开AE Workbench.cmd
```

也可以用命令行启动：

```bash
npm install
npm run dev
```

如果 Electron 下载很慢，可以先设置镜像后安装：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
npm install
```

## 给别人部署

1. 把整个项目文件夹交给对方，保留 `package.json`、`package-lock.json`、`electron/`、`src/`、`docs/` 和一键脚本。
2. 让对方先安装 Node.js LTS。
3. 让对方双击 `一键部署并打开AE Workbench.cmd`。
4. 首次部署会下载依赖并构建，时间会比日常启动更久。
5. 之后日常使用可以继续双击 `open-ae-workbench.cmd` 或 `一键打开AE Workbench.cmd`。

### 连接 Eagle

- Eagle 必须安装在对方电脑上，并且先打开。
- 系统会优先检测 Eagle 本地 API：`http://127.0.0.1:41595`。
- 如果 API 可用，进入“设置”后点击“检测 Eagle”，再点击“立即同步”。
- 如果 API 不可用，进入“设置”点击“选择库”，选择对方电脑上的 Eagle `.library` 目录，再点击“立即同步”。
- Eagle 同步是只读的：不会写回 Eagle，不会移动、删除或复制 Eagle 原图。

## 当前功能

- 创建 AE 项目，并自动生成标准项目目录。
- 记录项目创建时间、修改时间、最近打开时间。
- 关联本地文件或文件夹到资产库，不复制原文件。
- 导入文件或文件夹到当前项目，并按类型复制到项目对应目录。
- 监听 `Library`、`Projects` 和已关联的外部素材文件夹，新增素材会自动同步到系统索引。
- 自动按素材类型归档到人物、图片、视频、音频、参考、AE、PSD、模板等目录。
- 图片/视频在资产库中直观预览。
- 记录每日新增素材数量和文件总大小。
- 显示最近 7 天上传趋势。

## 优化重点

- Electron 主进程使用 `contextIsolation`、`sandbox` 和禁用 `nodeIntegration` 的安全边界。
- Renderer 只能通过 preload 暴露的 `window.aeManager` 调用固定 IPC 通道。
- 素材搜索使用延迟筛选，减少大素材库输入时的渲染阻塞。
- 素材卡片、图片预览和视频预览组件做了渲染隔离，视频卡片默认只加载 metadata。
- 每次交付前建议运行 `npm run typecheck` 和 `npm run build`，并用桌面/移动宽度截图检查 UI。

## 双向同步

系统会监听：

```text
Library/
Projects/
已关联的外部素材文件夹
```

同步规则：

- 在本地 `Library` 子目录中新增文件，系统会自动把它登记为资产。
- 在本地某个项目目录中新增文件，系统会自动登记为资产，并关联到该项目。
- 在系统中选择“关联本地素材”，系统只保存原文件路径，不复制文件。
- 在系统中选择“导入到当前项目”，文件会复制到当前项目对应目录。
- 删除已同步文件时，系统会移除对应资产索引。

项目目录映射：

```text
AE 工程 / 模板  -> 01_AEP
视频 / 其他     -> 02_Footage
图片 / 立绘/PSD -> 03_Images
音频            -> 04_Audio
参考图/参考视频 -> 05_References
```

## 本地目录

```text
Library/       资产库
Projects/      AE 项目目录
Cache/         缓存目录
data/          本地数据索引
```

当前版本使用 `data/app-data.json` 做本地索引，接口结构按后续 SQLite 迁移设计。
