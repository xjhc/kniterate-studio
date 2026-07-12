# Kniterate Studio — founding doc

**Status: active founding contract, moved to the Studio repository
2026-07-09.** This is the current product boundary and extraction manifest.
[`ROADMAP.md`](./ROADMAP.md) tracks execution from the completed contract-intake
slice through machine-library extraction and the three product stories.

v2 note: v1 of this doc specified a five-level abstraction tower, six views,
an edit matrix, and seven milestones — the same over-broad abstraction pattern
that made knitlab2 feel complex to users. This version scopes the product to
three user stories and moves the engineering vocabulary to an appendix, where
it belongs.

Origin: user feedback (2026-07) — knitlab2 is too complex; knitlab1 (charting
only) is preferred; Kniterate generation is the valued capability; hand-knit
patterns are not useful; Kniterate's own web UI is bad but WYSIWYG.

- **KnitLab Chart** (github.com/areumjo/knitlab) is an active,
  colorwork-only static product. It keeps the evolved chart canvas, palette,
  multi-color tile, image-intake, persistence, and exact-image work accumulated
  in `reference/knitlab`, but drops hand-knit symbols, garments, instructions,
  and every machine surface. It deploys independently to GitHub Pages.
- **knitlab2** is frozen as the reference/archive. The machine library and its
  tests move into this repository wholesale, not rewritten (Appendix B).
- **Kniterate Studio** is this separate repository and product. It consumes a
  versioned, flattened colorwork artifact from KnitLab Chart and embeds the
  shared colorwork canvas for the live paint → compile → inspect loop. KnitLab
  Chart remains the independently deployed, colorwork-only authoring product.

---

## 1. The product — three sentences

1. **Drop in any `.kc`** → see what the machine will do, get an honest
   verdict, diff it against another file, print a run sheet.
2. **Make a blanket** → paint a chart, pick a size and colorwork strategy,
   get a `.kc` with a verdict.
3. **Trust the verdict** → "Knit-proven" only ever means someone physically
   knit that recipe on a real machine.

**V1 release ruling (accepted 2026-07-12):** four simultaneous pattern colors
using C2–C5, with C1 reserved for draw thread and C6 for waste. Additional
pattern colors require an explicit carrier-swap workflow after v1. Release
requires a representative multi-color rectangular blanket to be physically
knit; the Knit-proven claim remains exact-recipe-specific.

The user-facing product has **four nouns: project, chart, machine view,
verdict.** A surface that needs a fifth explained noun is over budget.

## 2. Not in the product (v1)

Garment design. Tubes/hats (the code exists; fast-follow, not v1). Hand-knit
anything (patterns, prose, publication documents, grading, stitch-maps —
retired, not ported). Editing machine code. Machine profile management (one
hardcoded calibration: 7gg worsted). Customizing the machine output of
generated files. MCP, the calculator.

*(Revised 2026-07-12: dark mode was originally on this list; it is now **in
scope** — the design system is token-based and ships light+dark from day one,
so the cost is near zero and the canonical mockup already carries both.)*

## 3. The complexity budget

- A concept ships only when one of the three stories fails without it.
- The abstraction levels (Appendix A) are engineering vocabulary. They never
  appear in the UI, docs, or error copy.
- Features that exist in the library but don't serve a story stay headless —
  no "while we're at it" surfaces.

## 4. Milestones

- **M1 — Extract.** New repo; move the machine library + its ~180 test files;
  conformance rails green in CI. Mechanical (Appendix B is the manifest).
  *Gate:* full machine test suite + `kniterate:conform` green.
- **M2 — Story 1: open, validate, diff.** Home + machine view (pass grid) +
  verdict badge/panel + run sheet + `kc-diff` for any `.kc`/`.k`.
  *Gate:* every reference-corpus file opens, renders, and verdicts correctly;
  a known-bad file shows Blocked.
- **M3 — Story 2: the blanket flow.** Import `ColorworkChartV1` or author in the
  embedded shared canvas; rectangle sizing; palette-to-yarn/carrier assignment;
  the five back-bed strategies with previews; save/reopen as one project file. Generic PNG import may be an
  image-quantization path later, but KnitLab-to-Studio transfer uses the
  structured artifact so palette identity and row convention are not guessed.
  *Gate:* browser e2e — import a four-color chart authored on the deployed
  KnitLab Chart site → assign yarns → size → export accepted + surface-proven →
  reopen + revalidate.
- **M4 — Story 3: Knit-proven becomes real.** Knit and register the first
  physical entries (tension swatch → fairisle → birdseye DBJ → complement
  DBJ); wire the registry match so the badge can flip; failed swatches feed
  the refusal corpus. Runs in parallel with M2/M3; needs a human at the
  machine.
  *Gate:* ≥4 registry entries; a matching export shows **Knit-proven**.

Then stop and put it in front of users before scoping anything else.

## 5. How it's built (the short version)

- **Move, don't rewrite.** The machine path (~40k LOC, ~180 test files —
  compiler, kc codecs, carriage simulator, validators, conformance rails,
  byte-parity suites) severs from the garment engine at one contract with
  four type-only imports. Its value is accumulated machine edge cases; a
  rewrite would lose exactly that. Manifest in Appendix B.
- **No backend.** Studio's `.kc` conversion already runs in the browser; the
  app is static-hostable. KnitLab Chart is independently static-hosted on
  GitHub Pages and communicates with Studio through downloaded files, not a
  runtime service dependency.
- **The machine view is the pass grid** (simulator-backed): row counter,
  direction, carrier, color, rack, time estimate, synced to a needle strip.
  The vendored loop visualizer has a ~8k-op parse ceiling — blanket-scale
  files exceed it — so it serves as a windowed detail lens, never the
  primary view.
- **Verdict UI:** persistent badge (state + "7gg worsted" chip) → panel with
  the ladder rungs and anchored diagnostics. Never a bare green checkmark —
  the level name is the UI. Experimental requires an explicit logged waiver.
- **One project file:** a single durable JSON package (surface-package
  precedent: reopens and revalidates from embedded data), new file extension.
- **Look:** paper-and-ink tokens for type/neutrals; the four verdict states
  are the accent system. Two mockups before M2 chrome: foreign-`.kc`
  workspace, blanket flow.

## 6. Later — recorded so we don't re-litigate, deliberately unscoped

- **Tubes/hats:** re-host the existing flows. First candidate after M4.
- **Garments — as shaped panels, NOT as knitlab2's garment engine.** The
  object ladder adds one concept per rung: rectangle (v1) → tube (v1.5) →
  **shaped panel** — a rectangle whose edges carry shaping cadences ("dec 1
  each end every 3 rows × 12"), authored directly on the shape graph (the
  machine knitter's native pattern draft: silhouette on needle × row grid),
  edits snapping to machine-legal ops. A "garment" is then just a set of
  panels (front/back/sleeves) + seaming notes on the run sheet; the chart
  story is unchanged (paint the surface on the panel, no-stitch mask).
  The machine lowering for shaped panels is already vendor-clean (paired
  edge dec/inc, bind-off chains, W&T short rows) — what's missing is only a
  small panel-outline → row-events compiler feeding those proven emitters.
  **We do not re-import knitlab2's measurement-first CAD** (10 construction
  methods, ease models, schedules, prose): that complexity served hand-knit
  patterns and is what users rejected; on a machine the construction
  taxonomy collapses to "which panels." The engine's only candidate role,
  much later and only on user demand: an optional one-shot **template
  generator** (a few measurements in → an editable panel set out), behind a
  button — never a live parametric session, never the spine.
- **Machine-level customization of generated files:** an annotation model
  (anchored to source coordinates, re-applied on recompile — the
  tension-swatch precedent). Built when a user asks, not before.
- **Raw `.kc` editing:** gated on kc round-trip parity (`kcToKnitout` is
  viz-faithful only today). Explicit one-way "detached" mode if ever built.
- **Second machine profile:** the trigger to design profile UX.

## Appendix A — abstraction levels (engineering vocabulary only)

Object spec (sizes/presets) → chart (`ColorworkChartV1`) → fabric structure
(`FabricIR` rows/events) → knitout passes → `.kc`. Author high, compile down;
every lower layer is derived and reproducible (recompile-from-request →
byte-identical). Shaping primitives are FabricIR row events, not chart cells —
this is why garments can arrive later without changing v1.

## Appendix B — extraction manifest (measured 2026-07-07)

**To `packages/machine-lib` (~40k LOC + ~180 test files):**
`src/knitout/` (compiler, kc codecs, simulator, tension swatch, vendor
converter — *excluding* the garment bridge `plan/compile-package*`,
`notes/tech-pack`, `pattern-program`, which stays behind; if garments arrive
panel-first per §6, a small panel compiler supersedes it rather than
reviving it), `src/chart-core/`, `src/primitives/`, `src/shells/`, `src/toque/`,
`src/surface/` (drop the one garment-fixture call in `corpus.ts`),
`src/colorwork/` machine half (`knitlab1-contract`, `row-rack-schedule`,
cable/shift events, tube adapters, motif intake), `src/validators/` machine
half (chart-continuity, chart-track-a, knitout-program, bed-state,
carriage-policy, tile-conservation), conformance rails + topology oracle +
refusal corpus + `registry/swatches/` + reference `.kc` corpus + `kc-diff` +
`chart-to-knitout`.

**Moved to KnitLab Chart, not Studio:** the evolved chart editor core
(`KnitCanvas`, color palette/block editors, mutation service, image intake,
`.knitlab` serialization, autosave, exact PNG export). The new shell is
colorwork-only. Multi-color tile identity remains in the editable source and
is flattened only in `ColorworkChartV1`/PNG exports.

**Not moved to either product surface:** stitch-maps (~10k), garment designer
UI (~5k), hand-knit symbols/instructions, publication UI, and fabric-ir-demo.
They remain reference material here.

**Studio intake work:** add the small `ColorworkChartV1` parser/projection at
the machine-library boundary. Do not port the 3.7k-LOC chart-editor `App.tsx`,
editor provider, Kniterate wizard host, or vendored visualizer as part of the
chart flow. Studio owns machine view, backing choice, carrier assignment,
verdict, and run artifacts directly.

**Stays frozen in knitlab2:** the 10-method shape engine, schedules,
hand-knit rendering, publication/grading work, preview schematics, MCP,
sessions API, calculator app.
