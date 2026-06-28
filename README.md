# AE Workbench

[![CI](https://github.com/Saidyo/ae-workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/Saidyo/ae-workbench/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

AE Workbench 是一个面向 After Effects 创作者的本地桌面工作台，也是一层轻量的「项目记忆层」：它帮你记住每个项目引用了哪些素材、哪些素材曾经用在哪些项目里，以及素材库最近发生了什么变化。

它的设计目标是“本地优先”：素材仍然留在你的电脑里，系统只记录文件路径、分类、标签、时间、项目关联和预览信息，不会上传素材，也不会移动或修改 Eagle 原始文件。

![AE Workbench 界面预览](docs/images/ae-workbench-overview.png)

## 最新版本

当前版本：`0.3.0`

Windows 用户可以直接下载 GitHub Release 中的安装器：

[下载 AE Workbench 0.3.0](https://github.com/Saidyo/ae-workbench/releases/tag/v0.3.0)

## 功能特性

- 创建并管理 AE 项目目录。
- 索引 `Library/`、`Projects/` 和外部关联文件夹中的本地素材。
- 在素材库中直接预览图片和视频，长图、竖图和横图都能完整查看。
- 将文件或文件夹关联到指定 AE 项目。
- 在素材详情中查看“被哪些项目引用”，把素材和项目关系串起来。
- 将素材导入当前项目，并按素材类型归入对应目录。
- 通过智能集合快速查看最近添加、高评分、未分配、失效和常用素材。
- 统计每日入库数量，并修复 PSD、模板、其他类型的统计守恒。
- 对本地索引做原子写入、备份回滚和断链检测，降低数据损坏风险。
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

生成 Windows 安装器：

```powershell
npm run dist:win
```

生成后可以在 `release/` 目录中找到 `AE Workbench Setup x.y.z.exe` 安装器。下载用户运行安装器后，可以从桌面快捷方式或开始菜单打开 AE Workbench。

## Windows 一键部署

如果是源码目录首次部署到另一台 Windows 电脑，推荐双击：

```text
一键部署并打开AE Workbench.cmd
```

部署脚本会检查 Node.js/npm、安装依赖、创建运行目录、构建应用、检测 Eagle 本地 API，并打开 AE Workbench。

如果下载的是 GitHub Release 中的 Windows 安装器，则不需要安装 Node.js。运行安装器后直接打开 AE Workbench 即可。

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
| `npm run dist:win` | 生成 Windows NSIS 安装器 |
| `npm run typecheck` | 运行 TypeScript 类型检查 |

## 文档

- [用户指南](docs/USER_GUIDE.md)

## 隐私说明

AE Workbench 是本地优先的桌面工具。项目与素材索引保存在你的电脑上，应用本身不提供云上传服务，也不会把本地素材发送到远程服务器。

## 开源协议

本项目使用 MIT License，详见 [LICENSE](LICENSE)。
