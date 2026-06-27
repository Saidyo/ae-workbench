# AE Workbench

[![CI](https://github.com/Saidyo/ae-workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/Saidyo/ae-workbench/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

AE Workbench 是一个面向 After Effects 创作者的本地桌面工作台，用来统一管理 AE 项目、人物立绘、图片素材、视频素材、音频、PSD、模板、交付文件和 Eagle 素材库信息。

它的设计目标是“本地优先”：素材仍然留在你的电脑里，系统只记录文件路径、分类、标签、时间、项目关联和预览信息，不会上传素材，也不会移动或修改 Eagle 原始文件。

![AE Workbench 界面预览](docs/images/ae-workbench-overview.png)

## 功能特性

- 创建并管理 AE 项目目录。
- 索引 `Library/`、`Projects/` 和外部关联文件夹中的本地素材。
- 在素材库中直接预览图片和视频。
- 将文件或文件夹关联到指定 AE 项目。
- 将素材导入当前项目，并按素材类型归入对应目录。
- 统计每日入库数量和最近素材增长趋势。
- 支持通过 Eagle 本地 API 或手动选择 `.library` 文件夹同步 Eagle 信息。
- Eagle 同步保持只读，不写回、不移动、不删除、不复制 Eagle 原始文件。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面端 | Electron |
| 界面 | React + TypeScript |
| 构建 | Vite |
| 本地数据 | JSON 文件索引 |
| 文件监听 | chokidar |
| 图标 | lucide-react |

## 环境要求

- Windows
- Node.js LTS
- npm
- Eagle，可选，用于 Eagle 素材库同步

## 快速开始

克隆仓库：

```powershell
git clone https://github.com/Saidyo/ae-workbench.git
cd ae-workbench
```

安装依赖：

```powershell
npm install
```

开发模式启动：

```powershell
npm run dev
```

构建桌面版本：

```powershell
npm run build
```

## Windows 一键启动

日常使用时，可以双击：

```text
一键打开AE Workbench.cmd
```

也可以双击：

```text
open-ae-workbench.cmd
```

如果是首次部署到另一台 Windows 电脑，推荐双击：

```text
一键部署并打开AE Workbench.cmd
```

部署脚本会检查 Node.js/npm、安装依赖、创建运行目录、构建应用、检测 Eagle 本地 API，并打开 AE Workbench。

## 连接 Eagle

AE Workbench 支持两种 Eagle 连接方式：

- Eagle 本地 API：`http://127.0.0.1:41595`
- 在设置页手动选择 Eagle 的 `.library` 文件夹

Eagle 同步是只读的。AE Workbench 不会修改、删除、移动或复制 Eagle 原始文件。

## 本地运行目录

以下目录会在本地生成，并且已经被 Git 忽略：

```text
Library/
Projects/
Cache/
data/
dist/
dist-electron/
node_modules/
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 和 Electron 开发环境 |
| `npm run build` | 构建 Electron 主进程和前端界面 |
| `npm run typecheck` | 运行 TypeScript 类型检查 |

## 文档

- [用户指南](docs/USER_GUIDE.md)

## 隐私说明

AE Workbench 是本地优先的桌面工具。项目与素材索引保存在你的电脑上，应用本身不提供云上传服务，也不会把本地素材发送到远程服务器。

## 开源协议

本项目使用 MIT License，详见 [LICENSE](LICENSE)。
