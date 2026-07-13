# STATUS — what is shipped vs. proposed

**Front door. Read this before any planning doc.** Reconciled 2026-07-13 against
the working tree. Repo at `1.0.0-rc.1`; `pnpm typecheck` and `pnpm test` green.

The other docs are framed as forward design and drifted behind the code. Where a
planning doc says a thing is "proposed" / "not built" / "the first slice to
ship," trust this file and the working tree instead.

---

## Shipped (in `apps/studio`, live today)

- **Foreign-`.kc`/`.k` workspace (Story 1 / "S1").** Open any `.kc` or knitout
  `.k` → virtualized pass grid, anchored diagnostics, scroll-synced source dock,
  `kc-diff` between two files, printable run sheet, verdict badge. Code:
  `apps/studio/src/engine.ts` (`openMachineDocument`) + `App.tsx`. **This is
  built — it is not a slice waiting to start.**
- **Authored chart → compile → k-code loop (Story 2 / "S2" core).** Embedded
  colorwork chart editor (`src/chart/*`), strategy rail (backing techniques,
  float budget, frame: waste/draw/bind-off), off-thread compile
  (`src/blanket/compile.worker.ts` → `compileToRunArtifact`), predicted pass
  grid, back-face preview, browser `.kc` conversion in a Worker
  (`src/kcode/convert.worker.ts`), validated export, local autosave, run sheet.
- **Synchronized authored workspace.** Chart, backing/frame strategy, selected
  design-row passes, full-program frame regions, attributional diagnostics, and
  collapsible Knitout/K-code source now share the canonical cause/effect layout.
  Narrow screens use explicit Chart / Strategy / Machine tabs; export remains
  hard-gated by the authored verdict.
- **Central authored verdict policy + typed provenance.**
  `engine.ts::resolveAuthoredVerdict` is the sole authored 3-rung policy owner.
  Design-row provenance travels on typed knitout ops, is exposed as an aligned
  `RunArtifact` map, and joins validator diagnostics to chart rows without
  scanning emitted comments.
- **Engine (`packages/machine-lib`).** Chart→plan→knitout→`.kc` compile,
  `CarriageSimulator` + `predictedPasses`, the three validator layers, `kc-diff`,
  `kcToKnitout` reconstruction, Node + browser `KCodeConverter` adapters, the
  13-file reference-kc corpus, the 6-case refusal corpus, topology oracle, and
  the physical swatch registry (empty today).
- **Dark mode**, **local-first** (no backend/login/telemetry), **R1 = B**
  (embedded shared canvas — adopted in FOUNDING §80 / ROADMAP M3B, shipped).

## Verdict model (V1 — three rungs, no waivers)

**Blocked / Surface-proven / Knit-proven.** Experimental and the waiver workflow
were **cut from V1** on 2026-07-12 (ruling in SYSTEM-DESIGN R6). Rationale: they
add a substantial honesty/persistence model without serving the present
four-pattern-color goal, and no project-level waiver contract exists in code. A
later carrier-strategy feature can reintroduce the concept through a real project
schema.

- **Foreign file** (`engine.ts`): any error **or unresolved warning** ⇒ Blocked
  (no project context to accept a warning); clean ⇒ Surface-proven (imported);
  registry artifact match ⇒ Knit-proven.
- **Authored** (`engine.ts::resolveAuthoredVerdict`): compile or output error ⇒ Blocked; clean ⇒
  Surface-proven (non-gating warnings, e.g. over-budget floats, stay visible on
  diagnostics and the run sheet); exact registry match ⇒ Knit-proven.

## Not yet built

- **Forward design (still proposed, unbuilt):** the assistant / AI-as-diff (S3),
  swatch-registry UI (S4), and the L3–L5 upper editability ladder (stitch ops,
  pass overrides, machine-code editing stays read-only per FOUNDING §2).

## The one real promotion gate

`1.0.0-rc.1` → `1.0.0` is gated **only** by a successful real-Kniterate run
(`V1-PHYSICAL-TRIAL.md`). Registration, hash checks, exact-artifact Knit-proven,
and `release:physical-check` are implemented. **Do not tag `1.0.0` before the
machine run succeeds.**

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
