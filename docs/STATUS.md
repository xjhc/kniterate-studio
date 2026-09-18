# STATUS — what is shipped vs. proposed

**Front door. Read this before any planning doc.** Reconciled 2026-09-17 against
the working tree. Repo at `1.0.0-rc.1`; `pnpm verify:kcode` and `pnpm verify`
are the software gates. The debugger milestone below records implementation
and focused local coverage; full-gate status belongs to the exact current
proof receipt, not this document date.

The other docs are framed as forward design and drifted behind the code. Where a
planning doc says a thing is "proposed" / "not built" / "the first slice to
ship," trust this file and the working tree instead.

---

## Implemented in `apps/studio`

- **Foreign-`.kc`/`.k` workspace (Story 1 / "S1").** Open any `.kc` or Knitout
  `.k` → canonical V1 KCode semantics, strict byte-preserving intake, pinned
  lowering and scheduled-pass differential for `.k`, virtualized pass grid,
  exact movement view, anchored diagnostics,
  scroll-synced source dock, full-raster MachineTrace diff, printable run sheet,
  verdict badge. Code:
  `apps/studio/src/engine.ts` (`openMachineDocument`) + `App.tsx`. **This is
  built — it is not a slice waiting to start.**
- **One-file foreign checker.** `pnpm machine:check -- <file.k|file.kc>` uses
  the same byte-preserving intake, pinned lowering, scene projection,
  differential, diagnostics, and conservative warning verdict as Studio.
  `--json` emits a bounded versioned receipt with SHA-256 and explicit format
  evidence; use `pnpm --silent machine:check -- <file> --json` when stdout must
  be JSON only. Exit `0` means Surface-proven (imported), `1` means checked but
  Blocked, and `2` means usage/read/internal failure. Both the Studio verdict
  panel/run sheet and the CLI disclose that direct KCode cannot prove source
  carrier lifecycle.
- **Shared authored/imported topology inspection.** Validated emitted KCode
  feeds the same schematic view in both workspaces. The Worker retains a full
  bounded graph of up to 200,000 loops, 800,000 connections, and 600,000 transfer
  movements. It indexes contiguous pass windows and returns at most 6,000 nodes,
  18,000 edges, and 18,000 movements to the renderer; reaching a display-window
  limit no longer rejects the entire accepted file. Stable IDs resolve lineage
  outside the window, and incoming boundary connections are counted explicitly.
  Local corpus coverage opens all 12 accepted reference files through this
  pipeline. Blocked, malformed, or over-budget full graphs remain withheld.
  Coordinates and geometry remain schematic software topology, not physical
  fabric.
- **Execution cursor for authored/imported KCode.** Ordered rack commands,
  pass boundaries, and actions share source anchors with machine views and
  topology selections. Step before/after an action, scrub backward, play program
  order, and inspect full front/rear loop counts and all six carriers' last
  encoded stops. The off-thread index uses event deltas and a checkpoint every
  256 events, bounded to 400,000 events and 1,024 loop coordinates; inspection
  replays at most 255 events. Unobserved carrier positions remain unknown,
  within-pass motion and physical time are not reconstructed, and loop state
  uses the empty-bed job assumption. Blocked/unknown loop state is withheld.
- **Cancelable machine import and honest foreign setup.** Browser imports run
  strict intake/lowering off-thread with cancellation and stale-result refusal.
  KCode resource preflight streams line records and stops at the first exceeded
  limit before materializing the record list. Foreign run sheets label carrier
  roles unspecified; they do not inherit authored C1 draw/C6 waste assignments.
- **Retained foreign inspection and source-bound checkpoints.** One import
  Worker owns the full parse, trace, validation, execution index, topology, and
  exact diff. The renderer receives source/verdict summaries, compact navigation,
  and one inspected pass; replacing a document disposes its Worker. Large-file
  browser coverage checks both responsiveness and Worker cleanup.
  Imported `.kc` and KCode emitted from `.k` can save/load a JSON checkpoint
  containing only a cursor, breakpoints, and exact KCode/profile binding. Restore
  recomputes state and verifies the event anchor. It does not resume a machine,
  accept loaded-bed state, or change the verdict.
- **Exact authored-coordinate bridge for physical trials.** The pinned lowering
  receipt now binds compiler/project endpoints to the actual `Position`-derived
  marker-free KCode columns and normalized trace coordinates for the exact
  KCode SHA-256. Trial and registry evidence persist and freshly compare that
  basis, including increasing or decreasing physical-label orientation. This
  closes the software seam only; two machine-observed endpoints and independent
  pre-run verification remain required before any physical needle label claim.
- **Provenance-safe row/pass metrics.** Authored run sheets distinguish design
  rows from emitted machine passes. Foreign `.kc`/`.k` workspaces, print sheets,
  and checker receipts expose strict-trace programmed passes and loop-forming
  passes (knit/tuck/split) while explicitly marking authored rows unavailable;
  transfer-family split is counted, but drop and repositioning passes are not.
- **Programmed-motion receipt.** Strict KCode traces expose exact encoded
  stop-coordinate travel. A separate model uses the profile's documented 3.63
  mm needle pitch and each pass's encoded speed only as explicit assumptions;
  nonpositive contributing speed fails the time term closed. Foreign/authored
  run sheets, checker receipts, and the exact-candidate trial manifest keep this
  beside—not merged with—the authored-plan heuristic. No physical travel,
  elapsed-time, lower-bound, or universal-calibration claim is made.
- **Exact-candidate physical-settings receipt.** The release-trial manifest
  extracts the compiled stitch, transfer-stitch, speed, roller, transfer style,
  carrier spacing, and stopping-distance values and prints them for independent
  controller comparison. Registration and the fresh physical-registry check
  preserve those settings; any mismatch, deviation, or in-run intervention
  blocks promotion. This is a candidate recipe, not a safe operating envelope.
- **Authored chart → compile → k-code loop (Story 2 / "S2" core).** Embedded
  colorwork chart editor (`src/chart/*`), strategy rail (backing techniques,
  float budget, frame: waste/draw/bind-off), off-thread compile
  (`src/blanket/compile.worker.ts` → `compileToRunArtifact`), predicted pass
  grid, back-face preview, browser `.kc` conversion in a Worker
  (`src/kcode/convert.worker.ts`), strict emitted-output proof, validated export,
  local autosave, run sheet.
- **Synchronized authored workspace.** Chart, backing/frame strategy, exact
  emitted design-row passes, full-program frame regions, KCode-native findings,
  carriage/carrier/two-bed movement, loop-state transitions, and collapsible
  Knitout/KCode source now share the canonical cause/effect layout.
  Narrow screens use explicit Chart / Strategy / Machine tabs; export remains
  hard-gated by the authored verdict.
- **Central authored verdict policy + typed provenance.**
  `engine.ts::resolveAuthoredVerdict` is the sole authored 3-rung policy owner.
  Design-row provenance travels on typed Knitout ops and is joined through the
  pinned backend's exact scheduled-pass source lines; the UI does not align
  emitted output by predicted-pass position or scan comments.
- **KCode proof engine (`packages/machine-lib`).** Strict lossless parser/emitter,
  explicit versioned machine profile and eight-operation command decision table,
  exact `MachineTraceV1`, KCode-native
  kinematic and loop-state validator, renderer-ready `MachineSceneV1`, bounded
  loop-identity `MachineTopologyV1`, indexed schematic windows, and
  checkpointed `MachineExecutionIndexV1`, strict
  trace diff, deterministic Node/browser lowering, independent test decoder and
  replay oracle, the 13-file reference corpus, and seeded property,
  grammar/input-mutation, 1,904-case independent command-legality matrix,
  KCode-native refusal/rule-witness ledgers, backend differential, and
  StrykerJS implementation-source mutation rails. Run `pnpm verify:kcode`; its
  deterministic receipt is
  `packages/machine-lib/out/kcode-proof/proof-manifest.json`.
  Under the current foreign-file verdict policy, 12 of those fixtures open
  Surface-proven. Five retain 220 depth-three loop-stack observations which the
  foreign Studio boundary presents as non-blocking information; the shared
  validator retains them as conservative warnings. `fox-baby-beanie.kc`
  remains Blocked by 183 empty-drop warnings. All 13 have zero validation
  errors.
- **Dark mode**, **local-first** (no backend/login/telemetry), **R1 = B**
  (embedded shared canvas — adopted in FOUNDING §80 / ROADMAP M3B, shipped).
- **Bounded authored export** uses a named V1 capacity contract rather than the
  foreign-file limits: the canonical 200x300 four-color Birdseye project
  exports, recompiles byte-identically, and reimports through the ordinary
  strict KCode path; oversized projects fail at typed preflight.

## Software-proof boundary

Software now proves KCode grammar and bytes, deterministic pinned lowering,
equivalence for every machine-executable scheduled field, programmed
operation/direction/carrier/rack contract conformance, stops/selections/actions,
carriage and carrier continuity, transfer pairing, and empty-bed loop-state
transitions. Separately tested topology projection establishes a deterministic
software graph and schematic rendering under that assumption. The validation
report separates profile conformance, modeled state, operational policy, and
controller acceptance. It does not
translate serialized transfer tokens into controller-observed physical direction,
claim physical needle-number labels, stitch geometry or fabric appearance, an
operationally safe speed/roller/stack envelope, yarn behavior, collision
dynamics outside encoded motion, or carrier lifecycle for foreign KCode (KCode
does not encode `in`/`out`). Those boundaries remain explicit in the profile,
validator report, UI, and proof manifest. See
[`KCODE-SOFTWARE-PROOF.md`](./KCODE-SOFTWARE-PROOF.md).

## Verdict model (V1 — three rungs, no waivers)

**Blocked / Surface-proven / Knit-proven.** Experimental and the waiver workflow
were **cut from V1** on 2026-07-12 (ruling in SYSTEM-DESIGN R6). Rationale: they
add a substantial honesty/persistence model without serving the present
four-pattern-color goal, and no project-level waiver contract exists in code. A
later carrier-strategy feature can reintroduce the concept through a real project
schema.

- **Foreign file** (`engine.ts`): any error **or unresolved warning** ⇒ Blocked
  (no project context to accept a warning). The sole evidence-backed V1
  reclassification is a depth-three loop-stack observation: it remains a
  conservative validator warning, but is presented as non-blocking information
  for foreign imports because it occurs in five captured reference fixtures.
  This establishes observed corpus behavior, not who produced the bytes or a
  physical loop-stack limit. Depth four remains an error. Otherwise clean ⇒
  Surface-proven (imported).
  Imported bytes cannot become Knit-proven through caller-supplied registry
  metadata; that requires a future trusted verification seam.
- **Authored** (`engine.ts::resolveAuthoredVerdict`): compile or output error ⇒ Blocked; clean ⇒
  Surface-proven (non-gating warnings, e.g. over-budget floats, stay visible on
  diagnostics and the run sheet); exact registry match ⇒ Knit-proven.

## Not yet built

- **Loaded-bed/controller-resume input:** no supplied initial loop stacks, carrier state,
  controller position, or resumed-job contract. Validation, topology, and cursor
  replay still assume an empty bed at the beginning of the complete job.
- **Physical/controller evidence:** operational speed/roller/stack envelopes,
  controller-observed transfer direction, physical elapsed-time simulation, and
  fabric mechanics remain unestablished. These are not unlocked by debugger
  playback or a complete software topology graph.

- **Forward design (still proposed, unbuilt):** the assistant / AI-as-diff (S3),
  swatch-registry UI (S4), and the L3–L5 upper editability ladder (stitch ops,
  pass overrides, machine-code editing stays read-only per FOUNDING §2).

## The one real promotion gate

`1.0.0-rc.1` → `1.0.0` is gated **only** by a successful real-Kniterate run
(`V1-PHYSICAL-TRIAL.md`). Registration, hash checks, exact-artifact Knit-proven,
and `release:physical-check` are implemented. `release:trial` requires a clean
tree and records its full generating commit; registration requires that same
clean commit. The trial package now binds exact command-legality and proof
metadata; controller observation stays pending until an accepted registry run.
**Do not tag `1.0.0` before the machine run succeeds.**

## Map of the docs

- `FOUNDING.md` — product boundary (three verdict rungs; dark mode in scope).
- `UX-PROPOSAL.md` — UX rationale; part shipped, part forward design (see its banner).
- `SYSTEM-DESIGN.md` — architecture (A.*) + risk register (R*); R6 = 3-rung ruling.
- `ROADMAP.md` — milestone ledger (M0–M3D complete).
- `HANDOFF.md` — reduced to present truth; points here.
- `docs/archive/BUILD-S1.md` — **historical** M2 implementation contract (S1 shipped).
- `docs/mockups/workspace-target.html` + `workspace-target.md` — canonical V1
  workspace mockup and binding implementation contract.
- `docs/mockups/workspace-v2.html` — superseded design reference.
