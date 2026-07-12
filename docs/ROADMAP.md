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

## M1 - Machine extraction - complete

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

Closeout (2026-07-12): six machine-only rectangle routes now generate into the
conformance run and pass the vendored topology oracle. That gate exposed and
fixed orphaned stockinette cast-on loops and un-homed ladder backing loops. The
browser/Node export boundaries are pinned by a public API test, and
`EXTRACTION.md` records the exact source commit and exclusions.

The old surface corpus is deliberately not copied: it exports written
instructions and exercises measurement-first garment packages that are outside
Studio's product boundary.

## M2 - Open, validate, diff - complete

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

The six refusal programs are pinned through the browser-facing engine. Checked-in
Playwright coverage now exercises foreign open, pass navigation, identical diff,
print-ready run sheet output, and a blocked illegal-carrier file.

## M3 - Blanket flow - complete

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

### M3C - Blanket machine loop - complete

Rectangle sizing, palette-to-yarn/carrier assignment, backing strategy and
previews, default frame, debounced Worker compile, synced machine view, and live
verdict.

Completed 2026-07-12:

- durable height, needle-placement, and frame edits added to project history
- project-to-compiler adapter enforces four used pattern colors, complete C2-C5
  assignments, C1 draw thread, C6 waste yarn, and complement's two-color rule
- pure deterministic artifacts compile in a dedicated debounced Worker; stale
  results cannot replace a newer project revision
- live setup rail covers rectangle, backing, yarn carriers, frame, compile
  estimates, and authored Surface-proven/Blocked state
- checked-in browser coverage proves setup persistence and Worker verdict changes
- the machine boundary normalizes top-to-bottom canvas storage into cast-on-first
  compiler rows without changing the durable chart
- engine-emitted design-row provenance powers the ×N gutter, compiled pass-grid
  focus, and diagnostic anchors; React performs no pass reconstruction
- all five backing choices compile speculatively in cancellable Worker slices and
  show engine-derived back faces, pass/time deltas, and blocked state before apply
- authored machine view is virtualized, synchronized with chart hover, responsive
  on narrow screens, and groups repeated findings without hiding their count

### M3D - Durable machine output - complete

Browser `.kc` conversion, gated export, project save/reopen, byte-identical
recompile, and final run sheet.

Completed 2026-07-12:

- a dedicated Worker executes the same vendored converter source as the Node
  conformance adapter; a parity test pins byte-identical output
- generated `.kc` is reconstructed and validator-gated before export, with
  trusted body prediction checked against vendor passes and known-approximate
  frame/finish deltas retained as non-gating provenance
- pass-to-`.kc` line spans join the existing design-row provenance and drive the
  generated source dock
- export is disabled for blocked, converting, stale, reconstruction-failed, or
  parity-failed artifacts
- the authored run sheet records dimensions, frame, backing, C1/C6 reservations,
  C2-C5 yarns, findings, compile identity, and k-code SHA-256
- browser tests prove gated export, print output, foreign-file revalidation,
  byte-identical save/reopen/recompile, and a responsive 200x300 four-color run

M3 gate: author/import the four-color fixture, assign yarns, compile, export,
reopen, and revalidate byte-identically in a browser test.

## M4 - Knit-proven

Register physical swatches and allow a verdict to become Knit-proven only when
the exact recipe matches the physical registry.

Software readiness is complete: `pnpm release:trial` produces the validated,
hash-pinned 120x160 four-color blanket package and operator checklist described
in [`V1-PHYSICAL-TRIAL.md`](./V1-PHYSICAL-TRIAL.md). Physical state remains 0/4 registry entries; the
representative blanket machine run is the only blocker to promoting
`1.0.0-rc.1` to `1.0.0`.
