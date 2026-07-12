# BUILD-M3B — embedded colorwork authoring

**Audience:** the implementing agent for M3B. Start here. `FOUNDING.md`,
`SYSTEM-DESIGN.md`, and `UX-PROPOSAL.md` remain binding when this brief is
silent. Flag conflicts; do not improvise a new product boundary.

## Mission

Embed a fast, colorwork-only pixel canvas in Studio, backed by the completed
`ColorworkProjectV1` contract. A user must be able to paint and restructure a
200×300 rectangular chart, undo reliably, and hand the resulting project to the
next machine-compilation slice without a download/import loop.

This slice is **authoring**, not machine setup. The visible result is Studio's
Chart view plus its compact tool/palette chrome. Strategy, carrier assignment,
back-face previews, Worker compilation, and `.kc` export belong to M3C/M3D.

## Ownership and donor rules

- Work in `/home/xjhc/pro/kniterate-studio` only.
- `/home/xjhc/pro/knitlab` is the behavior donor, currently on
  `feature/colorwork-chart`. Treat it as read-only; do not copy its `App.tsx` or
  commit into that worktree.
- Create `packages/colorwork-core`, package name
  `@knitlab/colorwork-core`. It must have **no React, DOM, Studio, machine, or
  project-contract dependency**. It owns neutral pixel-chart geometry,
  selection, raster tools, and clipboard transformations.
- Studio owns a thin adapter from core mutations to
  `@kniterate-studio/project-contract` `ProjectEdit` values. Project history is
  the only undo stack.
- After the core API stabilizes, KnitLab adoption is a separate PR/handoff. Do
  not claim M3B fully shared until KnitLab consumes the same package release.

## Source seams to mine, not transplant

Behavior reference in `/home/xjhc/pro/knitlab`:

- `services/colorworkMutationService.ts` and
  `test/colorwork-mutation.test.ts`: atomic paint batches, selection fill,
  clear, move, paste, resize, and structural-edit refusal behavior.
- `components/KnitCanvas.tsx`: viewport culling, pan/zoom, gutter hit-testing,
  pointer gestures, selection rendering, and two-canvas render layering.
- `App.tsx` keyboard block around line 1308: clipboard and tool interaction
  expectations. Do not port its application-state orchestration.
- `hooks/useChartHistory.ts`: behavior reference only. Do not import or recreate
  it; Studio history is already solved by `ColorworkProjectV1`.
- `services/colorworkExportService.ts`: exact palette/cell semantics.

Strip hand-knit symbols, layers, sheets, reusable multi-cell block ownership,
JPG publication export, autosave, and legacy `.knitlab` serialization from this
slice. `ColorworkChartV1` is a flattened 1×1 color grid in Studio v1.

## Target structure

```text
packages/colorwork-core/
  src/types.ts            neutral PixelChart, point, rect, mutation types
  src/geometry.ts         normalized rectangles and clipped coordinates
  src/tools.ts            pen, erase, line, rectangle, fill rasterization
  src/selection.ts        copy, cut, move, paste transformations
  src/index.ts
  test/

apps/studio/src/chart/
  projectCanvasAdapter.ts PixelMutation → ProjectEdit
  ColorworkCanvas.tsx     canvas renderer + pointer/keyboard interaction
  ChartToolbar.tsx
  PaletteRail.tsx
  ChartWorkspace.tsx
```

## Binding contracts

1. **One truth.** Render from `materializeColorworkProject(project).state.chart`.
   Every committed gesture calls `appendProjectEdit`; never mutate chart arrays
   held in React state.
2. **One gesture, one history entry.** A pen drag may preview locally, but pointer
   up commits one deduplicated `paint-cells` batch. Fill, line, rectangle, paste,
   move, insert row, and delete row each commit exactly once.
3. **Stable rows.** Generate a unique row ID before an `insert-row` edit. Never
   renumber existing IDs. Deleted-row overrides remain quarantined through the
   project materializer.
4. **Design rows stay design rows.** Do not render jacquard/pass expansion in the
   chart. M3C will add a separate ×N gutter from engine provenance.
5. **Exact color.** Cells store palette indexes; palette identity and six-digit
   sRGB hex values remain exact. No image quantization or implicit recoloring.
6. **Optimistic canvas.** Rendering and pointer feedback remain on the main
   thread. Do not import `machine-lib` into the canvas package or component.
7. **No second history.** Undo/redo call `undoProjectEdit`/`redoProjectEdit`.
   Local React state may hold only transient selection, hover, pan, zoom, and an
   uncommitted gesture preview.

## Required tools and controls

- Pen (`P`), selection/move (`M`), select (`S`), line (`L`), rectangle (`R`),
  eraser, and flood fill. Use Lucide icons and tooltips.
- Palette swatches with active-color state; maximum four assigned pattern
  colors is a later machine constraint, not a reason to corrupt imported charts.
- Undo/redo, zoom in/out, zoom-to-selection, copy/cut/paste, delete selection.
- Insert/delete row from the row gutter. Row insertion occurs between visible
  design rows and preserves the active tool.
- Pointer drag panning and trackpad/wheel zoom without layout shift.
- Narrow screens use Chart/Machine tabs; the canvas remains usable and does not
  shrink the grid controls below stable touch targets.

## Performance decision from M3A

The pinned 200×300 four-color birdseye benchmark produces 487,928 Knitout ops
and 5,032 predicted passes. On the current machine, steady-state full compile is
~579 ms median / ~647 ms p95 with ~121 MB maximum observed heap growth. See
`docs/benchmarks/m3a-blanket-benchmark.json`.

Therefore:

- M3B renders optimistically and never waits for compilation.
- M3C must compile in a Web Worker after a short edit debounce.
- Full deterministic compile is acceptable initially; do not build incremental
  compilation until browser measurements prove it necessary.

## Acceptance gates

1. Import the shared four-color fixture into a `ColorworkProjectV1`, paint with
   every tool, undo/redo, save JSON, reopen, and recover identical materialized
   chart cells and history cursor.
2. A continuous pen drag across 100 cells creates one history entry, not 100.
3. Insert a row below an anchored override: the override stays active. Delete
   its row: it remains present and becomes quarantined with the contract reason.
4. At 200×300, canvas interaction remains responsive; viewport rendering is
   culled and DOM nodes do not scale with cell count. No 60,000-cell DOM grid.
5. Keyboard shortcuts, pointer tools, clipboard, pan/zoom, and narrow-screen tabs
   pass focused browser tests with zero console errors.
6. `pnpm verify` stays green. `git diff --check` stays clean. No changes to
   machine compiler/verdict semantics.

## Hard do-not list

- Do not build the strategy rail, carrier UI, backing previews, compile Worker,
  assistant, image quantizer, block editor, layers, sheets, or machine export.
- Do not copy KnitLab's 1,400-line `App.tsx` or preserve its snapshot history.
- Do not invent a second chart/project schema.
- Do not expand design rows into machine passes.
- Do not touch `/home/xjhc/pro/knitlab` during this slice.

## Reviewer packet

Return: files changed, contract/API decisions, tests run, browser screenshots at
1440×900 and 390×844, canvas pixel/nonblank check, 200×300 interaction timing,
console output, and every known deviation from this brief. Do not call the slice
complete without the packet.

## Closeout packet - 2026-07-12

Studio implementation is complete. The shared-core adoption in KnitLab remains
a separate cross-repository handoff, as required above.

- Neutral core: `packages/colorwork-core`.
- Studio adapter and UI: `apps/studio/src/chart`, with intake in
  `projectFile.ts` and project-only history in `ChartWorkspace.tsx`.
- Regression coverage: 171 unit/integration tests plus 3 Playwright tests in
  `e2e/m3b.spec.ts`. The browser suite covers all authoring tools, clipboard,
  undo/redo, save/reopen identity, a continuous 100-cell single-edit gesture,
  wheel zoom, drag pan, mobile layout, and dark mode.
- Browser proof: zero console errors; screenshots are
  `output/playwright/m3b-fixed-dark-desktop.png` and
  `output/playwright/m3b-fixed-mobile.png`. The desktop canvas measured
  1286x740 with 3,806,560 non-zero pixel bytes. The 390px viewport has no page
  overflow.
- Interaction proof: the checked-in 100-cell flow passes in the browser and
  creates exactly one edit containing columns 0 through 99. Its end-to-end test
  takes about 2 seconds including navigation and project serialization; this is
  intentionally not presented as a frame-time benchmark.
- Gates: `pnpm verify`, `pnpm test:e2e`, and `git diff --check` pass.

There are no known deviations from the Studio acceptance gates. KnitLab has not
yet been changed to consume the neutral package.
