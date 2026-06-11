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

## Current Phase

The project is starting at `P0`: workspace skeleton, app shell, shared package directories, and baseline tooling.
