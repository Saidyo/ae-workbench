# 贡献说明

感谢你关注 AE Workbench。

## 本地开发

安装依赖：

```powershell
npm install
```

启动应用：

```powershell
npm run dev
```

提交修改前建议运行：

```powershell
npm run typecheck
npm run build
```

## 提交建议

- 不要提交本地运行数据。
- 不要提交 `node_modules/`、`dist/`、`dist-electron/`、`data/`、`Cache/`、`Library/` 或 `Projects/`。
- Eagle 同步默认保持只读，除非后续设计明确改变这个约定。
- 尽量保持每次修改范围清晰，并在提交信息中说明改动目的。
