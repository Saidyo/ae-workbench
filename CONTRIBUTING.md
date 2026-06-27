# Contributing

Thanks for your interest in AE Workbench.

## Development

Install dependencies:

```powershell
npm install
```

Start the app:

```powershell
npm run dev
```

Run checks before submitting changes:

```powershell
npm run typecheck
npm run build
```

## Pull Request Notes

- Keep runtime data out of commits.
- Do not commit `node_modules/`, `dist/`, `dist-electron/`, `data/`, `Cache/`, `Library/`, or `Projects/`.
- Keep Eagle sync read-only unless a future design explicitly changes that contract.
- Prefer small, focused changes with a clear description.
