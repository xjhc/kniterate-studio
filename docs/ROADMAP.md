# Kniterate Studio roadmap

The detailed product boundary and machine extraction manifest live in
[`FOUNDING.md`](./FOUNDING.md).

## Next up, in order (set 2026-10-27)

Work this list from top to bottom. Tick code items when they are committed,
and machine runs when they are registered.

Why this order:

- A real knit finds more than any extra check.
- Presentation-only work outside `COMPILER_FINGERPRINT_INPUTS` leaves the
  compiler fingerprint alone. Authored and sweater runtime helpers are included.
- Every compiler or contract change lands before the M9 freeze, because a
  later change means knitting all three qualification pieces again.
- Each new construction gets a small development knit as it lands.

**A. Now: knit what exists, make it easier**

- [x] Knit the waiting beanie trial candidate as a development run and
  register the result, pass or fail ([`V1-PHYSICAL-TRIAL.md`](./V1-PHYSICAL-TRIAL.md)).
  Knitted as issue #9's mini bird toque; it failed at the start and is
  registered. The flat start, the beanie top and crown settings were fixed
  from it (STATUS, 2026-11-07).
- [x] Knit handoff 2 (issue #9; files at the site's `handoff-2/`). Run 2 is
  registered as partial: best fabric so far, with a frayed bottom-left
  corner and loose turning edges. The operator knitted their own run 4
  variant (4B) and reversible beanies (PR #14) instead of runs 3 and 4.
  Run 1 wasn't knitted. The start's held waste loop is fixed (STATUS,
  2026-11-08).
- [ ] Knit handoff 3 (files at the site's `handoff-3/`), two bind-off strips.
  Strip 1 is the strip with the fixed start. It answers two questions: does
  the corner still break, and does the bind-off break again where it starts?
  Strip 2 adds three of Kniterate's settings: the circular rows at roller 200,
  the bind-off at stitch 4, and "Knit first stitch" at roller 350. If the
  corner breaks again, knit Kniterate's `fairisle.kc` in the same yarns next.
  It has the same cast-on and no catch, so it separates the yarn and cast-on
  settings from Studio's start.
- [x] Give each handoff a run record with the file's sections and passes, and
  pin the fixed start in a test (`flatStart.test.ts`).
- [ ] After handoff 2's results, file changes from Kniterate's own practice,
  checked against our files first:
  - the yarn catch and Kniterate's fairisle start for the birdseye chart,
    whose start still knits at 400 and brings yarns in at 200;
  - spread crown decreases over rows (Kniterate's beanie: 4 per row; the
    mini toque makes 16 in one), and knit the last crown row one stitch
    size larger and the first top-waste row one smaller (Kniterate blog,
    "Decreases in depth", "3 ways of finishing");
  - for sweater pieces: Kniterate's bind-off settings and roller steps, two
    knit rows before a bind-off, armholes not bound off on the same row
    (Kniterate blog, staff).
  Owners' tips to validate before adopting: cutting C1/C6 after the cast-on
  and re-catching C6 for a waste top (EcoKnitware); transferring edge needles
  first and by pass direction (CMU converter issues 5 and 35; needs a
  converter change).
- [x] Give the swatch one place: download and enter it under Your swatch, and
  have the status panel's button go there.
- [x] Start the left panel folded except Size; a Show or fix button opens the
  section it points to.
- [x] Offer Undo right after a one-click fix ("Switched to a birdseye back ·
  Undo").
- [x] Give the swatch its own Before knitting checks, not the piece's.
- [x] Put the warnings that still reach the panel raw into plain words,
  starting with the narrow-chart "below ~30" note. (Checked across charts,
  beanies, sweaters and scarves: the narrow chart and machine-safety
  refusals were the raw ones.)
- [x] Show colour chips when matching motif colours, instead of "Image colour 0".
- [ ] Add yarn presets for yarns that suit 7 gauge: a starting gauge and stitch
  size.
- [x] Add a fix button for a stitch row that knits and tucks on one bed
  ("Knit the row plain").

**B. Safety, before new constructions**

The small implementation slice and its evidence are in
[`GAP-CLOSURE-PLAN.md`](./GAP-CLOSURE-PLAN.md): final-use parking, one-needle
sequences, compiler fingerprint coverage and one sweater capacity check.

- [x] Check the last stitch to final-use parking span, preserving continuing
  colourwork floats; reference and authored comparisons add no findings.
- [x] Test sequences on one needle: transfer, tuck, drop, cast on again.
- [x] **Most fairisle colour charts are blocked (found and fixed 2026-11-08).** On a
  colour's last row, its yarn travels to the edge of the piece. When its
  last stitch isn't near that edge, the strand lies across needles that the
  waste rows on top then knit under. The final-use parking check
  (`machine-safety.attached-yarn`) blocks this. Its comparison set had every
  colour reaching the edges, so it found nothing then.
  - Blocked: a centred heart on a 60 × 40 chart, simple motifs with a
    ground-colour top row, and a Colorworks dither.
  - Still compile: stripes, Kniterate's own `fairisle.kc` chart (handoff 2
    run 2), and fairisle beanies.
  - Fixed as Kniterate's `fairisle.kc` ends its colours: each one's last
    stitch is at the edge it travels to, and it parks just outside. On a
    colour's last row in the body, if its last stitch is more than a float
    (7 needles) from that edge, the edge needle is tucked in that colour.
    A yarn that knits on afterwards (a chain bind-off's) is left alone.
    Every file that compiled before is byte-identical, including handoff 2.
    The tuck is our own reasoning: Kniterate's chart never needed one, and
    it hasn't been knitted yet.
- [ ] A chart using all 252 needles is refused by machine safety (a
  half-rack pass off the bed, the waste carrier left of home), though the
  authored width limit allows it: lower the limit or keep the frame on the bed.
- [ ] Define a pickup-stability check from paired accepted/unstable examples.
- [ ] Bound held-fabric and increase behavior before affected new constructions.
- [ ] Qualify inferred limits, the 36-knit clearance rule first, with small
  swatches tied to exact file hashes.

**C. Make more things (each with a development knit)**

Toward the user's own colourwork sweater (set 2026-11-08), once handoff 2
shows the start works.
- **The goal:** a sweater of the user's own design and shape, with
  dithered images from Colorworks (`~/pro/colorworks`, imported as a chart
  PNG), in fairisle (one layer) or reversible jacquard.
- **The construction reference:** Kniterate's own sweater, Customist design
  `rp3AXUm` ("Kniterate sweater (reversible jacquard)"): three fully
  fashioned panels in 2 ends of merino Nm 2/28. The captured Customist
  panels `reference/front.kc`, `back.kc` and `sleeves.kc` use the same
  construction (`jacquard-complement.ts`). They are probably this design,
  but that is not confirmed.
- **How to get there:** knit every mechanism small first, from the same code
  a full design uses, so the full piece knits nothing new.

Every mechanism the sweater needs, and where it stands (tick when a knit of
it is registered):

| Mechanism | In Studio | Knitted |
|---|---|---|
| Start: waste yarn, draw thread, yarn catch | built | failed in run 3; fix in handoff 2 |
| 2×2 rib cast-on and rib | built | run 3 (hand-edited speed-100 copy): neat |
| Rib to body transfer | built | run 3 (same copy) |
| Fairisle colourwork | built | runs 1–2 broke at the first two-colour row; handoff 2 |
| Birdseye colourwork | built | run 3; edge drops, stiff crown |
| Reversible jacquard | blocked for designed pieces | no |
| Waste yarn on top (for linking) | built | handoff 2 run 3 |
| Chain bind-off | built | handoff 2 run 4 |
| Sleeve increases | built, one yarn | no |
| Armhole bind-offs and decreases; sleeve cap | built, one yarn | no |
| Neck split on two yarns, central bind-off, shoulders | built, one yarn | no |
| Neckband | built | no |
| Assembly from the written pattern | built | no |
| Fit: swatch gauge to finished size | built | no |
| Knit/purl, tuck and slip textures | built, one yarn | no |
| Colourwork on shaped pieces, with rib trims | not built (M7); the beanie has a rib cuff under colourwork | no |
| Texture and colour pattern in the same fabric | not built | no |
| Hand-drawn piece outlines | `sweater shape` key points | no |

- [x] Measurement forms and run records for sweater and scarf packages.
- [ ] Register a sweater or scarf package, one piece per entry. Today
  `release:register` reads only chart and beanie packages, and the registry
  re-compiles only those. Needed before the mini sweater's pieces can be
  recorded.
- [ ] A mini sweater in one yarn: front, back, two sleeves and neckband,
  about 30 cm long, from a measured swatch, then assembled and measured.
  This works today (~410–530 passes a piece). It covers every shaping
  mechanism, every bind-off and fit.
- [ ] A short strip, then a scarf, of a dithered two-colour chart in
  fairisle (single jacquard). Colorworks' knit style exports the chart
  (branch `kniterate-studio-chart-export` there, not merged), and Studio
  opens and compiles it. The strip tests how fairisle
  handles the dither's single stitches and frequent colour changes before a
  full length.
- [ ] Reversible jacquard (Studio's `complement` backing: each colour knits
  the front where it shows and the back elsewhere, so the back is the
  inverse image). Today it is blocked for designed pieces
  (`project-technique-unmatched`; parity row CP-B4, "Invert Colors"). It
  needs a start, body and finish matched to those files, then a strip and a
  scarf. It takes exactly two colours.
  - **Start:** Kniterate's closed cast-on. Every needle of both beds is
    knitted in one zigzag at half rack, then one row on the front and one
    on the rear (`jacquard.kc` passes 102 to 104, `dbj.kc` 110 to 112,
    `sleeves.kc` 106 to 108). In `jacquard.kc` and `dbj.kc` the body follows
    with no transfers. `sleeves.kc` knits its rib cuff in between.
  - **Why not the beanie route:** the operator's reversible v2 (PR #14)
    started from the beanie's 1×1 cast-on, then knitted onto the empty
    needles on both beds. That left evenly spaced holes along the visible
    edge. Kniterate's sleeve fills empty needles only on the rear, after
    moving every loop to the front.
  - **Expected look:** the cast-on colour shows as one joining row on the
    reverse, which the operator accepts. The faces lie apart wherever a
    colour runs solid, since the layers only join where the colours swap.
  - **Finish:** waste yarn on both beds before release, so no live stitch
    is left unsupported.
- [ ] Colourwork on sweater pieces (M7 colourwork below), as strips first:
  increases, armhole bind-off and the neck split, each in colourwork. Then
  the mini sweater again, in colourwork.
- [ ] Texture with a colour pattern in the same fabric: ribs, purls, tucks
  or slips inside the pattern, as a strip first. Start from what Kniterate's
  own tools make: its old template editor maps stitch symbols per colour
  (parity row CP-A9). Check it with our own reasoning, since a purl stitch
  sits where fairisle floats run.
- [ ] The user's own design, full size, in fairisle or reversible jacquard,
  with ribs and textures.

- [ ] Draw a piece: any outline in any stitch, through the sweater piece
  pipeline.
- [ ] Add presets built on it: cowl, headband or ear warmer, cushion cover,
  tote.
- [ ] Add stripes on shaped pieces, then colourwork (M7).
- [ ] Add a vest (no sleeves), then a cardigan (split front, button bands).
- [ ] Add raglan and picked-up collars (M7).

**D. Release `1.0.0`**

- [x] Include sweater/runtime dependencies in the compiler fingerprint.
- [x] Check sweater replay capacity against the 400,000-event budget.
- [ ] Add shared pass filters and loop-occupancy colors if inspection needs them.
- [ ] Decide which M8 parity rows still matter, and build those.
- [ ] M9: freeze; knit, finish and register the rectangle, beanie and
  sweater, including a complete manifest, fit tolerances, assembly evidence
  and the expanded physical-release check; tag `1.0.0`.

**E. After `1.0.0`**

- [ ] Build the in-app assistant: a request becomes edits you review (S3).
- [ ] Socks (tube, short-row heel, toe), only if they are still wanted at
  7 gauge.

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

## Widened V1 (ruling 2026-09-28) — M5, M6 and an M7 slice built; see STATUS

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
  colorwork body. Placements are stored intent (anchor, color map, source
  image) that survives resizing or reports a conflict;
- ~~birdseye backing for beanie bodies~~: done, so the real bird is ready;
- ~~the benchmark's beanie cases~~: done (`arc-style-toque`, `toque-resize`
  with the real bird; not-ready answers are checked against the project);
- ~~the garment in the browser~~: done (2026-10-02): fit and gauge editing,
  motif objects, readiness story, schematic, package export, measurement
  revisions and change review, sharing modules with the CLI;
- a development knit in acrylic: prepared in
  [`M6-ACRYLIC-DEV-TRIAL.md`](./M6-ACRYLIC-DEV-TRIAL.md), waiting for the
  operator run. M7 stays queued until it is accepted.

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

**Status 2026-10-10: software slice built ahead of the beanie trial (user
request).**

Built: one-yarn flat-panel sweaters in set-in, J-sleeve and drop-shoulder
styles with crew, V, square or boat necks. They take any knit/purl/tuck/slip texture and
rib trims, in a multi-piece project with per-piece programs, seam checks, a
package and a written pattern. Browser and CLI are covered (see STATUS).

Open:

- Customist panel parity (no captured reference is reproduced) and the
  CP-A3–A7 rows;
- raglan;
- colorwork, stripes and picked-up collars on pieces;
- benchmark sweater cases;
- a development knit;
- the multi-artifact release checker (M9).

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
