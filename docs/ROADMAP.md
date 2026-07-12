# Kniterate Studio roadmap

The detailed product boundary and machine extraction manifest live in
[`FOUNDING.md`](./FOUNDING.md).

## M0 - Contract intake - complete

- Separate repository and workspace
- Versioned `ColorworkChartV1` parser, schema, and shared fixture
- Browser import with exact chart and ordered-palette preview
- Invalid-file diagnostics and static production build

Gate: the KnitLab fixture parses byte-for-byte here and renders with the same
dimensions, row convention, palette order, and cell indices.

## M1 - Machine extraction - in progress

Move the proven machine library and tests from `knitlab2` into
`packages/machine-lib`; do not rewrite it. Preserve the reference `.kc` corpus,
simulator, codecs, validators, compiler, conformance scripts, refusal corpus,
and swatch registry. Exclude the measurement-first garment engine, publication
surfaces, stitch maps, and chart editor.

Gate: machine tests and `kniterate:conform` pass in this repository without
runtime imports from `knitlab2`.

Completed in the first extraction slice:

- 29k lines of compiler, codecs, simulator, chart-machine adapters, and
  machine validators moved without runtime imports from `knitlab2`
- 140 tests green across reference `.kc`, compiler/topology, revalidation/diff,
  the chart-contract bridge, and focused machine behavior
- six refusal cases pinned and the physical swatch registry validated
- public package entry point and a green `pnpm kniterate:conform`

Remaining before closing M1:

- replace the old mixed hand-knit `surface:verify` corpus with a machine-only
  rectangle fixture corpus, then run the topology oracle across its emitted
  `.k` files
- complete the public API/export review and provenance manifest audit

The old surface corpus is deliberately not copied: it exports written
instructions and exercises measurement-first garment packages that are outside
Studio's product boundary.

## M2 - Open, validate, diff - in progress

Ship foreign `.kc`/`.k` intake, pass-grid machine view, anchored diagnostics,
verdict panel, run sheet, and `.kc` diff.

First implementation slice (2026-07-12):

- browser-safe machine-library surface with `.kc` source provenance and a
  Knitout v2 parser/grouped pass inspector
- local `.kc`/`.k` intake, virtualized pass grid, source synchronization,
  validator-derived foreign-file verdict, diagnostics, `.kc` diff, and print
  run sheet
- all 13 reference `.kc` files open Surface-proven (imported); full repository
  verification and conformance rails remain green

The six refusal programs are pinned through the browser-facing engine. Remaining
gate work: add automated browser coverage for open, diff, keyboard navigation,
and print.

## M3 - Blanket flow - in progress

### M3A - Project foundation - complete

- `ColorworkProjectV1`: fixed 7gg profile, chart, stable row IDs, strategy,
  frame, C2-C5 assignments, overrides, one human/assistant/system edit log,
  undo/redo cursor, validated checkpoints, and quarantine semantics
- 200×300 four-color benchmark: full compile clears <1s, but Worker execution is
  required to keep painting responsive; incremental compile deferred

### M3B - Embedded chart authoring - Studio complete

Extract a neutral pixel/selection/tool core, integrate an embedded Studio canvas
through `ProjectEdit`, and retain KnitLab Chart as the independent authoring
product. Implementation front door: [`BUILD-M3B.md`](./BUILD-M3B.md).

Completed 2026-07-12:

- dependency-free `@knitlab/colorwork-core` geometry, raster, selection, and
  clipboard operations
- culled two-layer canvas with continuous gestures, atomic selection moves,
  row gutter edits, palette tools, project-only undo/redo, and dark/mobile UI
- direct `ColorworkChartV1` import plus durable project save/reopen without cell
  or history drift
- 171 unit/integration tests and 3 checked-in Playwright acceptance tests green

KnitLab consuming the neutral package remains a separate cross-repository task;
Studio does not wait on it before M3C.

### M3C - Blanket machine loop

Rectangle sizing, palette-to-yarn/carrier assignment, backing strategy and
previews, default frame, debounced Worker compile, synced machine view, and live
verdict.

### M3D - Durable machine output

Browser `.kc` conversion, gated export, project save/reopen, byte-identical
recompile, and final run sheet.

M3 gate: author/import the four-color fixture, assign yarns, compile, export,
reopen, and revalidate byte-identically in a browser test.

## M4 - Knit-proven

Register physical swatches and allow a verdict to become Knit-proven only when
the exact recipe matches the physical registry.
