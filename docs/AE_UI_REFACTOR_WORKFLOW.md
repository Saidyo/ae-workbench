# AE Workbench UI 重构复用流程

这份文档可以直接交给 agent 执行，也可以作为本项目后续 UI 调整的固定流程。

## 推荐调用方式

如果本地已经安装 skill，直接这样要求 agent：

```text
Use $ui-refactor-workflow to refactor the AE project management UI. Follow the workflow, preserve existing Electron/local-file behavior, verify with build and browser screenshots, then summarize the changed files and checks.
```

如果没有安装 skill，把本文整段提供给 agent，并追加具体任务，例如：

```text
按照下面的 AE UI 重构流程，把素材库筛选移动到左侧栏，并完成桌面和移动端验证。
```

## 1. 先确认目标

每次 UI 重构先回答这几个问题：

- 这次改哪个界面：概览、项目库、素材库、每日统计、设置、弹窗或预览？
- 改的是结构、颜色、交互、响应式，还是整体视觉 polish？
- 是否只改 UI，不改本地文件索引、Electron、Eagle 同步等数据逻辑？
- 用户有没有提供截图或明确不舒服的点？

默认策略：只改用户要求的界面和相邻样式，不做无关重构。

## 2. 读取项目上下文

优先读取：

- `PRODUCT.md`
- `src/App.tsx`
- `src/styles.css`
- `index.html`
- 用户提供的截图

项目定位：

- 这是给视频设计师、AE 动效师和本地素材量较大的创作者使用的桌面工作台。
- 视觉目标是克制、清晰、可靠。
- 不要做成营销页、花哨文件浏览器、装饰卡片墙。
- 预览空间优先，筛选和操作要紧凑。

## 3. 设计方向锁定

在写代码前，先定方向：

- Register：product。
- 场景：用户在低照度桌面环境里长时间整理 AE 项目和素材。
- 氛围：专业工作台、低眩光、清楚、耐看。
- 布局：左侧主导航，内容区为密集面板。素材库适合两栏布局：左侧筛选，右侧搜索、缩放和结果。
- 反目标：不要紫蓝 AI 渐变、霓虹发光、暗色发亮边框、装饰 blob、营销 hero、三等分卡片墙。

## 4. 开始前审计

用这些命令快速定位结构和颜色：

```powershell
rg -n -- "asset-console|library-shell|library-filter-sidebar|dashboard-grid|folio-card" src\App.tsx src\styles.css
rg -n -- "#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|linear-gradient|box-shadow|background:" src\styles.css src\App.tsx
```

重点看：

- 是否有大量硬编码颜色。
- 主强调色是否散落在很多组件里。
- hover、focus、active、selected 是否不统一。
- 移动端是否有单独规则。
- 当前功能是否依赖 className 或 DOM 结构。

## 5. 实施原则

### 颜色重构

优先改 `:root` 的语义变量，再替换组件里的硬编码色。

推荐色彩逻辑：

- 背景：graphite 深色，不用纯黑。
- 面板：通过 2 到 3 层 surface 表示层级。
- 文字：暖白和低饱和灰，不用纯白。
- 主操作：低饱和 amber 或铜色，只用于行动和选中。
- 状态：success、warning、danger、info 分别用独立语义 token。
- 选中态：多数情况下用轻 tint，不要所有选中项都大面积实心填充。

示例 token：

```css
:root {
  --bg: #111315;
  --bg-2: #151819;
  --surface: #1b1f20;
  --surface-2: #222729;
  --surface-3: #2b3133;
  --surface-sunken: #101214;
  --surface-stage: #0d0f10;
  --ink: #f1efe8;
  --ink-2: #d7d3c8;
  --muted: #9f9b90;
  --muted-2: #77746b;
  --border: #33393b;
  --border-2: #495154;
  --accent: #c5945d;
  --accent-rgb: 197 148 93;
  --accent-soft: #32291f;
  --accent-ink: #1b130b;
  --accent-text: #e5c494;
}
```

### 素材库左侧筛选

如果任务是调整素材库筛选：

- 在 `asset-console` 上区分 `library-mode` 和 `overview-mode`。
- 新增 `library-shell`。
- 左侧为 `library-filter-sidebar`。
- 右侧为 `library-content`。
- 将当前目录、项目分类、素材类型、排除筛选、时间筛选、Eagle 筛选放入左侧。
- 搜索、缩放、素材结果留在右侧。
- 概览模式隐藏左侧筛选。
- 移动端把左侧筛选堆叠到结果上方，所有筛选项全宽。

### 交互状态

改动过的控件至少覆盖：

- default
- hover
- focus-visible
- active
- selected
- disabled
- empty
- error / warning / success / info

## 6. 验证流程

每次完成后运行：

```powershell
npm run typecheck
npm run build
```

浏览器验证：

1. 打开 `http://127.0.0.1:5173/`。
2. 通过真实点击进入被修改页面，例如点击“素材库”。
3. 截桌面图。
4. 调整到移动端宽度，例如 `390 x 844`。
5. 截移动端图。
6. 检查 console，要求 0 errors，最好 0 warnings。

截图建议放在：

```text
output/playwright/
```

如果 Playwright CLI 缺浏览器，在 Windows 上可优先试 Edge：

```powershell
npx --yes --package @playwright/cli playwright-cli open http://127.0.0.1:5173/ --browser msedge
```

## 7. 交付标准

交付前确认：

- 没有旧主色残留。
- 没有纯黑、纯白、紫蓝 AI 渐变或霓虹发光。
- 文本没有挤出按钮或面板。
- 桌面和移动端都能看清主要操作。
- 功能路径没有被 UI 重构破坏。
- 本地文件、目录、Eagle 同步等数据逻辑没有被无关改动。

最终回复包含：

- 改了什么。
- 主要文件。
- 验证命令。
- 截图路径。
- 未验证项，如果有。
