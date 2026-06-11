# ZeroFlow

ZeroFlow is a canvas-first production tool for astrology teaching videos.

The first implementation target is a local Web Studio where each video is generated independently while shared resources, style presets, and scene templates can be reused across projects.

## Docs

- [Product Architecture](./ARCHITECTURE.md)
- [Technical Architecture](./TECHNICAL_ARCHITECTURE.md)
- [Phase Plan](./PHASE_PLAN.md)

## Development

```bash
pnpm install
pnpm dev
```

Useful checks:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Phase Status

`P0` is complete. The repository now has the baseline workspace needed for ongoing feature work:

- pnpm monorepo with `apps/web` and shared `packages/*`
- Next.js Web Studio app shell
- TypeScript, lint, format, and workspace package scripts
- Runtime `data/` folders kept out of git except for `.gitkeep` placeholders
- Architecture, technical architecture, and phase plan documents

Current active work is beyond P0: canvas-first video generation workflow, provider integration, reusable assets, preview/export, and tldraw-based editing.
