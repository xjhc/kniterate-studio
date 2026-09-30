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
- all 13 reference `.kc` files open and render. Twelve open Surface-proven
  (imported): five retain 220 modeled depth-three loop-stack observations in
  total, presented as non-blocking informational evidence at the foreign Studio
  boundary. `fox-baby-beanie.kc` remains Blocked by 183 empty-drop warnings.
  The shared validator still records depth three as a conservative warning and
  errors above three; all 13 fixtures have zero validation errors

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
- generated `.kc` is strict-parsed into `MachineTraceV1`, replay-validated, and
  checked against the pinned backend's exact scheduled-pass fields before
  export; predicted passes remain planning telemetry
- pass-to-`.kc` line spans join the existing design-row provenance and drive the
  generated source dock
- export is disabled for blocked, converting, stale, reconstruction-failed, or
  parity-failed artifacts
- the authored run sheet records dimensions, frame, backing, C1/C6 reservations,
  C2-C5 yarns, findings, compile identity, and k-code SHA-256
- browser tests prove gated export, print output, foreign-file revalidation,
  byte-identical save/reopen/recompile, and a responsive 200x300 four-color run
- the canonical 200x300 four-color Birdseye project is admitted by the fixed
  `authored-v1` envelope and now proves end-to-end export plus ordinary `.kc`
  reimport in Chromium and Firefox; projects outside that envelope receive a
  typed compile-stage capacity finding before compiler/lowering allocation

M3 gate: author/import the four-color fixture, assign yarns, compile, export,
reopen, and revalidate byte-identically in a browser test.

### V1 release polish - complete

- local autosave recovery plus explicit New project, rename, and palette editing
- visible chart-to-K-code pipeline, output-failure state, and validated export
- CSP-compatible browser converter with generated-source and byte-parity checks
- CI gates for full verification and Chromium/Firefox/WebKit browser coverage
- decoded face designs from `fairisle.kc`, `jacquard.kc`, and `dbj.kc` author and
  export through the real browser Worker path; all three references strict-parse
  and validate cleanly

Fairisle and DBJ also retain exact machine-equivalent reference parity tests.
The official `jacquard.kc` combines front/back work into a denser pass schedule
than Studio's generic birdseye generator. Its generated output is validator-cleared,
but schedule parity remains a named optimization; do not describe that
route as reference-equivalent until a dedicated walker is proven.

## M4 - Knit-proven

Register physical swatches and allow a verdict to become Knit-proven only when
the exact recipe matches the physical registry.

Software readiness is complete: from a clean tree, `pnpm release:trial`
produces the validated, commit- and hash-pinned Customist fairisle reproduction
package and operator checklist described in
[`V1-PHYSICAL-TRIAL.md`](./V1-PHYSICAL-TRIAL.md). Registration requires the
same clean generating commit. The registration command,
source-tree/output hash checks, browser registry manifest, exact-artifact
matcher, Knit-proven setup/run-sheet state, and fail-closed promotion command
are wired. Physical state remains 0/4 registry entries; actual machine runs are
the remaining gate.

---

## Widened V1 (ruling 2026-09-28) — proposed, not started

V1 is Customist Studio parity plus AI-driven rectangles, beanies and sweaters.
See [`FOUNDING.md`](./FOUNDING.md) §1,
[`CUSTOMIST-PARITY.md`](./CUSTOMIST-PARITY.md) (capability rows CP-*) and
[`DESIGN-LANGUAGE.md`](./DESIGN-LANGUAGE.md). Each milestone has two
checkpoints: **software completion**, then a separate **machine trial**. That
way development keeps moving while machine time is arranged. Machine runs made
before M9 are development evidence only
([`V1-PHYSICAL-TRIAL.md`](./V1-PHYSICAL-TRIAL.md)).

## M5 - Design language on rectangles

- The v2 project contract: `materializeDesign`, the Plan with value provenance,
  findings with owners and design paths, and a pure `resolveReadiness`.
- A lossless v1 → v2 migration (DESIGN-LANGUAGE §9).
- CLI `show`/`plan`/`describe`/`readiness`/`render`/`explain`, with edit diffs.
  The Claude Code skill.
- The benchmark harness with rectangle cases.
- Capacity raised for long rectangles; a 180 cm scarf currently exceeds the
  300-row cap.
- The bind-off configuration warning fixed at its source.
- Rectangle parity rows: CP-A1/A2/A11, B1–B3, B6, B8, C3, E1–E4, F1–F5, G1–G4,
  H2–H4.
- The Customist reference-capture batch for M5.

**Status 2026-09-29: software core built; parity rows open.**

Built:

- the v2 format (gauge and target) and the lossless v1 upgrade;
- the Plan, findings with owners, and readiness;
- the 1,200-row capacity and the colour-aware Fairisle estimate;
- the bind-off warning fix;
- CLI `new` (blank), `image`, `plan`, `describe`, `readiness`, `render` and
  `explain`;
- the skill, and the benchmark (12/12, 0 false readiness claims).

Open:

- **Rows that need Customist reference captures for R/E evidence:** CP-B1–B3,
  B6, B8, C3, E1–E2, F1–F5, G3–G4. B1 also needs the carrier-role ruling.
  F1/F2 also need the compiler to consume row-setting overrides.
- **Rows at CLI level only:** CP-A1, A11, G1, G2 (no occupancy), H3. Level F
  requires a browser test.

Gate:

- migrated fixtures are byte-identical at every cursor position;
- the rectangle benchmark passes, with 0 false readiness claims;
- the M5 parity rows reach level R or E;
- `pnpm verify` is green.

## M6 - Flat, seamed beanie end to end

**Status 2026-09-29: thin slice built.**

Built:

- `customist-rib-beanie.ts` reproduces `reference/2x2-rib-beanie.kc` exactly
  (strict trace identical, 530/530 passes), with adjustable height;
- `pnpm studio -- beanie`, which writes `.k`, `.kc` and finishing
  instructions and checks the output as an imported machine file.

Remaining:

- ~~a crown for any width; circumference sized from gauge~~ — done: the
  eight-line crown covers 60–244 needles, and `beanie --head-cm` sizes the
  width;
- ~~a beanie project in the authored pipeline~~: done (`object: beanie`,
  verdict via `resolveAuthoredVerdict`, readiness, finishing instructions);
- ~~motif placement and the fold-up cuff~~: done as a rib cuff +
  fairisle body with `place`. The motif is painted into the chart; bundled
  images and placement objects are deferred. Long floats keep bold motifs
  honest, and float catching or birdseye backing is next;
- the benchmark's beanie cases;
- a development knit in acrylic.

Goal: *given a natural-language request with dimensions, yarn, measured gauge
and a motif, Studio produces an editable beanie project, one validated `.kc`
file, previews, and complete knitting and finishing instructions. Changing the
size or the motif regenerates everything reproducibly.*

Done means:

- Claude creates and edits typed project intent through the CLI.
- Sizing accounts for measured gauge, intended fit, cuff and crown. The Plan
  exposes every derivation, including crown cadence, height and closure.
- The canonical compiler produces the complete program with no manual
  machine-code edits.
- Previews show motif placement, orientation and construction.
- Readiness exposes unresolved warnings and missing measurements.
- Tests cover the reference design (`2x2-rib-beanie.kc`, a flat 2×2 rib) and
  meaningful size and pattern variations. Parity rows CP-A5 (rib), C5, D1, D2
  (crown), D5 (piece end) and E1 (rib cast-on) reach level R or E.
- The startup lowering is repaired. The knitlab2 beanie output fails the strict
  parse because its first waste pass puts a carrier-6 marker outside the
  carriage markers. The Studio beanie uses a Customist-matched start instead.
- **Machine checkpoint:** a development run of the beanie. The final frozen
  candidate is knitted in M9, finished and measured against the declared
  tolerances. Only that exact artifact receives physical proof.

## M7 - Sweater

- The Customist 2.5 sweater template (CP-A3…A7): front, back, sleeves and
  collar.
- Shaped-panel compilation: increases, decreases, armhole bind-offs, neckline
  split, interleave (CP-C7, D1–D5).
- Multiple pieces in one project (CP-H1).
- Seam and pickup compatibility checks.
- An export bundle with assembly instructions.

Gate: parity against captured Customist panels, including the collar.
`front.kc`, `back.kc` and `sleeves.kc` are shaping references. The
benchmark's sweater cases pass.

## M8 - Remaining parity

The rest of the inventory:

- vector import (CP-A8), txt import (A9), stitch image and block (A10);
- invert and full-needle (B4, B5), borders (B7);
- stitch palette and free edit (C1, C2, C4, C6, C8);
- views and markers (G1 stitch view, G5);
- the platform rows CP-J1…J4, as ruled.

Gate: every CP row at level R, E or F.

## M9 - V1 physical qualification

- Extend `release:trial`, `release:register` and `release:physical-check` to a
  multi-artifact manifest: every sweater panel, declared tolerances,
  measurements, and assembly evidence.
- Freeze the release candidate.
- Knit, finish and measure the rectangle, the flat seamed beanie and the
  complete sweater.
- Register them all at the frozen fingerprint.

Gate: the extended `pnpm release:physical-check` passes. Only then bump to
`1.0.0`.
