# ZeroFlow

ZeroFlow is a canvas-first production tool for astrology teaching videos.

The current implementation target is a local Web Studio where each video is generated from editable canvas nodes while shared assets, provider settings, style presets, and scene templates can be reused across projects.

## Docs

- [Product Architecture](./ARCHITECTURE.md)
- [Technical Architecture](./TECHNICAL_ARCHITECTURE.md)
- [Phase Plan](./PHASE_PLAN.md)

## Current Capabilities

- Canvas-first video workflow with topic, script, structure, chapter, storyboard, scene, asset, composition, preview, and export nodes.
- Standard canvas and tldraw-based editing surfaces for the same project data model.
- Script, storyboard, chapter expansion, image, chart, D3, Three.js, TTS, caption alignment, composition, preview, and export jobs.
- Multi-node scene resource generation so several images, captions, TTS clips, and visual resources can be generated without blocking the entire canvas.
- Remotion preview and MP4 export flow with scoped current-scene previews and separate full-project export nodes.
- Provider health checks and local fallback behavior for configured or missing providers.

## Astrology Chart Pipeline

Chart nodes use Swiss Ephemeris for calculation and AstroChart for display when provider inputs are available. Birth date, birth time, IANA timezone, UTC offset, latitude, longitude, house system, zodiac mode, ayanamsa, planet set, and lunar node mode are stored on the chart node.

The chart provider stores calculated positions, houses, calculation metadata, and generated AstroChart SVG on the chart node. Remotion reads that generated chart directly. If a scene is forced into chart mode without a generated chart SVG or chart asset URL, Remotion may fall back to its built-in placeholder chart, so generate or attach the chart asset before final preview/export.

### Chart Highlights

Chart highlights are first-class child nodes with kind `chart-highlight`. Use the parent chart node to add or list highlights, then select each highlight child node to edit:

- highlight type: axis, planet, house, aspect, or zodiac
- target: selected from dropdown options derived from the chart data
- timing: start second and duration within the current scene
- style: pulse, glow, ring, line, sector, or label
- color and emphasis

Highlights are rendered during Remotion playback when the chart scene reaches their configured time. The chart itself is static by default; the earlier whole-chart rotation animation has been removed so highlights stay aligned to chart elements.

## Preview And Export

Scene and composition previews are scoped to the current scene. Preview nodes created from a scene/composition store their source composition and scene ids, and the Web Studio player resolves those ids back to a single-scene Remotion spec.

Export nodes created from a preview default to clip export. Use the project export action to create a full-video export node. Full-project exports intentionally render the complete timeline.

## Providers And Environment

Copy `.env.example` to `.env.local` (or provide the same variables in your shell) before running live providers.

Common provider variables:

- `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL` for script and storyboard generation.
- `YUNWU_API_KEY`, `YUNWU_BASE_URL`, `YUNWU_IMAGE_MODEL` for raster image generation.
- `INDEXTTS_CLI_DIR`, `INDEXTTS_REFERENCE_AUDIO_PATH`, `INDEXTTS_REFERENCE_AUDIO_NAME` for local IndexTTS voice generation.
- `SWISS_EPHEMERIS_PATH`, `SWISS_EPHEMERIS_MODE`, `SWISS_EPHEMERIS_JPL_FILE` for Swiss Ephemeris files and mode selection.
- `ZEROFLOW_DATA_DIR`, `ZEROFLOW_STORE_PATH`, `ZEROFLOW_DB_PATH` for local project, job, and asset storage.

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

Current active work is beyond P0: canvas-first video generation workflow, provider integration, reusable assets, chart calculation/highlighting, scoped preview/export, and tldraw-based editing.
