# STATUS — what is shipped vs. proposed

**Front door. Read this before any planning doc.** Repo at `1.0.0-rc.1`;
`pnpm verify` is the software gate. Full-gate status belongs to the exact
current proof receipt, not this document's dates.

## Now (2026-11-09)

- **Built, in the browser and the `studio` CLI:** colour charts (fairisle and
  birdseye), cuffed and rib beanies, flat-panel sweaters (drop shoulder,
  J-sleeve, set-in; crew, V, square or boat neck), one-colour scarves and
  blankets, and checking any `.kc` or `.k` file. Every machine file passes the
  blocking machine-safety envelope before it can be downloaded.
- **Knitted:** three development runs are registered
  (`packages/machine-lib/registry/swatches/`). None is promotable, and nothing
  is Knit-proven. Handoff 3 (two bind-off strips) is waiting to be knitted.
- **Not built:** the in-app assistant, a swatch-registry UI, raglan sweaters,
  colourwork or stripes on sweater pieces. See "Not yet built".
- **Next:** the checklist at the top of [`ROADMAP.md`](./ROADMAP.md).
- **`1.0.0`** waits on the physical gate in
  [`V1-PHYSICAL-TRIAL.md`](./V1-PHYSICAL-TRIAL.md).

The sections below are a dated record, newest entries first within
"Implemented". Where two entries disagree, the later date is right.

The other docs are framed as forward design and drifted behind the code. Where a
planning doc says a thing is "proposed" / "not built" / "the first slice to
ship," trust this file and the working tree instead.

---

## Implemented in `apps/studio`

- **First physical runs and the flat start's fix (2026-11-07).** Issue #9's
  handoff was knitted on 2026-10-30 (runs 1–3; run 4 not yet). Runs 2 and 3
  are registered as development evidence (`registry/swatches/2026-11-07-*`),
  neither promotable: Studio's fairisle knitted through with a startup
  tangle, a draw-thread miss and a yarn break at the first fairisle row that
  Kniterate's own file (run 1) shared; the mini bird toque as issued failed at
  the start. Its completed knit used a hand-edited speed-100 copy and is not
  registered. Changes from it:
  - Every flat piece (beanie, sweater pieces, scarf) now starts with
    `STUDIO_FLAT_START_SETTINGS_V1`: the fairisle file's waste speeds (six
    passes at 100, then a steady 300) and yarn introduction (each yarn at 100,
    two waste tube rows after it, seven after the draw thread), with each
    tube starting where the waste yarn is, so it never crosses the bed
    unknitted. The 2×2 cast-on and everything after it are unchanged.
  - A beanie's top is waste yarn (`topWasteRows`, standard 8) over the crown's
    stitches, released after; the crown is gathered off the machine first.
  - Machine settings has a Crown section (beanies) over the crown's reference
    row by row.
  - `studio new`/`fit`/`sweater set` record a typed gauge as assumed unless
    `--gauge-source measured`.
  - `reference: true` on the rib-beanie generator still reproduces
    `reference/2x2-rib-beanie.kc` exactly; authored beanies no longer do, so
    the parity scoreboard has no exact entry.
  - Not yet knitted. Edge drops seen in the hand-edited copy and the stiff
    crown's settings are open; the crown settings are exposed, not retuned.
  - Then, from Kniterate's own guidance, staff answers and owners' reports
    (researched 2026-11-07, sources in the commit message):
    - a yarn catch (`STUDIO_YARN_CATCH_NEEDLES_V1`, 20 needles): before each
      yarn's first row it knits out and back over the piece's leftmost
      needles, both beds alternating, in the flat start and Studio's fairisle
      chart start (not yet the birdseye chart start, which is built
      separately);
    - the first row after the fairisle chart's cast-on transfers and after a
      beanie's rib → body transfer knits at roller 100
      (`STUDIO_FIRST_ROW_AFTER_TRANSFERS_ROLLER_V1`), the fairisle one at the
      body's stitch instead of the reference's handoff stitch 6;
    - the birdseye body roller is 700 (`STUDIO_BIRDSEYE_BODY_ROLLER_V1`,
      Kniterate's jacquard setting) for charts and beanies, and crown jersey
      rows knit at stitch 6 or more (`STUDIO_CROWN_JERSEY_STITCH_V1`);
    - a setting the file sets with its own op (carrier spacing, stopping
      distance) is no longer turned into a "Set … on the machine" check;
    - a beanie's operator checks say the waste yarn (C6) is carried up the
      piece's right edge from the waste section to the waste on top;
    - every file's start checks add the feeder check from Kniterate's
      "Needles hitting feeders" article and an owner's brush check (yarn
      caught on brushes drops stitches on the right).
    The recipe path and the rib-beanie generator's reference mode still
    reproduce Kniterate's files; none of this is knitted yet.
  - The swatch has one place: its file downloads in Your swatch (Yarn &
    swatch for sweaters and scarves), beside its gauge, and the status
    panel's button ("Knit a swatch", then "Enter your swatch") goes there.
  - The left panel starts folded except Size. A folded section keeps its
    fields hidden, so a Show, fix or swatch button opens only the section
    that holds its target (`openSectionOf`).
  - A one-click fix in the status panel says what it did, with an Undo,
    while its operation is still the latest change ("Switched to a birdseye
    back · Undo"; other fixes "Done: …").
  - The swatch has its own Before knitting checks, worked out from the
    swatch file as a piece's are and listed under its download once it is
    downloaded. The status panel's Before knitting is the piece's alone.
  - Plain words for the last raw notes: a narrow chart ("Size: too narrow
    for the rollers") and every machine-safety refusal ("Machine file: a
    move that could damage the machine", the file's own words in Why?).
  - Matching a motif's colours shows each image colour as a chip, beside a
    chip of the yarn chosen for it, instead of "Image colour 0".
  - A stitch row that knits and tucks on one bed has a one-click fix in the
    texture editor: "Knit the row plain" (front tucks knit), or "Purl the
    row plain" for the back bed (`texturePlainRowFix`).
- **Run record and the start's rules (2026-11-08).** Neither changes a
  machine file, and neither is inside the compiler fingerprint.
  - A colour chart's or beanie's `measurement-form.md` ends with a run
    record. It holds the facts every run needs: date, machine serial,
    controller version, the yarn on each carrier, whether each yarn caught,
    and settings changed. It also lists each section of the file with its
    passes, numbered as the Machine file view numbers them, so a stop at a
    pass number says what was knitting. The view and the form read the file
    with the same helpers (`chartKnitFileCarriers`, `chartRibRows`).
  - Sweater and one-yarn scarf packages now include a
    `measurement-form.md`, listed in the manifest's `forms` and not hashed.
    It lists each piece's exact file and hash, the gauges, and each size
    Studio predicts beside a blank for the measured one. The pieces are
    measured flat before sewing up, so each measure belongs to one piece.
    The form ends with a run record for each piece knitted, two for the
    sleeves. Measurement names come from `sweater/measurementFields.ts`,
    shared with the design panel. The registration script doesn't accept
    these packages yet.
  - `apps/studio/src/flatStart.test.ts` pins run 3's lessons for every
    beanie, the one-yarn scarf, every sweater piece and the fairisle chart:
    - no yarn knits faster than 300 before the piece begins;
    - each yarn is caught out and back over the leftmost 20 needles, then
      knits its first row, all at speed 100;
    - no float advisory falls in the start.
    Setting the yarn introduction back to 200 fails it. The birdseye chart's
    start is not covered: it still knits at 400 and brings yarns in at 200
    without a catch.
- **Cast-on and bind-off settings, setup checks, handoff 3 (2026-11-09).**
  - **Settings.** A project's `machineSetup` can now set, besides each
    section's stitch, speed and roller:
    - a fairisle chart's cast-on (PR #14's meaning): roller and stitch set
      the first zigzag row, and speed sets all three cast-on rows. Studio's
      slow first body row keeps its 100: PR #14's version also sped it up;
    - `castOn.tubularRoller`, the two circular rows after the zigzag, on a
      fairisle chart or a flat piece;
    - on a chart with a bind-off top, `bindOff.stitch` (the chain's knit
      stitch size) and `bindOff.knitFirstStitch`.
    A setting the construction doesn't use is kept and ignored, as a chart's
    rib settings are, so switching the backing or the top never leaves a
    project blocked by a section the panel no longer shows. Values outside
    the machine limits block the compile. The panel shows the fairisle
    cast-on's stitch, speed and roller. The tubular roller and the bind-off
    are set in the project file or with `studio edit`, not in the panel.
    Nothing changes unless a project sets them.
  - **Knit first stitch.** This is Kniterate's bind-off option: the first
    needle is knitted once more at roller 350 before its first transfer. It
    knits in the chain knits' direction, as Kniterate's bind-off command does,
    so the yarn waits outside the edge. Knitted the other way, the yarn sat
    between the first two needles, and the converter moved it while the beds
    were racked. The test fails on that version.
  - **Flat-start speed cap (PR #14).** A flat piece's own waste speed now also
    caps its insert rows and every waste tube row, the top waste's included
    (which already knits at the waste's stitch size). Its cast-on speed caps
    the tubular rows. Before, a section set to 100 still knitted those rows at
    200. Carrier moves keep 600, as in Kniterate's files: they knit nothing.
  - **Review.** An independent review of this change found the cast-on speed
    reaching the first body row, and the refusals that the panel couldn't
    clear. Both are fixed, and their tests fail on the earlier code.
  - **Setup checks.** Every handoff's operator checks gain three of
    Kniterate's support-page checks (`MACHINE_START_CHECKS` in
    `readiness.ts`):
    - the side tension arms almost upright, with the yarn tense on a
      right-to-left pass;
    - each cone straight under its first guide, with no yarns crossing;
    - the knot sensor not clamping, and a little more brake on thin or
      slippery yarn.
  - **Handoff 3.** The site's `handoff-3/` has two bind-off strips, copied
    byte for byte from `output/machine-handoff-3`.
    - Strip 1 (`d91041a8`, 256 passes) is handoff 2's strip with the fixed
      start.
    - Strip 2 (`8fd76ea3`, 258 passes) adds three settings: the circular rows
      at roller 200 instead of 400, the bind-off at stitch 4 instead of 6, and
      Knit first stitch.

    `compare` shows strip 2 differs from strip 1 only in those passes.
    Neither strip has been knitted.
- **Machine-file tools (2026-11-09).** Five CLI commands read what a file
  does and check it against Kniterate's own files, so an engine fix or a knit
  report takes minutes to check. They are listed in `pnpm --silent studio --
  help` and in the `knit-design` and `kniterate-engine` skills
  (`.claude/skills/`).
  - **Inputs.** Each takes `ref:<name>`, a `.kc` or `.k` file, a project, or a
    handoff package.
  - **Pass numbers** count from 1, as in run records.
  - **`reference [name]`:** Kniterate's 13 files in
    `packages/machine-lib/reference`, with what each is, its yarn roles and its
    sections. They come from `reference/atlas.json`, checked against the files
    by `test/knitout/trace-audit.test.ts`.
  - **`passes <file> [range] [--section]`:** one line per pass (carrier,
    racking, speed, roller, stitch sizes, needles, section). A project's
    sections are the run record's.
  - **`audit <file>`:** replays every loop. It reports:
    - start loops held over 12 passes;
    - waste yarn knitting through doubled body loops;
    - body loops dropped with nothing holding them;
    - loops left on the needles;
    - stacks over 3;
    - eyelets inside the fabric, as a note only.

    Each check states what Kniterate's own files show, and every exception
    there is a deliberate choice. The rib beanie and the reversible sweater
    release their tops live, and `sleeves.kc` holds one start loop for 75
    passes.
  - **`compare <a> <b> [--section | --passes] [--carriers 2=4]`:** stitch by
    stitch, cutting both files into sections by the same rule. Needles count
    from each range's edge; `width` marks the same stitches over a different
    width.
  - **`matrix [-o dir] [--quick]`:** builds every construction (both chart
    backings at widths 9 to 60, three beanies, two scarves, six sweaters) and
    audits all 40 files in about 20 s.
  - **Library and tests.** The checks live in
    `packages/machine-lib/src/knitout/kcode/trace-audit.ts`.
    `flatStart.test.ts` now runs the audit on every start it checks, plus a
    birdseye chart. `engineMatrix.test.ts` runs the full matrix.
- **No held loop in the start (2026-11-08).** Handoff 2 was knitted (issue
  #9). Run 2 (`092076f4`) is registered as partial
  (`registry/swatches/2026-11-09-handoff2-run2-studio-fairisle`). It was the
  best fabric so far, but the main yarn frayed at the bottom-left corner on
  its first row after the waste.
  - The yarn catch's return knits the rear-left needle. Kniterate's waste
    rows never knit that needle, so the waste loop made there at pass 2 was
    held until the first colour's catch knitted it, about 90 passes later
    (47 under roller pull). That is the corner that broke. It's not shown to
    be the cause.
  - Every handoff 2 Studio file had it. Kniterate's fairisle, jacquard, DBJ
    and rib-beanie files don't, and neither does the first handoff.
  - The fix: with the catch on, the waste's leftward rows also knit the
    rear-left needle, in both `customist-fairisle-frame.ts` and
    `customist-flat-start.ts`. The operator's PR #14 makes the same change
    to the fairisle routine, and their reversible v2 knitted that start
    cleanly. The flat start's version hasn't been knitted.
  - Each file changes by 40 waste stitches, and two empty waste-yarn moves
    drop out. The recipe path without the catch is unchanged.
  - An independent review found the same loop at the right edge on pieces
    of 20 needles or fewer, where the catch spans the whole piece: the front
    or rear right needle was held about 85 passes. The leftward rows now knit
    that needle too when the catch reaches it. The left-edge fix had let some
    narrow odd-width charts (9, 13, 17, 19) past
    `machine-safety.central-short-rows` while they still held the right loop.
  - `flatStart.test.ts` now also checks that no loop made in the start waits
    more than 12 passes to be knitted again. It covers beanies, the scarf,
    every sweater piece, a 60-wide chart, charts 9 to 21 wide and scarves of
    12 and 20 needles. Kniterate's own fairisle, jacquard, DBJ and rib-beanie
    starts wait at most 7. Its reversible sweater sleeve (`sleeves.kc`) holds
    one rear edge loop for 75 passes. Studio's starts now wait at most 7, and
    the old start fails this rule in every kind.
- **Birdseye chart frame matches `dbj.kc` stitch for stitch (2026-11-08).**
  An audit replayed every loop in Studio's files against Kniterate's own. It
  found that the birdseye chart's frame, said to be derived from `dbj.kc`,
  had only ever been compared on speed and roller. Its stitches differed in
  three places (`jacquard-dbj-full.ts`):
  - The rear waste was never dropped before the draw thread (`dbj.kc` pass
    106), so the back layer's first row knitted straight into the waste
    yarn.
  - The ground's first row was a front-only row at rack 0. It is now
    `dbj.kc`'s half-rack zigzag over both beds (pass 110), which closes the
    edge and joins the layers. The draw row (stitch 8) and the two tubular
    rows (stitch 6) now use `dbj.kc`'s stitch sizes too.
  - After the rear is homed, no yarn knitted the joining row (`dbj.kc` pass
    464), so the waste knitted the doubled loops and the top would come off
    as two live loops per needle. The yarn that knitted the last front
    stitch now knits it.
  - `dbj-parity.test.ts` now compares the cast-on and the finish stitch for
    stitch, not just the settings. Both fail on the old code.
  - Nothing knitted is affected: no birdseye chart has been knitted. Issue
    #9's birdseye toque came from the beanie route, which already had all
    three.
  - Known preview difference: the simulator predicts no pass for a drop
    (`CarriageSimulator.drop`). The converter does emit one, as at `dbj.kc`
    pass 106 and `fairisle.kc` pass 105. So the predicted pass count runs
    short of the machine file at each drop. The machine file and its
    stitch-level tests are what count.
- **Fairisle colours end at the edge (2026-11-08).** Most fairisle colour
  charts were refused by `machine-safety.attached-yarn`. The refused cases
  included a centred motif, any chart whose colour stops short of the edges
  on its last row, and every dither. The colour's yarn parked at the edge
  across needles that the waste on top knitted under.
  - Kniterate's `fairisle.kc` ends each colour with its last stitch at the
    edge it travels to. Studio now does the same: on a colour's last row in
    the body, the edge needle is tucked in that colour when its last stitch
    is more than 7 needles from that edge (`yarnsEndingHere` in
    `jacquard-floats.ts`, set by `compile-chart.ts`). A chain bind-off's yarn
    knits on, so it is left alone.
  - Every file that compiled before is byte-identical. That includes
    handoff 2 (`092076f4`, `948f39de`, `3cd3b1ea`) and the Kniterate
    fairisle reproduction.
  - The edge tuck itself hasn't been knitted.
  - Found by opening a Colorworks dither in Studio. Colorworks' knit style
    now exports a `ColorworkChartV1` exactly, stitch for stitch, on its
    branch `kniterate-studio-chart-export`.
- **Runtime fingerprint and replay capacity (2026-10-30).** The compiler
  fingerprint includes sweater production and authored eligibility helpers;
  a runtime-import regression checks that closure. Earlier registrations are
  stale against this changed fingerprint. The existing authored admission
  budgets bound replay below 400,000 events (at most 324,576); a 240-needle,
  703-row synthetic sweater front/back uses 198,500. Its sleeves retain two
  existing attached-yarn errors, so this is not a ready garment or a physical
  claim. See [the small gap closure](./GAP-CLOSURE-PLAN.md) and
  [capacity report](./benchmarks/sweater-replay-capacity.json).
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
- **Headless authoring CLI.** `pnpm --silent studio -- new|image|show|plan|describe|readiness|edit|undo|redo|compile|export|render|explain|schema`
  drives authored projects without a browser for scripts and agents. Edits are
  the typed `ProjectEdit` log (recorded as `assistant` by default);
  `apps/studio/src/authoredPipeline.ts` composes the same compile, strict KCode
  conversion, registry match, and `resolveAuthoredVerdict` seams as the UI, and
  `export` writes a `.kc` only when the UI Export gate would allow it. All
  output is JSON; exit `0` ok/export-ready, `1` blocked, `2` usage/read error.
  Compile/export receipts include the canonical compiled frame and every emitted
  carrier requirement, including C1 frame yarn and C6 waste, not just palette yarns.
- **M5 design language on rectangles (2026-09-29).** Project files are
  written as version 2. That is version 1 plus optional `gauge`/`target` state
  and their `set-gauge`/`set-target` edits. Version 1 files upgrade on read.
  - Migration evidence: a v1 project with 18 edits, a redo branch and a
    quarantined override compiled byte-identically (Knitout, KCode, verdict,
    override status) against the pre-M5 code at all 19 cursor positions.
  - `apps/studio/src/plan.ts` derives sizing with provenance: authored counts,
    predicted cm under the gauge, and size checks whose fixes are verified
    resize edits. It also flags yarn names that contradict their carrier.
  - `apps/studio/src/readiness.ts` gives every diagnostic an owner (design,
    compiler or operator). `resolveReadiness` is ready only with a non-Blocked
    verdict and no warning or error. Dropped Knitout extension headers become
    operator checks. The verdict policy is unchanged.
  - Capacity: charts may have up to 1,200 rows (per-state cells unchanged at
    75,600). The Fairisle pass estimate is colour-aware. A 65 × 612
    three-colour scarf compiles to 780 passes.
  - The fairisle recipe no longer supplies unused chain bind-off settings, so
    clean compiles carry no `machine-setting-ignored` warning. KCode is
    byte-identical.
  - `.claude/skills/knit-design` and `pnpm eval:design`
    (`evals/design-language`) are the agent host and benchmark. See
    DESIGN-LANGUAGE "M5 status" for what is deliberately not built yet: no
    garment schema, and no image bundling in projects.
- **Flat 2×2 rib beanie, thin slice (M6, 2026-09-29).**
  `packages/machine-lib/src/knitout/passes/customist-rib-beanie.ts` generates
  Customist's flat 2×2 rib beanie: waste and cast-on, rib set-up, rib body,
  crown, knit-off and carriers out.
  - At the reference's 102 rib rows it reproduces `reference/2x2-rib-beanie.kc`
    exactly: an identical strict whole-program machine trace, 530/530 passes
    including carrier stops. Since 2026-11-07 that needs `reference: true`;
    authored beanies knit Studio's start and a waste top (see above).
  - The crown is Customist's, replayed from data extracted from the reference
    (`customist-rib-beanie-crown.ts`, regenerated byte-identically by a test).
    It is therefore defined only for the reference width of 194 needles.
  - Height is free: other rib-row counts stay machine-valid.
  - `pnpm studio -- beanie` sizes the body from `--body-cm` and a rib gauge,
    and writes `.k`, `.kc` and finishing instructions. It checks the `.kc`
    through the same intake as `machine:check`, so the verdict is
    Surface-proven (imported).
  - Any width from 60 to 244 needles, centred on the bed. Other widths use
    the eight-line crown (`rib-crown-plan.ts`): the reference crown's
    topology (8 and 4 decrease lines, rib columns stacked onto the inner
    column, everything outside sliding inward) with its own evenly placed
    lines and transfers through the empty rear bed in hops of at most 4.
    Tests replay the emitted trace:
    - the stitch counts per crown row match the plan;
    - no needle holds more than 2 loops;
    - racking stays within ±4;
    - widths 98, 150, 194 and 242 have zero validator diagnostics.
  - **Beanies are authored projects.** Project state gains
    `object: { kind: 'beanie', construction: 'flat-rib-2x2' }`. The chart is
    the rib body (width = needles, height = rib rows, one yarn).
    - `compileProject.ts` compiles it through the beanie construction into
      the ordinary strict KCode artifact, with the verdict from
      `resolveAuthoredVerdict`.
    - The plan sizes the finished circumference with seam stitches and rib
      rounding, keeps the piece centred, and lists finishing steps.
    - `pnpm studio -- new --object beanie --head-cm --body-cm --gauge`
      creates it, sized by the plan's own fixes. `export` writes finishing
      instructions.
    - The default 194 × 102 project on C3 still reproduces the reference
      exactly through the authored pipeline. Its replayed crown carries one
      3-loop stack, so readiness blocks on that conservative warning. The
      eight-line crown stays at 2 loops or fewer, so sized beanies can be
      ready.
  - **Rib cuff + colorwork body (the Arc-style toque).**
    - Construction `rib-cuff-jersey-body`: the bottom `cuffRows` chart rows
      are the rib cuff, and the rows above are a fairisle body.
    - In the machine program, the extra yarns are brought in during the
      waste section and the rib transfers to the front bed. Each body row
      knits one pass per color from the side its carrier is parked on, and
      the eight-line crown is planned for jersey.
    - Floats are measured along each carrier's real path in the emitted
      trace, across rows, sections and transfers
      (`readiness.ts::beanieFloatFindings`). Floats longer than `floatLimit`
      (7 for these projects) are design-owned `long-float` warnings. A yarn
      carried from the waste section to its first stitch is an operator
      `carried-yarn` check.
    - **Birdseye body** (`strategy.technique: 'birdseye'`): built in
      `reference/dbj.kc`'s structure. At half rack, each color's pass knits
      its front stitches plus every N-th rear needle. The back layer starts
      and joins as in dbj.kc, adding 3 ground rows that the plan counts. With
      fairisle, the real Arc'teryx bird has floats of 8–16 needles. With
      birdseye it is ready at heads of 52/56/60 cm and bird heights of
      6/8/10 cm. Any other backing (or minimal birdseye) is refused with
      `project-beanie-backing-unsupported`.
    - The object stores `cuffTargetCm`, `ribGauge` and `cuffFold`. The plan
      checks the cuff (`cuff-off-target`, rib `gauge-assumed`) and reports
      `sections`: cuff, body, crown (rows, recipe, final stitches) and
      finished height, each in cm with its derivation.
    - **Placements** (`set-placement`, `remove-placement`): a motif is
      stored as intent. That covers its anchor (`x: 'center'` or a column,
      `rowsAboveCuff`), color map, and source PNG with converter settings.
      Materialization draws it, so resizing keeps it centred above the cuff.
      A placement that no longer fits is a `project-placement-conflict` that
      blocks export, never a clipped motif. Checkpoints keep the authored
      chart. `place --image` converts at the body gauge, and
      `place --refresh` re-converts after a gauge change
      (`placement-size-off`).
    - Row IDs added by resizing never reuse an ID still anchored by an
      override, so quarantined overrides stay quarantined.
    - `export` instructions state the construction from the plan's
      sections, readiness, unresolved warnings and operator checks.
    - Widths 98 and 150 have zero validator diagnostics (fairisle and
      birdseye), and the accent yarn knits only the motif.
  - The eight-line crown and the jersey and birdseye bodies have no
    reference parity. A mini bird toque was knitted on 2026-10-30 (see the
    2026-11-07 entry above). The full-size acrylic candidate in
    `docs/M6-ACRYLIC-DEV-TRIAL.md` is superseded: it has the start that failed.
  - **Second review fixed (2026-10-02):**
    - vertical carries (`project-long-carry`) and authored waste-to-body
      carries (`carried-yarn`);
    - placement conflicts block panels too;
    - collision-free placement ids;
    - stale motifs detected on either gauge axis;
    - cuff changes at the cuff/body boundary;
    - invalid widths as planned findings, with the target width as the fix;
    - the benchmark binds motifs to the supplied image;
    - development-run registration from a handoff package
      (`release:register -- <name> --package <dir>`; the coordinate bridge
      accepts carrier parking beyond the piece).
  - **Garment product (browser).** A beanie is created from fit intent and
    edited as a garment:
    - head circumference and ease, cuff height and fold, body height, and
      body and rib gauges (measured or assumed), each one undoable operation
      that applies the plan's own fixes, with derived counts and cm beside
      the inputs;
    - motifs are placement objects: click to select, drag with Move, and an
      inspector for size from the stored image, position, colors, refresh,
      replace, remove and convert-to-stitches;
    - painting over a motif's stitches is refused with an explanation;
    - conflicts show as a red ghost and block export;
    - the readiness card tells the shared story (`handoff.ts::readinessStory`)
      with part, consequence, next step, show and fix;
    - a dimensioned schematic (flat piece with fold line, seams and crown;
      finished front with the folded cuff and motif);
    - a zip package (`handoff.ts::handoffFiles`) and a print sheet from the
      same instructions;
    - recorded trials and a measurement dialog that previews the revision
      (gauges measured, sizes refit, motifs re-converted) before applying it
      as one operation, with synthetic values labelled;
    - a Changes panel that reviews each operation (before/after measurements,
      findings, schematics) and undoes it. A reopened file that continues
      the project (an agent's CLI edits) opens it with the new operations
      highlighted.
  - **Third review fixed (2026-10-03):**
    - synthetic measurements count as assumed and are disclosed in
      readiness, print and package;
    - the ground yarn's path includes the cuff and the crown;
    - returnable forms are not hashed into the candidate;
    - trials are compared with the knitted candidate's own predictions;
    - history compacts only at operation boundaries, and cuff changes are
      bulk row edits;
    - the schematic draws the materialized chart and only the front in the
      front view;
    - switching fairisle to birdseye sets a supported strategy;
    - an unmapped motif color is the ground, and a color problem is reported
      as one;
    - out-of-range fit input shows as not applied;
    - agent continuations are detected at the cursor;
    - both registration modes parse;
    - beanie passes carry design-row provenance, so machine inspection
      shows the waste, cuff and body, and crown sections.
  - **Fourth review fixed (2026-10-03):**
    - workspace operations apply to the latest project, and a motif refresh
      that finishes after the motif changed is discarded with a message
      (no lost edits);
    - image colors with no matching yarn need a decision (a yarn, or leave
      the ground) in the browser and the CLI (`--map`, `--leave`);
    - changing a loaded form's candidate drops its predictions;
    - compaction never cuts into the operation just appended;
    - continuation is matched by entry id across compaction;
    - fit drafts reset per project.
  - **Refresh completion (2026-10-03):**
    - pending motif conversions belong to the open document and are cancelled
      when another file opens, including a file with the same project id;
    - a refresh or resize that reveals a new unmapped image color keeps the
      current motif and opens a preview with the saved image. Each new color
      needs a yarn or an explicit background choice before applying;
    - CLI refresh accepts `--map` and `--leave`; unresolved colors refuse the
      change without saving. `--leave` removes default mappings, and conflicting
      map/leave choices are rejected;
    - returned measurements still record and revise the gauge when a motif
      needs a color decision. That motif stays unchanged and stale until the
      designer resolves it through Refresh.
  - The CLI has the same story and modules: `fit`, `package`, `measure`.
    `e2e/beanie-workflow.spec.ts` covers the browser journey (Chromium and
    Firefox). A real-bird walkthrough (not committed: the image is a
    trademark) checked:
    - readiness identical in browser and CLI;
    - a packaged `program.kc` byte-identical to a CLI recompile and the
      manifest;
    - an agent `fit` reviewed in the Changes panel;
    - recovery from an invalid width and an oversized motif;
    - a synthetic measurement revision.
- **Flat-panel sweater, software slice (M7, 2026-10-10).** A sweater is one
  project (`object: { kind: 'sweater', … }`): finished measurements, a
  silhouette (`set-in`, `j-sleeve`, `drop-shoulder`), a neckline (`crew`,
  `v`, `square`, `boat`), a body texture, rib trims, gauges and a top finish. The chart holds
  only the yarn.
  - `apps/studio/src/sweater/draft.ts` drafts each piece as a cm outline:
    back, front, sleeve (knit twice) and, for a crew, V or square neck, a
    rib neckband. A V splits on two bound-off centre needles and decreases
    each neck edge to the shoulder; a square binds off its width flat; the
    standard front neck depth follows the neckline (a V dips 2.2× a crew).
    Size and fit chips give standard finished measurements. A set-in cap's
    slope is fitted to the armhole edge (at most 80% of the armhole depth). A
    J-sleeve's flat top matches the straight armhole.
  - `rasterize.ts` slices the outline into rows at the gauge using only legal
    machine moves:
    - transfers for 1–2 stitches;
    - chain bind-offs of 3 or more, only on a row that starts at that edge;
      a fresh step that waits a row binds off the same count as the first side;
    - one-stitch increases;
    - the neck split on a row that starts on the right.
    Lag against the outline is reported (`sweater-shape-lag`).
  - `packages/machine-lib/src/knitout/passes/shaped-panel.ts` knits any such
    rows in one yarn with any `k/p/t/u/s` texture. It uses the choreography
    decoded from `reference/front.kc` and `sleeves.kc`:
    - edge shifts through the rear bed at rack ∓d (`fashion` 1–3);
    - chain bind-offs;
    - a centre neck bind-off, after which the right shoulder knits on a
      second carrier brought in during the waste section.
    The start is Customist's flat start, now shared with the rib beanie
    (`customist-flat-start.ts`); the beanie stays trace-identical to its
    reference.
    Before each row, rack-0 transfers set every stitch's bed. Selvedges and
    the stitches the next row moves knit plain, so no needle ever holds more
    than two loops. A row that knits and tucks on one bed is refused.
  - `sweaterPipeline.ts` compiles every piece through the same strict KCode
    conversion, validation and `resolveAuthoredVerdict`. The sweater's
    verdict is its worst piece. Readiness blocks on assumed body and rib
    gauges. The second-cone yarn and the carried strand are operator checks.
  - Tests:
    - every silhouette × neckline × the library textures (stockinette, seed,
      garter, moss, basketweave, half and full cardigan, slip tweed,
      welts, rib) compile Surface-proven with zero validator errors;
    - an independent trace replay leaves the live loops exactly on the shaped
      needles for fashion 1–3.
  - Browser: New project → Sweater, then the shared workspace (below):
    - design (style cards, size and fit chips, measurements with wanted vs
      knitted, a texture library with a tile editor, rib edges, yarn and
      gauges, each change one undoable operation);
    - the garment, as worn or as flat pieces to scale, and each piece stitch
      by stitch with its shaping;
    - status in plain words, per-piece downloads, the package and the written
      pattern.
    `e2e/sweater-workflow.spec.ts` covers it (Chromium, Firefox).
  - CLI: `studio sweater choices|new|plan|set|check|package|pattern|schematic`.
    The generic `plan`/`describe`/`readiness`/`compile`/`package` route
    sweater projects there. The `knit-design` skill documents it.
  - The plan gives a yarn estimate from the stitch count (±20%, labelled as
    an estimate).
  - **Hand shaping (2026-10-10, garment-shaping-machine style).** Each edge
    is a few key points (`object.shapes.body`, shared by front and back so
    the side seams match, and `object.shapes.sleeve`). Each segment is
    straight, concave or convex, and one point is the underarm.
    - The style draws them from the measurements until the knitter drags,
      adds, types or deletes a point in the piece's Shape mode (or with
      `studio sweater shape`). After that, the measurements that drew the
      edge are marked as set by the shape, and "Back to measurements" resets.
    - A set-in or J sleeve cap refits itself to the drafted armhole, whatever
      its shape.
    - Shaping is shown and written as a knitter reads it: "Rows 21–129:
      increase 1 every 3–4 rows, 33 times → 120 stitches". A run both edges
      share reads "at each side"; where they differ (a bind-off on the right
      comes a row after the left), each edge's steps are named in row order,
      and a stitch count is given once every step up to its row is told.
  - **First visit:** a start screen offers Sweater, Beanie or Scarf/blanket, a
    project file or a machine file, or a blank chart. It returns for a visitor
    whose only saved project is the untouched blank chart.
  - **Projects kept on this device (2026-10-11).** Starting or opening another
    project never replaces one (`chart/recentProjects.ts`).
    - Each project autosaves in its own slot. A file opened twice gets two
      slots, so an older file never overwrites newer work.
    - Switching saves the open project first, with its latest change. If the
      browser's storage is full, the switch stops and says so.
    - File → Open recent and the start screen list them, newest first.
      Removing one asks twice; nothing is dropped to make room.
    - The same project open in two tabs (2026-10-12): a change saved in one
      is taken up by the other, so neither saves over it. If both changed at
      once, the second tab's version goes on as a copy and says so.
      - Since 2026-10-22 a tab takes up another's save only when it was made
        on top of its own latest edit (`recentProjects.ts::builtOn`). Two
        saves can cross on the way, so each tab checks what it receives
        rather than which saved first. A crossed save is kept as a copy,
        written before the tab says so; its waiting save is cancelled, so
        it never lands over the other version (`e2e/launch-polish.spec.ts`).
      - Since 2026-10-23, when both tabs keep copies at once, each writes
        the Open recent list from its own read, which can leave out the
        other's copy. A tab that sees its project left out of the list
        puts it back, unless it was removed for good; removing deletes the
        project before its list entry so the two cases are told apart.
    - A file that is not a project, on the start screen or from File →
      Open project, says why in plain words, with "Choose another file" on
      the start screen (2026-10-22, `projectFile.ts::projectFileProblem`).
  - **Machine file view (2026-10-11).** Each piece's mode "Machine file" shows
    what its `.kc` makes the machine do, read back from the emitted file's
    strict trace (`sweater/knitFile.ts`), never from the design.
    - It draws every knit and tuck in the file once, stacked on its own
      needle, coloured by carrier or as knitted.
    - It lists the file's sections in machine order: waste yarn (with the
      carriers brought in), draw thread, cast-on, rib, body, the neck split
      (C3 and C4), the bind-off and carriers out.
    - Every pass reads in words, with its settings and its exact lines in
      the file.
    - The status panel lists the pieces as their files (`front.kc`,
      `sleeve.kc · run 2×`) and opens them here.
    - Needle numbers are Studio's (the pattern's), through the verified
      bridge; physical bed labels stay unverified.
  - Each piece is subject to the authored program limits. An oversized
    garter or seed piece can need more than the 200,000 checked needle
    selections; that is a design-owned `sweater-piece-too-large` error that
    names the size, gauge and stitch changes. The limit itself is unchanged.
  - Not built:
    - raglan, V-neck, colorwork or stripes on sweater pieces;
    - picked-up collars;
    - Customist's sweater template parity (CP-A3–A7 stay open: no captured
      reference reproduces a Studio panel).
    Nothing has been knitted. Sweater programs are development evidence at
    best, and the release checker is still rectangle-only.
- **Customist parity scoreboard.** `pnpm parity [--json]` compares the 13
  captured references. Schema v2 reserves `reproduced` for an export-ready,
  strict whole-program machine-trace match, including rack, settings, stops,
  rasters, and both transfer stitch selectors. Current result (2026-11-07): **0 exact,
  6 partial, 0 blocked, 7 unsupported**. `2x2-rib-beanie` was exact through
  its construction generator until 2026-11-07, when authored beanies took
  Studio's start and a waste top; the generator's reference mode still
  matches it exactly. Fairisle uses the checked-in 64×50
  trial chart with C4/C3 assignments. Its recipe path matches 280/286 stitch
  passes at offset zero (six passes have additional C4 front knits in the
  reference); Studio's authored fairisle adds its yarn catch (eight passes)
  and gentle first row since 2026-11-07, so its passes no longer line up. Other colorwork candidates are
  explicitly inferred knit-column inputs, with any trimmed edge rows disclosed.
  Jacquard's two-color candidate blocks because its frame requires C2–C5.
  `knitted-faces.ts` preserves coordinate holes and alternating-needle passes;
  optional explicit pass windows avoid the default inferred window, which can
  include cast-on and finish. Recovery refuses interior partial rows. Face
  equality requires equal row counts and is only a relative knit-column
  comparison: it ignores transfers and is not loop topology, authored-course
  recovery, fabric appearance, or physical evidence.
- **Customist-matched frames for authored backings.** Studio authors only the
  backings that compile through a configuration matched to a captured
  Customist program: Fairisle (`customist-studio-fairisle-7gg`, matched to
  `reference/fairisle.kc`) and Birdseye (`customist-studio-birdseye-7gg`,
  matched to `reference/dbj.kc`), via
  `machine-lib::buildCustomistMatchedCompileInputV1`. Waste, carrier intro,
  finish, carrier roles, and per-section speed/stitch/roller come from that
  configuration; project `frame` fields no longer change the program and the
  UI shows a read-only frame summary, including frame yarns (e.g. C1) the
  program brings in. Ladder, Lined, and Complement have no Customist
  reference and block with `project-technique-unmatched`; single-color charts
  knit jersey inside the fairisle frame. Before Studio's start (2026-11-07)
  the fairisle trial had 280/286 identical stitch passes and zero footer
  differences; the strict full-trace comparison limited differences to six
  passes with reference-only C4 front knits. The recipe path still does.
  The general catch-loop rule and physical effect of those 21 extra knits remain
  unresolved. Birdseye uses the reference-derived DBJ
  introduction and finish with the established generic body: every requested
  front stitch plus one rear stitch per needle per design row, partitioned
  across C2–C5. It no longer applies fixture-specific row ordering or omits the
  final carrier. This body differs from Customist's full-needle DBJ backing;
  footer or whole-program DBJ parity is not claimed. Exact emitted-trace tests
  cover all final-row colors, sparse rows, stripes, carrier permutations, width
  one, and rows beyond the old fixture's special range. Trial and registry
  evidence record the compiled frame.
  Machine-safety invariant: every carrier a compiled program brings in must be
  an assigned pattern yarn, the waste carrier, or the preset's declared frame
  yarn (C1); otherwise compilation blocks with `project-unassigned-carrier`
  (`compileProject.ts::introducedCarriers`).
  The captured DBJ introduction brings in all four pattern carriers; a chart
  in two or three colours brings in only its own, in the captured order
  (C3, C2, C4, C5) with each carrier's captured moves, the last one in
  taking the captured seven settle rows, and its ground (C3, else the first
  in) starting the back layer (`jacquard-dbj-full.ts`). Four-colour output
  is byte-identical to before; `dbj-parity.test.ts` and
  `birdseyeBody.test.ts` cover two and three colours, with and without C3.
  New projects default to Birdseye only for four-color palettes, Fairisle
  otherwise.
- **Active overrides fail closed.** Stitch/pass overrides are schema-valid
  project intent, but the compiler does not consume them yet; any active
  override blocks compilation (`project-override-unsupported`) rather than
  exporting output that silently omits it.
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
- **Pass roles and knitter-facing advisories.** Every strict-trace pass is
  labelled loop-forming, transfer, drop, carrier move, carriage move, or
  unclassified (`pass-metrics.ts`). Knitout imports join each emitted pass to
  the pinned backend's scheduled source line, so a carrier-only pass stamped
  with a knit/tuck/xfer line is shown as a backend-inserted kickback, while a
  `miss`/`in`/`out` line is a requested carrier move; direct KCode records no
  origin. `machine-advisories.ts` recomputes the official editor's float-distance
  check (default maximum 7, in the front-bed frame including rack). It is
  non-blocking information for foreign files and never changes the verdict.
  (The editor's unsafe bed-range check is a blocking machine-safety rule since
  2026-10-24; see below.) Endpoints retain bed/needle coordinates, use the
  current rack, follow transfers/splits, and invalidate on drops or unknown
  operations. The 13-file corpus now yields zero float advisories; the
  previous ten float findings used stale transferred/dropped endpoints. Real synthetic long-float cases remain covered. KCode does not
  encode carrier in/out, so a
  between-pass float can be a parked or cut yarn; floats are not a physical
  failure claim. Roles and advisories reach Studio, the run sheet, and
  `machine:check`.
- **Machine-safety envelope (2026-10-24).** `machine-safety.ts` checks every
  strict trace after the command validator, for authored and foreign files
  alike, and every finding blocks export (`isKCodeMachineExportEligible`). It
  refuses:
  - knit, tuck or drop on directly facing needles at a whole-number rack;
  - a needle whose facing position is off the bed at the current rack;
  - an idle carrier resting within the 2.5-needle stopping distance of an
    operated needle;
  - a carriage or carrier turning less than 2.5 past the outermost operated
    needle;
  - a transfer with a carrier (a split stitch: Kniterate supports them, but no
    reference program shows how one is encoded, so it stays refused until a
    captured program does), and a carrierless tuck-family pass that selects
    needles;
  - a carrier that does not start at its home stop moving right, goes left of
    it, or is not home at the end (C1 −11.5, C2–C3 −9.5, C4–C6 −7.5);
  - speed outside 10–800, roller outside 0–999, more than four knitting passes
    since any pass last advanced the roller, knit or tuck stitch below 2, and
    transfer passes over speed 400 or roller 450;
  - neighbouring needles on one bed transferred in the same pass (Kniterate
    splits them into even and odd passes);
  - central short rows: a needle forming more than four loops while older
    loops are held on both sides of it on the same bed. Kniterate allows 2–3
    central short rows; KCode has no rows, so loops are counted, and the
    reference corpus reaches 4 in a double-bed backing. Holding one bed while
    the other knits (an Ottoman) is not counted. A tuck leaves a held side
    held, and a loop knitted through a stitch transferred from a taller
    column counts from that column (both fixed 2026-10-24 after review). The
    count does not follow a loop on from needle to needle: Kniterate's own
    neck bind-offs in `front.kc` and `back.kc` knit one chain loop again at
    every needle it moves to, and a lineage count refuses them;
  - a tuck that leaves more than two loops on a needle. A three-loop stack
    made by transfers stays a warning, as in Kniterate's editor, because
    Kniterate's own reference crown makes one;
  - work under another carrier's dragged yarn. A carrier that moves without
    knitting (parking, a kick, a Knitout `out`) drags its yarn from its last
    stitch, which a transfer takes along, to where it rests; KCode cannot say
    a yarn was cut, so it stays attached. The stitch keeps the yarn at the
    needles until other yarns knit over it: until its needle has been knitted
    over 36 times, no other pass may work a needle under the yarn more than
    the editor's float distance (7) past it. Rollers turning while the stitch
    stays on its needle do not clear it. Taking a carrier out on the right
    partway through drags its yarn across the whole piece (Cameron's Knitout
    notes); reference programs work farther under a parked yarn only once its
    needle has been knitted over 36 times, as a sleeve widens under one (added
    2026-10-25 after review; the clearance was a count of roller passes until
    a second review). Studio's chain bind-off now starts on the side its yarn ended,
    walking the mirror image from the right, instead of first moving the yarn
    left across the live stitches. Since 2026-10-30 the same span check also
    covers parking after a carrier's final loop-forming pass. Earlier
    within-pass carries stay outside the blocking rule when the carrier
    knits/tucks/splits again, even if an empty fetch comes first. Existing
    empty-move checks remain. This extension is conservative product policy,
    not observed physical clearance. Ordinary colourwork float findings stay
    advisory, but the advisory does not detect every continuing carry (see
    the open gap below). The [policy comparison](./benchmarks/yarn-parking-audit.json)
    adds no findings to the 13 references or audited authored candidates.

  Feeder clearance measures a transfer at its front-bed needle, so a racked
  rear-to-front transfer is checked where its receiving needle actually is
  (fixed 2026-10-24 after review).

  Every exportable project's readiness lists three operator checks no file
  can make: an empty needle bed, every feeder parked at home, and a swatch to
  try the settings with the yarn (`readiness.ts::MACHINE_START_CHECKS`).
  Every status panel, written pattern and printed run sheet shows them, and
  the `machine:check` receipt states the same start assumptions. A swatch
  that can be downloaded while its design is blocked lists them beside its
  download (fixed 2026-10-25 after review).

  Each threshold carries its evidence in
  `KNITERATE_7GG_MACHINE_SAFETY_ENVELOPE_V1`: Kniterate's support articles,
  manual and Customist manual (facing needles collide, never leave a feeder
  over the bed, ordinary transfers carry no yarn, home is on the left, speed 10–800,
  small stitches break needles) plus the reference corpus, which has zero
  findings. The refusal corpus pins one case per rule (28 cases), the legality
  matrix asserts exactly which cases face or split, a seeded property test
  checks the needle geometry against an independent oracle
  (`kcode-machine-safety-oracle.test.ts`), and the module is in the mutation
  gate. Authored setup values are checked before compiling against Studio's
  limits (`machineSetup.ts`). The envelope says nothing about which settings
  suit a yarn; physical knitting stays the final gate.

  One-needle sequence coverage (2026-10-30) compares converter-emitted
  knit/tuck/transfer/drop/recast operations on both beds at rack −1/0/+1.
  Validator counts, execution snapshots, topology identities and safety
  tuck-stack decisions agree; dropped loops do not become new loop parents.
  That software check does not establish pickup stability.

  Open safety qualification work (reviewed 2026-10-30):
  - continuing within-pass carries in four-colour minimal birdseye. The
    previously recorded case carries a colour absent from the end of a row
    up to 19 needles past its last stitch before other yarns knit there,
    versus at most 1 in the compared Kniterate double-bed programs. The colour
    knits again later, so the final-use parking rule deliberately leaves this
    carry outside its scope. The float advisory compares consecutive stitches
    and misses some stitch-to-stop spans, so some carries pass with no warning
    at all. An authored minimal-birdseye rectangle with a mid-row motif colour
    remains untested by the audit: its authored sparse cases have solid-colour
    rows, while the relevant 20/40-needle edge-motif cases use developer mode
    and are already blocked by other findings. This remains an open hazard
    and warning gap;
  - attached-yarn paths beyond the blocking rule above. It follows only the
    latest stitch and cannot prove physical yarn placement. Introduction,
    release of cut yarn and attachment after drop/recast remain unmodeled;
    pickup stability needs paired accepted/unstable construction evidence;
  - construction-aware held-fabric checks beyond the central short-row
    count: where fabric is held, which region knits on, and how the rollers
    act on it, plus edge loading and finishing. The count is per needle
    column plus one transfer, so a short-row column that moves one needle
    each row, shaped like a bind-off chain, is not counted as one; whether
    that is safe in the centre is unverified;
  - comparing our sleeve increases with Customist 2.5's minimum increase
    spacing before calling consecutive-row increases safe or unsafe;
  - yarn recipes that bind yarn, structure, stitch selectors, roller, speed,
    width and transitions, qualified by swatches (Customist 2.6 adds yarn
    profiles);
  - within-pass execution phases (pickup, release, needle extension, roller
    and carriage timing), kept explicit as unknowns;
  - a versioned operation and transition conformance corpus of small
    Customist designs with their source, version, settings and exported
    KCode, and supervised physical runs bound to exact file hashes.
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
- **One workspace for every project (2026-10-11, user decision).** The
  three-column Chart / Strategy / Machine layout is retired.
  - Layout: scarf/blanket, beanie and sweater share the sweater's layout. A
    menu bar (File / Edit / View) replaces the icon ribbons.
    - Left: what you are making.
    - Middle: Design / Schematic / Machine file, always in the same place.
    - Right: the current result and one primary next action. Following the
      user's progressive-disclosure decision (2026-10-26), Why? explains the
      result; Swatch holds measurements; Files and printing holds individual
      files and the run sheet; Before knitting holds the machine preparation
      checks, including when only a swatch is downloadable. Each starts closed.
      The first thing to check stays visible as what is wrong in a few words
      ("Body colourwork: floats too long") with its fix button (a beanie's
      floats and carries offer "Use a birdseye back"); the next step is
      spelled out only where no button takes it. The next action follows the
      work: Download swatch file, then Enter your swatch; Download knitting
      package, then Print knitting sheet, with Before knitting opened once
      after each download. While a change is checked the last result stays in
      place, dimmed only if the check takes a moment, with its buttons off.
      The top bar's badge repeats the panel's headline and tone and opens Why?;
      the verdict ladder popover is only for opened `.kc`/`.k` files. Software
      checks say "File checks passed"; only exact physical evidence says
      "Proven on the machine". Export eligibility is unchanged. A number
      outside its range is not applied and says so ("Use 10–800; kept 400").
      Measuring a finished hat remains separate:
      File → Record a finished hat (beanie) records it after knitting and
      corrects the design for the next one.
  - Schematics come from the machine file read back (`workspace/RunSchematic`).
    They show the whole run: waste yarn, draw thread, the piece and its
    finish, scarves included.
  - A chart's Design view is drawn to scale when the project has a gauge
    (rows are shorter than stitches are wide, as motifs are converted). A
    beanie's Design view shows the whole piece: the rib cuff (painting stays
    out of it), the colour body, and above it the crown as the construction
    knits it, row by row (`plan.sections.crown.needles`, from the same crown
    steps the compiler emits). The crown's straight rows at the end are named
    "Gathered top" in Design, the schematic and the machine file, and yarn
    that one pass carries across empty needles is drawn as a strand.
  - **Whole hat (2026-10-11).** A beanie's stage has two tabs, like a
    sweater's pieces: Whole hat and Beanie (the chart, where it opens).
    - Whole hat's Design view draws the hat as worn, from the front or the
      back (`garment/beanieWorn.ts`). It is flat and to scale like the
      sweater's (2026-10-12; no shading): half the knitted circumference
      wide, and as tall as the Height row, the crown rounding to the top.
      The chart as knitted (motifs drawn in) has its middle at the front and
      its edges at the back seam. A cuff is a shade darker, as the
      sweater's rib is.
    - It shows the hat unstretched. How far it stretches on a head, and how
      the gathered top bunches, are not modelled. Clicking it opens the
      chart.
  - A beanie's swatch is its gauge ("Your swatch", left). A new gauge resizes
    the whole hat and re-converts its motifs in the same change
    (`trials.ts::reconvertMotifs`). Measuring a knitted hat (the trial record)
    is the last step on the right.
  - The beanie's left panel matches the sweater's (2026-10-11 UX pass):
    folding sections with summaries, Snug / Classic / Loose fits, and a
    Wanted / Knitted / Rows table. Its counts are the schematic's: the
    machine file reader gives rows the chart does not have (a birdseye
    back's ground rows) their own courses, and a beanie's body runs to its
    first crown decrease (`sweater/knitFile.test.ts`).
  - A colour chart is created and sized in cm (Size and Your swatch, like
    the beanie); a new size or swatch resizes it through the plan's sizing
    fixes. A chart with no gauge keeps needles and rows.
  - Download swatch file (`swatch.ts`, `swatch.worker.ts`): a swatch made by
    the project's own construction, in its stitch, yarns, backing and gauge.
    That is a sweater's or scarf's body stitch between rib bands, a narrow
    beanie with an unfolded cuff and both yarns in its body, or a piece of a
    colour chart. It runs through the same pipeline and verdict, and only an
    exportable swatch is downloaded (`swatch.test.ts`).
  - Backing is offered only where it changes the fabric (`backing.ts`). A
    one-colour chart knits plain whatever backing is set, so Backing says
    so with no choice. A one-yarn beanie body is "Single layer" (fairisle)
    or "Double layer" (birdseye knits its back layer in the same yarn; both
    export, `backing.test.ts`). A rib beanie has no Backing section.
  - Freehand drawing on any chart: a round brush 1 to 9 stitches across,
    round on the fabric at the gauge's row aspect, a circle tool, and
    mirror left–right / top–bottom (a beanie mirrors within its body). They
    are pure `@knitlab/colorwork-core` tools (`brushOffsets`, `stamp`,
    `ellipse`, `mirror`); each stroke is still one paint edit
    (`e2e/m3b.spec.ts`).
  - Add a colour: the project contract's `add-palette-entry` edit appends a
    palette entry (stitches keep their indexes); the chart's Add button
    applies it with a yarn on the next free carrier C2–C5 as one undoable
    change. A one-yarn beanie can so become colourwork
    (`e2e/beanie-workflow.spec.ts`). Files using the edit need this build
    or later to open.
  - On screen the verdict reads "Can't knit yet", "Ready to knit" or "Proven
    on the machine" (`engine.ts::VERDICT_WORDS`). Files, the CLI and the docs
    keep Blocked, Surface-proven and Knit-proven. While sizes rest on a
    typical gauge, the top badge and the panel both read "Ready to knit,
    sizes not confirmed" (2026-10-12); `readiness.ready` stays false then.
  - A measured gauge belongs to its fabric (2026-10-12,
    `workspace/gauge.tsx::regauge`):
    - Choosing another stitch, or another backing for a beanie or a chart,
      keeps the numbers but not as measured ("Measured on Seed stitch.
      Measure a swatch of 1×1 rib…").
    - Going back to that fabric counts them as measured again.
    - Since 2026-10-22 the fabric also includes the stitch size you set
      under Machine settings, and the rib gauge has one: a sweater's hem rib
      (what its swatch knits), a scarf's ends, a beanie's 2×2 cuff
      (`fabric.ts::gaugeFabrics`).
    - One rule for every control: each design operation compares the
      fabrics before and after and adds the gauge change to the same
      operation, so undo takes both back (`fabric.ts::appendDesignOperation`).
      A gauge the operation sets itself is left as set.
  - A backing card shows its fabric-back preview and knit time only when
    the program gives them (2026-10-12). A beanie's construction has
    neither, so its cards no longer wait on "…" forever. The states spec
    fails on any "…" left once a state has settled.
  - Machine files are named the same way for every kind (2026-10-12,
    `workspace/fileNames.ts`):
    - each file for its piece, as the panel lists it: `back.kc`,
      `scarf.kc`, `beanie.kc`, `colour-chart.kc`;
    - each download with the project first: `ring-toque-1d791146-beanie.kc`.

    A colour chart's stage and file row say "Colour chart", not "Scarf or
    blanket".
  - Machine settings, one section for every kind
    (`workspace/MachineSetupSection.tsx`, project `setup`,
    `set-machine-setup` edit). Each setting is the construction's reference
    until you set your own. A project with no setup knits byte for byte as
    before.
    - Waste yarn at the start (2026-10-12). The standard is the reference's
      interlock: fairisle 87, birdseye 80, and 81 for beanies, sweaters and
      scarves. Kniterate's own default is 80.
    - The count keeps the reference's odd or even parity, rounding up
      (`customistWastePassesV1`). A flipped parity costs seven extra passes
      to move the waste yarn back.
    - Below 70 rows the fabric may not reach the rollers, so the project
      does not compile (`project-waste-too-short`, 2026-10-24). The input
      starts at 70; a project saved with fewer still opens and says why.
    - The swatch file uses the project's setup.
    - The old `frame` settings stay unread: every project stores their
      defaults (`wasteRows: 20`), so reading them would shrink every
      project's waste.
    - Draw thread on or off (2026-10-12), for beanies, sweaters and scarves.
      The chart references knit without one.
      - Off, the start skips the draw yarn's insert and final rows and C1
        is never brought in. The waste sections around it are unchanged.
      - The pattern says to unravel or cut the waste away, and the operator
        note says "no draw thread". So does a sweater's assembly, since
        2026-10-22.
      - The Machine file reader finds the cast-on after the last waste pass.
    - The top, beside the start (2026-10-12): bind off or waste yarn, and
      how many rows of waste on top.
      - Sweaters and scarves: their Top choice moved here from Edges and
        Ends (it stays the object's `top`). The standard waste on top is
        8 rows.
      - Colour charts: the reference ends on closing waste (fairisle 16,
        birdseye 20 rows; kept even so the carriage parks left). The ramp
        of stitch sizes is resized to the count. A machine chain bind-off
        is offered and passes the checks, but Kniterate's own chart files
        don't use one.
      - A beanie's crown gathers its top; nothing to set.
    - Speed, roller and stitch size for each section (2026-10-12), in a
      fold-out (`sectionStandards`). Each starts at the reference's value.
      - Charts: waste and body.
      - Beanies, sweaters and scarves: waste, cast-on, rib (when the piece
        has one), body and transfers (`flatStartSettingsV1`).
      - Transfers are every transfer's: a beanie's crown too, since
        2026-10-22. Until you set yours, the crown keeps its reference's
        (speed 150), and the panel says so.
      - The waste keeps its schedule: the speed ramps up to the setting and
        the roller pulls on the same passes. A rib keeps the reference's
        one-step difference between its front and rear stitch sizes.
      - Stitch sizes are the KCode selectors 0–15 (10–15 are written as
        A–F). Since 2026-10-24 each section's inputs stay inside the
        machine-safety envelope (`machineSetup.ts::sectionLimits`): knitting
        sections stitch 2–15 (a rib 3–15, for its rear bed), speed 10–800,
        roller 0–999; transfers speed 10–400 and roller 0–450. A stored
        value outside it blocks compiling
        (`project-setting-outside-machine-range`). Before that they stayed in
        the editor's range (up to 800;
        −500 to 999), with a warning outside what Kniterate's own files use
        (speed 60–700, roller 0–600).
      - A project that sets none knits byte for byte as before.
  - One gauge editor for every kind (`workspace/gauge.tsx::GaugeFields`).
    It saves each gauge as one change, on Enter or when focus leaves it. The
    words for where gauges come from are shared too ("measured", "typical",
    "measure again").
  - The Machine file view (`sweater/knitFile.ts`, `KnitFileView`) reads any
    emitted `.kc`. Its "Step through" mode holds the exact movement, pass
    grid, checks and source that used to be the separate machine workspace.
  - A problem found in many places is one thing to check (2026-10-12,
    `handoff.ts::storyNotes`): twenty long floats are one "Body colourwork"
    note with one Show, and the headline counts kinds of problem. Each place
    stays a finding of its own in the pattern's Unresolved list.
  - One readiness story for every kind of project (2026-10-12):
    - Sweaters and scarves now use `handoff.ts::readinessStory`, as beanies
      and charts do; the separate `piecesStory` is gone.
    - The panels share one notes builder (`workspace/statusNotes.tsx`).
      A known problem reads "Part: next step", with what it leads to on
      hover; any other note shows its own message.
    - Notes that say the same are shown once. A file in the Download step
      no longer repeats a note under itself.
    - One detail line per state, on screen and in every pattern:
      - can't knit: "Fix these first.";
      - things to check: "It can be knitted. Check these first.";
      - typical gauge: "Sizes use a typical gauge until you measure a
        swatch.";
      - ready: "Every software check passed."
    - `e2e/states.spec.ts` checks every kind against this at 1280 × 800.
  - Words are plain: no "≈", no "machine truth" or "trials". (Since
    2026-11-07 a setting the file sets with its own op, such as carrier
    spacing, is no longer turned into a "Set … on the machine" check; the
    controller has no such setting.)
  - Export stays hard-gated by the authored verdict.
  - Contract: `docs/mockups/workspace-target.md`. Coverage:
    `e2e/workspace.spec.ts` and the updated specs.
- **One-colour scarf or blanket (2026-10-11).** A new `object: { kind:
  'panel' }` is one flat rectangle in one yarn.
  - Settings: sized in cm, any knit/purl/tuck/slip stitch from the sweater's
    library (or your own), an optional rib band at each end, and a bind-off
    or waste-yarn top.
  - It is planned (`sweater/panel.ts`) and compiled exactly like a sweater
    piece, through the same rasterizer, shaped-panel construction, checks
    and verdict (`runSweaterPipeline` takes any flat-piece plan). It opens
    in the shared workspace.
  - Its written pattern and package are in `sweater/panelHandoff.ts`.
  - The colour-chart scarf or blanket is still offered next to it in New
    project.
  - Seed, stockinette and full-cardigan panels compile Surface-proven
    (`sweater/panel.test.ts`, `e2e/panel-workflow.spec.ts`).
  - Not yet built: a CLI command for panels.
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
carriage and carrier continuity, transfer pairing, empty-bed loop-state
transitions, and the machine-safety envelope (documented collision geometry,
carrier home positions, stopping distance, and speed, takedown, stitch and
transfer limits). Separately tested topology projection establishes a deterministic
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
- **Widened V1 (ruled 2026-09-28):** Customist parity
  ([`CUSTOMIST-PARITY.md`](./CUSTOMIST-PARITY.md)) plus AI-driven rectangles,
  flat seamed beanies and sweaters through the design language
  ([`DESIGN-LANGUAGE.md`](./DESIGN-LANGUAGE.md)); milestones M5–M9 in
  `ROADMAP.md`. The M5 rectangle subset, M6 beanies and an M7 sweater slice
  are built (see their entries above). Raglan sweaters, colourwork on sweater
  pieces, and the M5 parity rows that need Customist reference captures are
  not.

## The one real promotion gate

The trial candidate partially reproduces the captured Customist
`reference/fairisle.kc` program (see `V1-PHYSICAL-TRIAL.md`); without
Studio's start (2026-11-07) 280/286 passes match at stitch level. Its manifest records the strict full-trace differences.
The modified candidate has no controller or physical-run evidence.

**Revised 2026-09-28:** the V1 gate now requires exact-artifact qualification
of a rectangle, a flat seamed beanie and a complete sweater at the frozen final
compiler fingerprint, with tolerances declared before knitting
(`V1-PHYSICAL-TRIAL.md`). A run of the current rectangle candidate is
development evidence. The executable check below has **not** been extended yet
and still covers only the fixed rectangle, so passing it no longer licenses the
`1.0.0` tag.

*(Superseded:)* `1.0.0-rc.1` → `1.0.0` is gated **only** by a successful real-Kniterate run
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
- `ROADMAP.md` — the agreed work order (its top checklist) and milestone ledger
  (M0–M3D complete; M5, M6 and an M7 slice built in software; M8–M9 proposed).
- `CUSTOMIST-PARITY.md` — V1 Customist capability inventory and acceptance rules (proposed).
- `DESIGN-LANGUAGE.md` — v2 Design → Plan → Program contract for people and agents (proposed).
- `HANDOFF.md` — reduced to present truth; points here.
- `docs/archive/BUILD-S1.md` — **historical** M2 implementation contract (S1 shipped).
- `docs/mockups/workspace-target.md` — the binding workspace contract (one
  layout for every project, 2026-10-11); `workspace-target.html` is the
  retired three-column mockup, kept for history.
- `docs/mockups/workspace-v2.html` — superseded design reference.
