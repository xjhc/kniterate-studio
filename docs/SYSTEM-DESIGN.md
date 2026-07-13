# Kniterate Studio — system design & risk register

**Audience:** the implementation agents who will build S1–S4 from
[`UX-PROPOSAL.md`](./UX-PROPOSAL.md). **Purpose:** state the system shape once,
then enumerate the high-risk decisions that need an answer *before* code, so the
build doesn't fork on an unstated assumption.

Read order: [`FOUNDING.md`](./FOUNDING.md) (product boundary) →
`UX-PROPOSAL.md` (what to build) → this file (how it hangs together + what's
undecided).

---

## A. System shape

### A.1 The pipeline (exists, headless, test-green)

```
ColorworkChartV1  (chart-contract; the durable import artifact)
      │  projectColorworkChartV1
      ▼
KnitlabChartState (machine-lib; rich internal model: structure+color channels,
      │            key placements, annotations)
      ▼
ResolvedChart / projection
      ▼
KniteratePlan     (JSON-safe IR: technique union, carriers, settings, waste,
      │            ordered passes[], notes, validations)  ← the load-bearing IR
      ▼
KnitoutProgram    (flat machine-independent op union + Kniterate x-* ops)
      │  writeKnitoutProgram
      ▼
.k text  ──vendored CMU knitout-to-kcode.cjs (via a KCodeConverter adapter)──▶  .kc
```

Public API (`packages/machine-lib/src/index.ts`): `compileChartToKnitout`,
`writeKnitoutProgram`, `knitoutToKCode`/`nodeKCodeConverter`,
`compileToRunArtifact`/`runArtifactFromCompileResult`, `kcToKnitout`, `diffKc`,
`parseKcPasses`, `CarriageSimulator`, `validateKnitoutProgram`,
`projectColorworkChartV1`. Six validators return `ValidationMessage[]` with
severity; `validators/messages.ts` maps ~130 rules → knitter-facing
title/explanation/fixActions. Conformance rails: `kniterate-conform.ts`,
refusal corpus (6 pinned bad programs), topology oracle, swatch registry
(empty → verdict ceiling is "Verified, swatch recommended", never Knit-proven).

**Converter adapters (resolves the earlier in-browser vs subprocess ambiguity).**
The vendored `knitout-to-kcode.cjs` is the canonical converter source behind a
`KCodeConverter` interface (`convertRunArtifactToKCode(artifact, converter)` is
environment-agnostic). `nodeKCodeConverter` (`knitout/kniterate/to-kcode.ts`) is
the **Node adapter** — temp `.k` file + `spawnSync` — used by the CLI, tests, and
parity suites. The **browser adapter** runs in a Web Worker and imports a
deterministically generated ESM copy of the same library with only the Node CLI
driver removed. A source-equivalence test and byte-parity test prevent the two
paths from drifting. One canonical vendored source, two adapters — the live
loop needs **no backend** and no runtime code evaluation.

**Machine profile (single, hardcoded): 7gg worsted, 252-needle bed, carriers
1–6.** Convention: C1 draw thread, C2–C5 pattern, C6 waste; a 5th/6th pattern
carrier is gated (advanced / logged waiver). Racking integer or ±0.5, practical
max ±4. Machine knobs are inline knitout ops (`x-stitch-number`, `x-speed-number`,
`x-roller-advance`), not headers. `.kc` is human-readable ASCII, one block per
carriage pass (`FRNT/STIF/REAR/STIR` + `>> Kn-Kn <carrier> <speed> <roller>`).

### A.2 What the UI adds (not built)

- **Machine column** — renders `CarriageSimulator.predictedPasses()` as the pass
  grid (direction, carrier, cam action, speed, roller, kick/park/auto-move flags),
  synced to the chart by source-row anchor. Heatmap lanes reuse the same passes.
- **Chart column** — L1 paint + L3 stitch-op overrides; machine-aware annotations
  (needle ruler, ×pass gutter, carrier-side edge markers, live floats).
- **Strategy rail** — typed slots binding to `CompileChartInput` fields.
- **Verdict system** — maps validator output + registry match to the 4-state
  ladder; gates export.
- **Project file** — one durable JSON that re-derives everything, holds overrides
  and history.
- **Assistant** — schema-validated edits to the project file + speculative
  compile + diff renderer.

### A.3 Deployment

Static, no backend; compile runs in-browser today. The assistant needs a model
endpoint — the only networked dependency, and it must fail soft (the editor and
compiler work fully offline; AI is additive). KnitLab Chart stays independently
static-hosted; interchange is `ColorworkChartV1` + PNG, not a runtime service.

### A.4 The frame: waste, draw thread, cast-on, bind-off

The garment scaffolding is **already in the engine as plan passes — it is
project-level configuration, never chart content.**
`plan/compile-chart.ts` assembles every plan in a fixed order:

```
settings → waste → body → bind-off → release
```

- `passes/waste-section.ts` is one fused emitter for the whole prologue: waste
  interlock rows (takedown anchor) → draw-thread row (C1) → back-bed drop →
  pattern-carrier bring-in → both-beds cast-on. Waste, draw, and cast-on are not
  separate passes; don't model them separately in the UI either.
- `passes/bind-off.ts` carries the styles: `machine-bindoff` (xfer chain),
  `waste-and-drop` (default), `drop` (developer-only, gated ⇒ Experimental),
  `fairisle-park-bindoff`.
- Fairisle additionally gets `passes/carrier-intro.ts` + `passes/back-bed-clear.ts`.

**In the product, this is the "frame":** a `frame` block in the project document
(bind-off style is the one real user decision; waste/draw are mostly defaults),
surfaced as a Frame slot in the strategy rail and printed on the run sheet. The
pass grid shows waste and bind-off as collapsed section headers around the body
window. `knitlab2`'s wizard dissolves — compile is continuous here, so there is
no export ceremony — but its **config pattern survives** (see A.5 §3): persist
intent (`KniterateWizardConfig` lineage, schema-versioned), derive engine input.

### A.5 Component architecture & core patterns

```
project document (ColorworkProjectV1: chart + strategy + frame
        │                             + overrides[] + waivers[] + history)
        │   debounced edit stream → compile in a Web Worker
        ▼
compileToRunArtifact()                ← pure, deterministic, memoizable
        │
        ▼
RunArtifact { plan, knitout program, predictedPasses[],
              ValidationReport, .kc, provenance maps }
        │
        ▼   read-only projections
chart canvas · strategy rail · pass grid · verdict badge · source dock · run sheet
```

1. **Compiler-as-pure-function.** Document in → `RunArtifact` out
   (`compileToRunArtifact` already has this shape). The UI never mutates engine
   state; every edit re-runs compile on the document. Views read *only* the
   artifact — no view may grow its own pass math (see R13).
2. **One document, derived views.** The four nouns hold: the project document is
   truth; chart, machine view, verdict, and source are projections of the same
   `RunArtifact`. Hover-sync (row ↔ pass ↔ `.kc` line) is powered by provenance
   emitted by the engine, never reconstructed heuristically in the UI (R11).
3. **Intent vs derived state** (`knitlab2 wizard-config` lineage). Persist what
   the user meant, schema-versioned with migrations; derive engine input in a
   fixed order: recipe projection → intent → overrides → chart. L3 stitch ops and
   L4 pass patches are an **ordered patch list applied at defined lowering
   points** — the editability ladder as code, and the same `ProjectEdit` op union
   the AI uses (R7), so AI edits are reviewable and undoable by construction (R10).
4. **Ports-and-adapters at the vendor boundary.** `KCodeConverter` (A.1): Node
   subprocess adapter for CLI/tests, Worker adapter for the browser, same
   vendored `.cjs`. The UI depends only on `predictedPasses` and parity-checked
   output — never on vendor internals. The parity suite is the only code allowed
   to hurt when the vendor changes.
5. **Simulation is load-bearing, not optional.** `CarriageSimulator` does two
   jobs: stateful emission (carrier parking, kickbacks) and `predictedPasses()` —
   the prediction of what the vendor will emit (`sim/vendor-rules.ts`). The
   machine column, pass counts, and time estimate are renderers over
   `predictedPasses`; without it there is no machine view until after
   conversion, and no oracle.
6. **Parity as a CI ritual — and the oracle stated correctly.** Our `.kc` is
   *produced by* the vendored backend, so "diff our output against the backend"
   is circular. The real oracle is **predicted-vs-vendor parity**: the simulator
   predicts the passes the backend will emit; `predicted-vs-vendor.test.ts`, the
   reference-kc corpus (`machine-lib/reference/*.kc`), the refusal corpus, and
   the topology oracle check prediction against actual. Any walker or vendor
   change must be corpus-green before merge.

**Named gap:** `KniteratePlan` exists only as TypeScript types
(`plan/types.ts`); `schemas/` holds only `colorwork-chart-v1`. Since the source
dock shows Plan JSON as a public IR, publish `schemas/kniterate-plan-v1.schema.json`
**generated from the types** (never hand-maintained).

---

## B. Risk register

Each risk: **what**, **why it's high-risk**, **decision needed**, **proposed
default** (what to assume if we get no other steer). Risks are ordered by how much
downstream work forks on them. **R1–R4 should be answered before S2 starts.**

### R1 — Where painting lives (the boundary decision) · CLOSED 2026-07-12

- **What.** `UX-PROPOSAL.md` §8: embed the chart canvas in Studio (Option B) vs
  keep the KnitLab Chart file handoff (A) vs merge (C).
- **Why high-risk.** It changes the shape of S2, the meaning of the product
  boundary in FOUNDING, and whether the AI can edit charts at all. Everything in
  S2/S3 assumes an answer. Reversing later means rebuilding the chart column.
- **Decision needed.** A/B/C, and if B, whether the canvas core is *shared code*
  with KnitLab Chart or a *re-implementation* (see R8).
- **Proposed default.** B, with a shared extracted canvas core. It closes the core
  loop and reuses proven code; the cost (one more surface, drift risk) is
  manageable and named in R8.
- **Decision.** Accepted: Option B with a shared extracted canvas core. Studio
  owns the live machine-aware loop; KnitLab Chart remains the independent
  colorwork-only product and `ColorworkChartV1` remains the interchange seam.

### R2 — Project file format & override re-anchoring · CLOSED 2026-07-12

- **What.** The single durable JSON that re-derives the design and stores L3/L4
  overrides + history. Overrides are coordinate-anchored patches that must survive
  a recompile when the chart resizes/reflows.
- **Why high-risk.** This is `knitlab2`'s command-stack-invalidation problem in a
  new guise. If anchoring is naive (absolute row/col), inserting a row silently
  invalidates every override above it — the exact fragility we are selling against.
  Get the anchor model wrong and P2 ("nothing breaks on edit") is a lie.
- **Decision needed.** (a) The anchor scheme: absolute coords vs stable cell/region
  IDs vs relative-to-feature. (b) What happens to an override whose anchor no
  longer resolves — dropped, quarantined-but-shown, or best-effort remapped. (c)
  Whether history is document snapshots, an op-log, or both.
- **Proposed default.** Stable IDs for palette/regions; overrides anchor to
  `(rowId, needleIndex)` where rowId is stable across inserts; an unresolvable
  override is *quarantined and surfaced* (listed with an invalid badge, like the
  official app's gray layers but non-destructive and per-item, never a cascade).
  History = op-log with periodic snapshots (also the AI tool-use substrate, R7).
  **This format is the contract every other slice depends on — design it first,
  version it (`ColorworkProjectV1`), and schema-test it like `ColorworkChartV1`.**
- **Decision.** Implemented in `@kniterate-studio/project-contract`: base state +
  one schema-validated `ProjectEdit` op-log + cursor, with authoritative replay
  and 50-edit checkpoints used only as validated acceleration caches. Stable
  `rowId` anchors survive insertion; unresolved row/needle anchors are retained
  and quarantined with a reason. Human, assistant, and system edits share the
  same union and undo timeline.

### R3 — Live recompile performance at blanket scale · CLOSED 2026-07-12

- **What.** Paint → recompile → machine-view render, target < 1s, on blanket-scale
  charts (hundreds of rows × ~200 wales → tens of thousands of passes).
- **Why high-risk.** "Live" is the whole premise of P1–P3 and the speculative
  compile in P5. If a full recompile is 3–5s, the product degrades to the
  compile-and-wait model we're replacing. The vendored loop visualizer already has
  a ~8k-op ceiling; the compiler's own cost at blanket scale is unmeasured.
- **Decision needed.** (a) Is a full recompile fast enough, or do we need
  incremental/regional recompile? (b) Compile on the main thread or a Web Worker?
  (c) Does the machine column window/virtualize (render only passes near the
  focus) — proposal assumes yes.
- **Proposed default.** **Measure first** (benchmark `compileChartToKnitout` +
  `predictedPasses` on a 200×300 chart before committing an approach). Then: Web
  Worker for compile, virtualized pass list, debounced recompile during paint with
  an optimistic chart render. Incremental compile only if the benchmark demands it
  — don't build it speculatively.
- **Decision.** The pinned 200×300 four-color birdseye benchmark is ~579 ms
  median / ~647 ms p95 on the current Node runtime, producing 487,928 ops and
  5,032 predicted passes with ~121 MB maximum observed heap growth. This clears
  the <1s product threshold but is too long for the UI thread. Use a Web Worker,
  debounce full deterministic compile after edits, render the canvas
  optimistically, and defer incremental compilation until browser evidence says
  it is needed. Report: `docs/benchmarks/m3a-blanket-benchmark.json`.

### R4 — Simulator fidelity vs verdict trust ("Phase E" caveat) · BLOCKING

- **What.** The machine column shows `predictedPasses()`. Docs note prediction is
  not yet whole-program byte-perfect (single-`xfer` prediction deferred; bind-off
  tails can diverge). `kcToKnitout` is viz-fidelity only, not a byte round-trip.
- **Why high-risk.** If predicted passes diverge from actual vendor output, the
  machine view and any verdict derived from it can mislead. We must be explicit
  about which diagnostics are *verdict-grade* (safe to gate export) vs
  *preview-grade* (shown, but labeled approximate).
- **Decision needed.** (a) The contract: which validators/diagnostics are trusted
  to gate export, and which are advisory. (b) Whether S1's verdict is computed from
  the plan/validators (trusted) or from predicted passes (approximate) — proposal
  says the former. (c) How preview-grade regions are visually marked.
- **Proposed default.** Verdict is computed from the plan + the six validators (the
  byte-parity-tested path), never from simulator prediction. The pass grid is a
  *view*; where prediction is known-approximate, mark those rows and never let them
  flip the badge. Diff/parity against the vendored backend over the corpus is the
  regression net.

### R5 — Back-face preview derivation cost

- **What.** P4's headline differentiator: front + back fabric preview per backing
  strategy, claimed as a "cheap per-cell color projection of the backing algorithm".
- **Why high-risk.** If back-face color actually requires running the full pass
  planner (not just a per-cell function), it's neither cheap nor instant, and the
  backing picker's live comparison degrades. The mockup fakes it with a schematic
  projection; the real derivation is unconfirmed.
- **Decision needed.** Do the birdseye/ladder/complement walkers expose (or can
  they cheaply expose) a per-cell back-bed color without a full compile?
- **Proposed default.** Add a `backFaceProjection(chart, technique)` to machine-lib
  returning a per-cell back color per strategy, derived from the same rules the
  walkers use. If a strategy genuinely needs a full plan to know its back face,
  cache the last compiled plan and read back-bed knits from it (still cheaper than
  recompiling per hover). Confirm feasibility in S1 spike, before S2 depends on it.

### R6 — Verdict semantics: validator output → 4-state ladder

- **What.** The exact mapping from `ValidationMessage[]` (error/warning/info) +
  registry match → {Blocked, Experimental, Surface-proven, Knit-proven}, plus the
  waiver flow for Experimental.
- **Why high-risk.** The verdict gates export and bounds every AI claim (P3, P5). A
  fuzzy mapping produces a dishonest badge — the one thing the product must never
  do.
- **Decision needed.** (a) Rule table: any `error` → Blocked; what distinguishes
  Experimental from Surface-proven (developer-mode features? unresolved warnings?
  waivers?); Knit-proven strictly from a registry fingerprint match. (b) What a
  waiver is (logged, per-project, re-shown on reopen) and who can grant it.
- **Proposed default.** `error` ⇒ Blocked; a clean plan with only info/benign
  warnings ⇒ Surface-proven; use of a developer-mode/experimental capability or an
  accepted waiver over a real warning ⇒ Experimental (with the logged waiver
  visible); exact `recipe-fingerprint` match against a physical `registry/swatches`
  entry ⇒ Knit-proven. Never auto-Knit-proven. Reuse `validators/messages.ts` copy
  verbatim in the panel.
- **Resolved 2026-07-12 — foreign-file rule (S1).** A foreign `.kc`/`.k` (opened,
  not compiled by us) has no plan; its verdict is computed from the `kcToKnitout`
  reconstruction run through the op-level + bed-state validators. Any error ⇒
  **Blocked**. Clean ⇒ **Surface-proven (imported)** — the same rung, with a
  mandatory annotation ("imported — reconstructed at viz fidelity") on the badge
  panel and run sheet; known-approximate regions are marked preview-grade in the
  pass grid and can never flip the badge (consistent with R4). Waivers behave as
  usual (⇒ Experimental). Knit-proven stays registry-fingerprint-only — a file we
  previously exported can legitimately match. **No fifth rung.**

### R7 — AI tool-use surface & speculative compile

- **What.** The assistant edits the project file via schema-validated tools and
  speculatively compiles proposals to show real verdict/time before apply.
- **Why high-risk.** If the AI can produce edits the human editor can't express,
  the shared-diff-renderer promise breaks and review becomes untrustworthy. If
  speculative compile is slow (ties to R3), "verdict before apply" fails. If the
  edit tool schema is loose, the AI can corrupt the project file.
- **Decision needed.** (a) The edit-operation schema (the *same* ops the UI emits:
  paint region, set strategy param, add/remove override, recolor, resize). (b)
  Sandbox model for speculative compile (off-document clone, same compiler). (c)
  Whether the model runs client-side call-out or via a thin proxy; failure mode
  when offline.
- **Proposed default.** Define one `ProjectEdit` op union shared by UI and AI;
  the AI has no privileged ops. Speculative compile runs the same in-browser
  compiler on a cloned project in the Worker. Model access via a pluggable
  endpoint; offline ⇒ assistant disabled, everything else works. Build S3 only
  after R2 (project file) and R3 (compile perf) are settled.

### R8 — Chart canvas: shared core vs re-implementation (depends on R1=B)

- **What.** KnitLab Chart's canvas is React within a large `App`; Studio needs the
  same painting core.
- **Why high-risk.** Copy-paste → two canvases drift and colorwork behavior
  diverges across the two products. Full extraction → coupling and release
  coordination between two independently-deployed repos.
- **Decision needed.** Extract a shared canvas-core package consumed by both, or
  re-implement a minimal painter in Studio and treat KnitLab Chart as a separate
  lineage.
- **Proposed default.** Extract the *cell-model + paint-tools core* (not the whole
  App shell) into a small shared package; each product keeps its own chrome. Accept
  the coordination cost as the price of not drifting the thing users care about.

### R9 — Engine parity gaps (scope, not architecture)

- **What.** Full-needle/lined jacquard (walker retired 2026-05; `lined` → ladder
  fallback) and jacquard border-closing options are not at parity.
- **Why medium-risk.** They block a clean "full colorwork parity" claim but don't
  affect the UI architecture. Deferrable within S2, not before it.
- **Decision needed.** Revive full-back DBJ and verify against official full-needle
  output now, or ship S2 with these marked "not at parity" and fast-follow?
- **Proposed default.** Ship S2 with them explicitly flagged in the parity matrix;
  schedule revival as a contained engine task with a byte-diff test against
  official output.

### R10 — Unified undo/history across three edit sources

- **What.** Painting (L1), overrides (L3/L4), and AI applies must land on one
  timeline with reliable undo (vs the official app's destructive saves).
- **Why medium-risk.** If the three sources have separate histories, undo becomes
  unpredictable — a usability regression that undercuts a headline advantage.
- **Decision needed.** One op-log for all three (recommended), or per-surface undo
  stacks reconciled at save.
- **Proposed default.** Single op-log in the project file (R2); every mutation —
  human paint, override edit, AI apply — is the same `ProjectEdit` op, so undo is
  uniform and the AI's work is undoable by construction.

### R11 — Provenance plumbing (row ↔ pass ↔ `.kc` line) · BLOCKING for S1

- **What.** Every synced view (hover-sync, anchored diagnostics, `kc-diff`
  windows) and every AI diff card depends on stable maps chart row → plan pass →
  knitout op → `.kc` line that survive waste offsets, kicks, vendor auto-moves,
  and L4 patches.
- **Why high-risk.** This is the hardest thing to retrofit. Bolted on later,
  anchors degrade into UI-side heuristics that break silently — hover highlights
  the wrong pass, a diagnostic points at the wrong needle, and the verdict's
  anchored explanations stop being trustworthy.
- **Decision needed.** (a) Where provenance lives: required fields on
  pass/op (plan passes already carry `srcRow`) vs side tables. (b) The stability
  contract across each lowering stage, including through the vendor converter
  (pass → `.kc` block spans via `sim/kc-section.ts` parsing).
- **Proposed default.** Provenance is a **required field at every stage** from
  the first Studio wiring: ops carry their source pass id, the conversion step
  records pass → `.kc` line spans, and `RunArtifact` ships the joined maps. The
  UI never computes an anchor itself.

### R12 — Walker proliferation

- **What.** `plan/chart-body-walker.ts` dispatches to per-technique emitters in
  `passes/`; each new technique (full-back DBJ revival, R9, is the live example)
  multiplies the parity/test surface.
- **Why medium-risk.** The pull toward copy-paste walkers is strong; drift lands
  in whichever walker lacks a fixture, and the bug surfaces as a wrong fabric —
  the most expensive kind to discover.
- **Decision needed.** How much pass-building is shared primitives vs per-walker
  freedom; the fixture policy for new techniques.
- **Proposed default.** Extract shared pass-building primitives; push technique
  variation into data (pass recipes) where possible. **A technique does not ship
  without a golden reference fixture and a parity test.**

### R13 — Twin mini-compilers (UI drift from engine truth)

- **What.** Mockups fake pass math (fine for mockups). Once the real chart
  canvas embeds (R1) and views get interactive, any UI-side reimplementation of
  "what will the machine do" — pass counts, float detection, back-face color —
  becomes a second compiler that drifts from machine-lib.
- **Why medium-risk.** Two implementations of machine truth is how the verdict
  stops being trustworthy: the UI shows one thing, the export does another.
- **Decision needed.** None — this is a standing rule, recorded here so reviews
  can point at it.
- **Proposed default.** Views render exclusively from `RunArtifact` (A.5 §1).
  Anything a view needs that the artifact lacks (e.g. `backFaceProjection`, R5)
  gets added to machine-lib, not computed in the app.

---

## C. Recommended pre-code spikes

Before S2 opens, three small spikes de-risk the blocking items cheaply:

1. **Compile benchmark (R3).** Time `compileChartToKnitout` + `predictedPasses` on
   a 200×300 four-color chart. Decides Worker vs main-thread and whether
   incremental compile is needed. *One afternoon; gates the S2 approach.*
2. **Back-face feasibility (R5).** Prove a per-cell `backFaceProjection` for
   birdseye + complement without a full plan. *Confirms P4 is cheap.*
3. **Project-file + override round-trip (R2).** Author `ColorworkProjectV1`, apply
   an override, insert a row, recompile, confirm the override re-anchors or
   quarantines correctly. *Validates the anti-fragility claim before it's load-bearing.*
4. **Browser converter adapter (A.1).** Port the `knitlab2` Worker pattern into
   `apps/studio`: load the vendored `.cjs` in a Web Worker, convert one corpus
   file, byte-compare against `nodeKCodeConverter` output. *One afternoon;
   proves the no-backend claim end-to-end in this repo.*

## D. What is NOT in question

To keep the agents from re-litigating settled ground: the pipeline stays (move,
don't rewrite); verdict honesty is non-negotiable (no auto-Knit-proven); one
hardcoded 7gg machine profile (no profile UI in v1); no garment engine, hand-knit,
raw `.kc` editing, or second profile in v1 (see FOUNDING §2, §6). The four nouns
hold: project, chart, machine view, verdict.
