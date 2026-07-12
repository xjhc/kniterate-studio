# Kniterate Studio — UI/UX proposal

**Status:** proposed direction, 2026-07-12. Not yet adopted into
[`FOUNDING.md`](./FOUNDING.md); §8 below names one deliberate revision to the
founding boundary that needs a decision before it lands.

**Companion artifacts**
- Interactive workspace mockup (canonical, 2026-07-12):
  [`docs/mockups/workspace-v2.html`](./mockups/workspace-v2.html) — paint the
  chart, switch backing, drive the waiver/blocked paths, hover a row to sync all
  six pipeline stages. Body-only file (Artifact format); earlier iterations live
  in `docs/mockups/archive/`. Published:
  `https://claude.ai/code/artifact/09e9cecb-67d9-411e-914a-59fb8d7f350d`.
- Rendered proposal (shareable): claude.ai artifact
  `https://claude.ai/code/artifact/3675603a-7d2e-49a5-836f-e5d3f97f1c38`.
- Engineering handoff + open risks: [`SYSTEM-DESIGN.md`](./SYSTEM-DESIGN.md).

This document is the source of truth. The artifact is a presentation of it; if
they diverge, this file wins.

---

## 1. Diagnosis

Every documented pain point in the official Kniterate editor ("Customist
Studio"), and most of what made `knitlab2` feel heavy, traces to one modeling
mistake: **the user is made to edit the machine's plan when they mean to edit
the fabric**, while the machine's real behavior stays hidden until a one-way
compile.

- Apply Birdseye Jacquard in the official app and the motif "shows on the canvas
  with an expanded appearance" — one visible row becomes N single-color machine
  rows *on the surface you were drawing on*. Editing colorwork afterwards means
  painting carriage passes.
- Its command stack is non-destructive in name only: modifying an earlier
  command strikes every later one gray ("gray and white stripes") for manual
  re-verification; commands anchor to absolute canvas coordinates.
- Export is one-way (`.kc` "cannot be imported back"); saves can't be undone;
  validation is a Checks button you remember to press.

Studio already has the opposite foundation: a proven, deterministic pipeline
`chart → plan → knitout → .kc` that re-derives everything from intent,
byte-reproducibly. The UI's job is to make that pipeline **visible and instant**;
the AI's job is to operate it through the same reviewable edits a human makes,
never around it.

## 2. Five principles

1. **A ladder of layers, one truth (P1).** The project is the abstraction; the
   chart is only its top rung. Every layer stays visible; every edit lives at the
   highest rung that can express it, tracked and recompile-safe. See §4.
2. **Declarative strategy, not an imperative stack (P2).** Technique, frames, and
   settings bands are parameters to the compiler, not painted mutations in a
   fragile layer stack. Reordering can't break anything because there is nothing
   to reorder — only values to change and recompile.
3. **The verdict is the interface (P3).** Validation runs continuously.
   Diagnostics anchor to both a chart cell and a machine pass. The ladder —
   Blocked, Experimental, Surface-proven, Knit-proven — is always on screen, and
   export is gated by it.
4. **Show the fabric, both faces (P4).** The back of a jacquard is half the
   design. Preview front and back per backing strategy before knitting, with
   heatmap lanes for roller/speed/stitch-size and honest time + yarn estimates on
   the run sheet.
5. **AI proposes diffs, never facts (P5).** Every AI action lands as a reviewable
   diff with the recompiled verdict shown *before* apply. The assistant explains
   diagnostics; it can never overrule them.

## 3. Parity target

The official app (manual v1.1.0, captured 2026-07-12) is the colorwork parity
target. Its genuine strengths to match: a WYSIWYG stitch grid; Birdseye Jacquard
automation (PNG ≤252px/≤6 colors, MINIMAL/FULL backing, reversible "invert",
full-needle at 0.5 rack, border closing with per-column inner/outer yarn control,
auto carrier ordering); machine-truth heatmap views; Checks classifying
compiler-inserted *kicks* and *moves*; a per-row options column (rack, speed,
roller, stitch size F/R, direction, carrier) with graded and by-block entry.

Its documented weaknesses, which Studio's architecture removes rather than
patches: design intent destroyed on contact with jacquard; a fragile command
stack; one-way lossy files; validation as an afterthought; no fabric truth (no
back-face preview, no time/yarn estimates); cloud/login/cache fragility.

Practitioner signal (Agnes Cameron's Kniterate notes) points at the same target:
the good reference is DesignaKnit's "graphics wizard" — *guided but editable at
every step* — versus "press a button, get a file" tools whose output can't be
reviewed.

## 4. The editability ladder

Is the chart even the right abstraction? The honest framing: **everything here is
an abstraction, including the tools that look like they aren't.** Customist's
canvas reads as machine instructions but its compiler still inserts kicks/moves,
splits transfers, and merges passes. Knitout is machine-independent by design;
its backend decides stopping distances and kick passes. Nobody edits the actual
machine program. The real question is *where editability lives* — and the answer
is a ladder, not a single grid:

| Rung | Surface | Expresses | Edit behavior |
|---|---|---|---|
| **L1 chart** | Chart column | Color per wale × visible row — complete for colorwork, meaningless for tuck textures | Primary editing; free paint |
| **L2 strategy** | Strategy rail | Technique, backing, frames, settings bands, carrier order | Declarative parameters; live recompile |
| **L3 stitch ops** | Chart's structure channel | Tuck / miss / rear-knit / transfer marks per cell (the official app's symbol vocabulary) | Anchored per-cell overrides. Engine-ready: `KnitlabChartState` carries structure+color channels; the plan carries `stitchBindings`. This rung is how non-colorwork fabrics arrive post-v1 without an architecture change. |
| **L4 pass overrides** | Machine column | Pin a setting or explicit miss on a selected pass | The machine view is *addressable*, not just readable. Overrides re-apply on every recompile with a validity status — never a fork of compiled output. |
| **L5 knitout / .kc** | Source view | The lowered program | Read-only + `kc-diff`; the eject hatch to the CMU toolchain. Raw editing stays gated on round-trip parity. |

**The rule that keeps it honest:** edit at the highest rung that can express your
intent; going lower is always possible but always tracked. That is the difference
from Customist (where going lower is the *only* option, so applying jacquard
destroys the rung above) and from button-to-file generators (where going lower is
impossible). It is also how knitout practitioners already work — they write
scripts that *generate* knitout; the script is their intent layer. Studio gives
that layering a UI.

### A machine-aware chart, not a pixel grid

Machine reality that leaks upward is surfaced *in* the chart, not hidden behind
it — a naive pixel grid would lie:

- **Pass expansion as row thickness** — a row gutter shows ×passes per visible row
  (×4 under 4-color birdseye, ×2 under complement); the machine cost of a color
  choice is felt while painting.
- **Carrier parity at the edges** — which side each yarn ends on drives bind-off
  direction and neckline splits; the official manual makes you check this by hand.
- **Wales are needles** — bed position, the 252-needle limit, and centering are
  chart-level facts with a ruler, not compile-time surprises.
- **Floats measured live** — in fairisle mode, float lengths render on the chart
  as you paint; the budget line is visible before the validator fires.

## 5. The workspace

One window, three synced columns under a permanent verdict: **Chart** (edit),
**Strategy** (decide), **Machine** (inspect & override), with the assistant as a
drawer, not a mode. Selection is synchronized everywhere: touch a cell and its
passes light up; touch a pass and its cells light up. On narrow screens the
columns collapse to tabs, but the default posture is cause and effect, side by
side. Progressive disclosure keeps hour one simple (chart + strategy presets +
verdict chip); the machine column earns attention when a diagnostic points into
it, and per-pass detail, the loop-structure lens (the vendored visualizer,
windowed under its ~8k-op ceiling), raw `.kc`, and `kc-diff` live one click
deeper.

See the interactive mockup for the concrete layout and behavior.

## 6. The strategy rail replaces the command stack

The official app's best idea — non-destructive commands — on a foundation that
can't break: a fixed pipeline with typed slots instead of an ordered list of
mutations. A project has **frames** (waste/cast-on, bind-off), a **body
technique** (one proven colorwork strategy), **settings bands** over row ranges,
and **overrides** (rungs L3/L4). That is the whole grammar. Every slot is
declarative; any change recompiles the whole plan in-browser, deterministically;
there is no invalidation cascade because nothing is stacked. Settings bands are
structured editors with graded-ramp support and live heatmap lanes — the official
app's keyword strings ("roller 400 for 2 250 for 5") become a UI, and its
Roller/Speed/StitchSize views become always-on gutters next to the machine column.

`knitlab2` already ran this experiment: its export wizard (Yarns → Prepare → Feel
→ Download) proved the guided WYSIWYG flow users wanted, and showed the failure
mode to avoid — a ~3,000px density cliff, per-field state invisible until the end,
errors far from their cause. The strategy rail is that wizard flattened into a
persistent, always-inspectable panel, revalidated on every keystroke.

### Backing choice is a visual decision

The proven techniques map to what a knitter actually weighs (fabric hand,
reversibility, yarn use, knit time), so the picker shows consequences, not names —
front face, back face, passes/row, and time estimate per candidate. The back-face
preview is a per-cell color projection of the backing algorithm the compiler
already runs, and it is a capability the official app lacks entirely: today you
learn what MINIMAL vs FULL backing looks like by knitting both.

Proven walkers today: fairisle floats (tuck-anchoring past the budget), birdseye
DBJ (+0.5 rack), ladder-back, 2-color complement DBJ, plus stockinette/stripes. A
lined / full-back DBJ walker exists but was retired from wizard defaults
(2026-05); `lined` currently falls back to ladder. Reviving/verifying full-needle
jacquard and adding border-closing options are the two engine parity gaps.

## 7. What "AI-native" means here

Not a chatbot bolted to a canvas. The architecture is already an agent loop:
declarative intent in, deterministic compile, machine-checkable verdict out. AI
slots into exactly three places, always through the same artifacts a human edits:

- **Intent → diff.** "Recolor to 3 yarns keeping the motif", "close the edges",
  "generate a 60×80 snowflake in this palette", "make it reversible". The
  assistant edits the project file; the UI renders a visual diff with the
  recompiled verdict *before* apply. Undo works because it is just an edit.
- **Diagnosis → explanation → fix.** Every validator message becomes
  conversational: what it means physically, where it is (dual anchor), and 2–3
  fixes ranked by how little they change the design — each fix a diff proposal.
  The grounding exists: `validators/messages.ts` maps every rule to a
  knitter-facing title/explanation/fixActions, and the refusal corpus adds
  "designs like this failed on the machine for this reason".
- **Verdict-bounded honesty.** The assistant can never claim knittability the
  ladder doesn't grant. "Knit-proven" stays a physical fact from the swatch
  registry — the AI can cite it, never mint it.

Two enablers: the single project file (a JSON package that fully re-derives the
design) is the ideal tool-use substrate — an agent operates on it with
schema-validated edits, and one diff renderer serves both human review of AI work
and AI explanation of human work. And because the compile loop is in-browser and
deterministic, proposals are **speculatively compiled**: cards show real pass
counts, time deltas, and the real verdict, not guesses.

## 8. The one strategic decision — where does painting live?

The founding split (KnitLab Chart authors, Studio compiles) protected scope but
routes the product's core loop through a file download. Colorwork design is
paint → see consequence → adjust, dozens of times an hour, and every AI proposal
needs a canvas to land on.

- **A — Keep the file handoff.** Cleanest boundary; breaks the core loop; AI can
  only propose strategy changes, not chart edits.
- **B — Embed the chart canvas in Studio (recommended).** Studio's Chart column
  becomes a real editor (the canvas core exists in KnitLab Chart).
  `ColorworkChartV1` stays the interchange; KnitLab Chart lives on as the free
  standalone charting tool. Closes the loop in one window, reuses proven code,
  keeps both deploys independent. Costs: one more surface to own; the two canvases
  drift unless the core is shared deliberately.
- **C — Merge the products.** Maximum coherence; re-grows the monolith that made
  `knitlab2` heavy; gives up the independent GitHub Pages product.

**Recommendation: B.** It revises FOUNDING's "Studio does not host the chart
editor" line deliberately; the founding rationale (shed hand-knit legacy, keep
scope tight) survives — only the colorwork cell canvas moves, which is exactly
the surface users said they valued. The complexity budget holds at four nouns:
project, chart, machine view, verdict — the chart just becomes editable inside the
project. **This decision is a prerequisite for the build order below; see
SYSTEM-DESIGN.md Risk R1.**

## 9. Open source to lean on

- **knitout (CMU Textiles Lab)** — already our IR; keep emitting spec-clean
  knitout with Kniterate extensions so ecosystem tools stay usable.
- **knitout-backend-kniterate** — the reference knitout→.kc converter; already
  vendored. It *produces* our `.kc`, so it cannot be an oracle for our own
  output — the conformance oracle is **predicted-vs-vendor parity**: the
  `CarriageSimulator` predicts the passes the backend will emit, and the parity
  suites (`predicted-vs-vendor`, reference-kc corpus) check prediction against
  actual (see SYSTEM-DESIGN A.5 §6).
- **knitout-live-visualizer** — vendored; the windowed loop-structure lens
  (~8k-op ceiling → detail view, never primary).
- **gabrielle-ohlson/knitout-image-processing & knitify** — the most complete open
  colorwork automation (birdseye generation, image→knitout); mine for
  backing-generation parity tests.
- **DesignaKnit 9** (UX reference only) — the "graphics wizard" pattern.
- **Co-dithering research (2025), img2track** — for later generic image import;
  quantization/dithering is solved in the literature.

## 9b. Field evidence → binding UX decisions (added 2026-07-12)

Sources: Agnes Cameron's colourwork notes ([soup, 2026-07-09](https://soup.agnescameron.info/2026/07/09/colourwork.html))
and knitout-on-Kniterate log ([soup, 2025-09-20](https://soup.agnescameron.info/2025/09/20/kniterate.html));
the official changelog v1.1.0→v2.0.24 (editor.kniterate.design/changelog).
Each finding binds a decision; `BUILD-S1.md` and `SYSTEM-DESIGN.md` cite these.

| # | Evidence (practitioner / official) | Binding decision |
|---|---|---|
| E1 | "Sequences of many rows in the editor but physically knit in fewer" — jacquard row expansion destroys design intent; the official canvas does exactly this | The chart stays in **design rows, always**. Machine expansion is the pass grid's job; the ×N pass gutter + hover-sync is the contract (R11). Never expand rows in the chart. |
| E2 | DesignaKnit's wizard praised for "guiding construction thinking" vs "press a button, get a file" | The strategy rail is a **decision surface**: every technique/frame change shows its consequence delta (passes/row, time, reversibility, back face, verdict) *before* applying. The diff-card pattern applies to human edits, not just AI. |
| E3 | "Unclear often what's issues with the file vs the machine being quite particular" — her only pre-flight check was eyeballing a visualizer | Diagnostics are **attributional**: every warning names the physical failure mode it predicts, with a needle/pass anchor. The verdict gates export. The refusal corpus grows from real machine incidents (S4). |
| E4 | Open tools "automatically used [C1/C6] for the pattern"; she fixed a missing bring-in by hand-editing `in 3` | Carrier reservation (C1 draw / C6 waste) is a **validator error, not a convention**. Palette→carrier binding is visible in chart, dock, and run sheet. |
| E5 | Waste section manually prepended per file (width bugs); "outhook doesn't work on the kniterate" — bind-off unsolved in open tooling; Ohlson's automation praised | The frame (waste/draw/cast-on/bind-off) is **default-on, engine-generated, verdict-checked, and inspectable** (collapsed pass-grid sections + run sheet). Never a manual prepend. `machine-bindoff` (xfer chain) is our built answer to the outhook gap (SYSTEM-DESIGN A.4). |
| E6 | The official changelog *leads with* "please hard refresh" to avoid stale caches; expired sessions broke Save; login required | **Local-first**: static hosting, project = durable local JSON, the core loop works logged-out and offline, versioned assets. (Confirms A.3.) |
| E7 | Official v1.1.0 spent almost the whole release on canvas ergonomics: tool shortcuts (M/S/P/L/R), zoom-to-selection, insert-rows-between, persistent markers, undo keeps the active tool, commands act immediately on selection | Canvas ergonomics are **table stakes, not differentiators** — S2 matches that shortcut set, undo preserves the active tool, commands apply immediately, annotations persist in the project file (R2 schema includes them). |
| E8 | "Version changes between different repos might introduce a lot of issues" — scattered-toolchain fear | Monorepo + pinned vendored converter + parity CI (A.5). The user never sees a toolchain. |
| E9 | A collaborator "avoids editing modules due to unfamiliar symbolic language" | L5 source is **readable-first**: the dock explains `.kc`/`.k` line-by-line; machine-code *editing* stays out of v1; validator copy stays knitter-facing (`validators/messages.ts`). |
| E10 | v2.0.24 pivots the official product to community/sharing (Customist), not machine truth | Strategic: verdict honesty, back-face preview, and time/yarn estimates remain **uncontested differentiators** — hold the machine-truth line (FOUNDING). |

## 10. Build order (extends the existing M2–M4 gates)

| Slice | Ships | Gate |
|---|---|---|
| **S1 · machine truth** (= M2) | Open any `.kc`/`.k` → pass grid, verdict badge + panel, anchored diagnostics, run sheet, `kc-diff`. Builds the Machine column once, reused forever. | Reference corpus renders + verdicts correctly; a known-bad file shows Blocked. |
| **S2 · the loop** (= M3, reframed) | Embed chart canvas (Option B) + strategy rail (frames, technique picker with back-face preview, settings bands, palette→carrier) + live recompile + project file with history. | Paint → recompile → machine-view update < 1s at blanket scale; import fixture → export → reopen → revalidate byte-identically. |
| **S3 · assistant** | Diagnostic explainer + intent→diff proposals (strategy params first, chart edits second, motif generation third), speculative compile behind every card. | Every AI apply is undoable; no assistant claim exceeds the computed verdict. |
| **S4 · proven** (= M4) | Physical swatch registry wired to the badge; refusal corpus grows from failed swatches and grounds the assistant. | ≥4 registry entries; a matching export shows Knit-proven. |

Parity gaps to schedule inside S2: border-closing options, full-needle jacquard
verification, manual yarn-order control. Everything else on the official colorwork
checklist is engine-done and waiting on UI.
