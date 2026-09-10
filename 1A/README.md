# Savor

*Food memories. Shared forever.*

This repository holds two builds of the same product:

| Build | Path | Stack |
| --- | --- | --- |
| Web concept (design reference, highest fidelity) | `src/`, `public/`, `index.html` | React 19 + TypeScript + Vite, Framer Motion, Leaflet, lucide-react |
| WeChat Mini Program (native port) | `miniprogram/` | WXML / WXSS / JavaScript, native `<map>`, custom tab bar, wx storage + FileSystemManager |

Both share the same product structure — **Home · Map · ＋ · Us · Me** — the same data model
(`memories / profile / settings / feedback`) and the same storage keys (`savor-diary-v1`,
`savor-draft-v1`), so backups move between them.

## Web

```bash
npm install
npm run dev      # development
npm run build    # production bundle in dist/
```

## Mini program

Import `miniprogram/` in WeChat DevTools (tourist AppID works). Full documentation —
architecture mapping, storage, photo persistence, map notes, import/export, permissions,
verification status and known platform differences — is in
[`miniprogram/README.md`](miniprogram/README.md).

## Checks

```bash
node tools/validate-miniprogram.cjs   # syntax, JSON, WXML/WXSS, paths, assets, package size
node tools/smoke-store.cjs            # data layer: migration, CRUD, import/export rules
```
