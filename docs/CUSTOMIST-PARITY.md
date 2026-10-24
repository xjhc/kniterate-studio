# CUSTOMIST-PARITY — V1 capability inventory and acceptance rules

**Status: proposed V1 scope contract, 2026-09-28. Not implemented.** This
inventory defines what "everything Customist Studio can do" means for the
widened V1 (see [`FOUNDING.md`](./FOUNDING.md) §1). Each row has a stable ID,
Studio's current state, the [`DESIGN-LANGUAGE.md`](./DESIGN-LANGUAGE.md)
construct that will express it, and the evidence needed to accept it.
[`STATUS.md`](./STATUS.md) still has the final say on what has shipped.

**Evidence class: external documentation.** Sources:

- the Customist Studio v2.5 user manual, "Last documentation update: July 28,
  2026", read in full on 2026-09-28 from the Notion page embedded at
  `editor.kniterate.design/documentation`;
- the [Customist Studio 2.5 release notes](https://www.kniterate.com/2026/07/29/customist-studio-2-5-new-template-editor-and-much-more/)
  (2026-07-29).

Neither source shows observed Customist behaviour or output. Parity evidence
comes from captured Customist programs (the "reference captures" section).

---

## Acceptance rule

**Parity means the behaviour is demonstrated as equivalent. Documenting a
difference does not complete a row.** No row may be closed as "gap
documented" or "out of scope", apart from the platform rows in §J, which need
a product ruling. Every other row needs one of these before V1 can be tagged:

| Level | What it proves | Required evidence |
|---|---|---|
| **R — reference-exact** | Studio emits the same machine program as Customist for the same design. | The design is authored in Customist and its exported `.kc` is captured. Studio compiles the equivalent design, and the strict whole-program `MachineTraceV1` comparison is identical. |
| **E — equivalent behaviour** | Studio's instructions differ, but they knit the same fabric. | The same captured reference. Plus a loop-topology and knitted-face comparison showing the same loop structure per bed, carrier and course, with every instruction-level difference named and justified. Where the equivalence depends on the physical fabric (edge closure, backing density), add a physical swatch comparison under [`V1-PHYSICAL-TRIAL.md`](./V1-PHYSICAL-TRIAL.md) rules. |
| **F — functional** | An interactive capability that has no machine output (views, undo, zoom). | A browser test that performs the Customist workflow and checks the equivalent result in Studio. |

Two tools do not exist yet: a topology-equivalence comparator for level E
(today there are `knitted-faces.ts` and the strict trace diff), and the
reference captures below. Both are V1 work items, not optional.

Parity rows are separate from physical proof. A row at level R or E is
software evidence; Knit-proven stays exact-artifact only.

## Studio today (baseline, 2026-09-28)

Rectangle colour charts up to 252 × 1,200 (75,600 cells) with pen, erase, line, rectangle,
fill, selection and copy/cut/paste. Up to four pattern yarns on C2–C5.
Fairisle and Birdseye backings compile through Customist-matched frames. The
`pnpm parity` scoreboard reads **1 exact, 4 partial, 1 blocked, 7
unsupported** (the exact one is the 2×2 rib beanie, reproduced in M6's thin slice). Over-limit floats are non-blocking warnings. Stitch and pass
overrides exist in the schema, but any active one blocks compilation. M5
added gauge and centimetre-target sizing checks, an image-to-chart converter,
rendered views and computed readiness through the CLI. There is no rib, no
shaping, and no multi-piece garment.

---

## A. Starting a design (base commands and templates)

| ID | Customist capability | Studio today | Design-language construct | Evidence | Milestone |
|---|---|---|---|---|---|
| CP-A1 | Rectangle template: width in needles × height in rows, or in cm from tension, with units in cm or stitches. | Partial (M5, CLI): needles × rows up to 1,200 rows. Recorded gauge + cm target derive the counts and offer resize fixes. | `object: rectangle` with `Length` in cm or stitches and gauge-derived counts. | R | M5 |
| CP-A2 | Rectangle base stitch type (front knit, rear knit, miss) and main yarn carrier 1–6. | Front jersey only; pattern carriers C2–C5. | `fabric: jersey{face}`; yarn → carrier binding. | R | M5 |
| CP-A3 | Sweater template wizard: crew or V neckline; straight, classic or raglan shoulders; standard, raglan or straight drop-shoulder sleeves; sizes S–XL or custom body measurements. Generates front, back, sleeve and collar panels. | Partial (2026-10-10): Studio's own drafting, with crew, V, square or boat necks; set-in, J-sleeve and drop-shoulder; sizes XS–XXL × four fits or custom; front, back, sleeve and a separate neckband. No raglan, and no Customist template parity. | `object: sweater` template producing `pieces` and `joins`. | R per panel + assembly gate | M7 |
| CP-A4 | Sweater measurements split into design measurements and garment measurements (body + fit), all editable, with ease per measurement. | Partial: finished garment measurements are stored and editable, and size and fit fill them in. Body measurements and ease per measurement are not stored. | `object.sweater.measurements` with per-measurement ease and value provenance. | R | M7 |
| CP-A5 | Ribs for waistband (body rib), cuff and neckband/collar: editable depth, removable, with a choice of rib pattern. | Partial: hem, cuff and neck ribs, each with a rib pattern (1×1, 2×2, 3×1, 3×2 or any k/p row) and a depth (hem removable). The neckband is a separate sewn strip, not a pickup. | `zone` with `fabric: rib(k,p)`; collar `piece` + `pickup` join. | R | M6 (rib), M7 (collar) |
| CP-A6 | Panel asymmetry option (one extra row on right-side shaping points) and even-rows option (row count rounded to even so the main feeder is left for the armhole bind-off). | Implicit: bind-offs happen on the row that starts at their edge, so the right side shapes one row later, as in Customist's panels. Not offered as an option. | Template options, recorded as named rounding rules in the Plan. | R | M7 |
| CP-A7 | Garment-wide Shape settings with a lock. Unlocking and applying regenerates every panel from the shared measurements. | Missing. | Object parameters regenerate derived pieces; `pinned` values survive, and conflicts become findings. | F + R | M7 |
| CP-A8 | Import Vector Shape (SVG/DXF): pick a piece from a multi-piece file, size in cm (linked or free), gauge conversion, stitch type and carrier, Fill or Outline mode. | Missing. | `piece.outline: vector(asset, sizing, gauge, mode)`, bundled asset. | R | M8 |
| CP-A9 | Load Txt File Pattern (old Kniterate Template Editor, DesignaKnit 9 export): multiple yarns and stitch symbols with stitch mapping, auto rib transfers, reversible 2-colour tubular option (solid edges, roll every pass, single-stitch edge), per-row-set speed/roller/stitch. | Missing. | Importer to Design (pieces, zones, stitch charts). | R | M8 |
| CP-A10 | Stitch Image / Stitch Block: PNG colours mapped to stitch types (e.g. for plating), max 252 px wide. | Missing. | `fabric: stitch-chart` from an image asset with a colour → stitch map. | R | M8 |
| CP-A11 | Generate Base from an empty stack; Resize Workspace (add/delete rows or columns after, before or within, fill stitch and yarn). | Chart set-width/set-height, and blank charts from the CLI (`new --width --height`). | Design length/width edits; Plan regenerates. | F + R | M5 |

## B. Colourwork

| ID | Customist capability | Studio today | Design-language construct | Evidence | Milestone |
|---|---|---|---|---|---|
| CP-B1 | Birdseye Jacquard from a PNG (≤ 252 px wide, **≤ 6 colours per row**) with colour → carrier mapping. | Colour chart import (not PNG); **≤ 4 colours**; generic body. | `fabric: colorwork{backing: birdseye}`; `motif` from a chart or image asset. | R | M5 |
| CP-B2 | Birdseye MINIMAL algorithm (backing uses only the yarns in the row). | Generic "one rear stitch per needle per row" body. | `birdseye{algorithm: minimal}` | R | M5 |
| CP-B3 | Birdseye FULL algorithm (every design yarn joins the backing). | Missing. The Customist full-needle DBJ body in `dbj.kc` is not reproduced. | `birdseye{algorithm: full}` | R | M5 |
| CP-B4 | Invert Colors (2 colours): reversible tubular jacquard with inverted, mirrored back. | Missing. | `backing: reversible-tubular` (named separately from `birdseye`). | R | M8 |
| CP-B5 | Full-Needle: non-tubular jacquard knitted at 0.5 rack. | Missing. | `birdseye{fullNeedle: true}` | R | M8 |
| CP-B6 | Yarn Order: manual carrier sequence, or blank for automatic. | Automatic only. | `colorwork.yarnOrder` | R | M5 |
| CP-B7 | Borders: Close, Layering NONE/GLOBAL/LOCAL, inner/outer front/rear edge carriers, Negate. | Missing. | `colorwork.borders{…}` | R + E (edge closure may need a physical swatch) | M8 |
| CP-B8 | Fair isle (single-bed floats) with a float warning threshold (default 7; floats > 7 warned). | Shipped through the Customist-matched fairisle frame (280/286 stitch passes vs `fairisle.kc`); Studio's default threshold is 5. | `backing: fairisle`, `floatLimit` preset 7 to match Customist. | R | M5 |

**Carrier-role conflict (needs a product ruling before CP-B1 can close):** six
colours in a row need all six carriers for pattern yarns. The fixed V1 profile
reserves C1 for draw thread and C6 for waste, which caps Studio at four.
Closing CP-B1 means either changing the carrier-role contract (for example a
waste/draw yarn that is later replaced, or a body yarn doubling as waste, as
Customist's Waste & Cast-on "Body yarns" field allows) or adding an explicit
carrier-swap workflow. Recorded as an open decision in `FOUNDING.md` §1.

## C. Stitch structure and free editing

| ID | Customist capability | Studio today | Design-language construct | Evidence | Milestone |
|---|---|---|---|---|---|
| CP-C1 | Stitch palette: knit front/rear, tuck, miss/explicit miss, transfers (front→rear, rear→front, racked), split, drop. | Colour only. Stitch overrides are in the schema but block compilation. | `fabric: stitch-chart`; anchored stitch overrides that actually compile. | R | M8 |
| CP-C2 | Free Edit: pencil, line and rectangle drawing of any stitch symbol; copy/paste; OffsetX/OffsetY. | Colour tools shipped; no stitch symbols. | Stitch-chart editing through the same edit log. | F + R | M8 |
| CP-C3 | Tiling (TileX/TileY, inline or expanding). | Missing. | `placement.repeat` | R | M5 |
| CP-C4 | Copy command: cut or copy; target by location, vector, side or self; Mirror bed; Mirror X. | Copy/paste in the colour chart only. | Placement transforms (`flipX`, `flipY`, bed mirror) on stitch charts. | R | M8 |
| CP-C5 | Front <> Rear Transfers: between rows on a bed change, or everything to front/rear above. | Missing. | Automatic zone-boundary transfers (e.g. rib → jersey), shown in the Plan. | R | M6 |
| CP-C6 | Tuck to Knit: moves front tucks to the rear so knit and tuck can share a pass. | Missing. | Compiler lowering rule for stitch charts with mixed knit/tuck. | R | M8 |
| CP-C7 | Interleave: two parallel knitting blocks with smart-interleaving options and a second feeder. | Missing. | Split-feeder regions (the same mechanism as CP-D4). | R | M7 |
| CP-C8 | Insert Rows Between; Delete Row Set by type (knit, tuck, transfer, split, drop, explicit miss); insert/delete rows and columns from the context menu. | Row insert/delete in the colour chart. | Design edits on zones and stitch charts. | F + R | M8 |

## D. Shaping, splitting and bind-off

| ID | Customist capability | Studio today | Design-language construct | Evidence | Milestone |
|---|---|---|---|---|---|
| CP-D1 | Decrease without Shape: LEFT, RIGHT, BOTH, LEFT THEN RIGHT or RIGHT THEN LEFT; by repeat period or wales-over-rows; rounding; fashion-mark margins; layered; racking display; transfer settings. | Missing in Studio (knitlab2 emitters in `machine-lib` are unused). | `piece.edges` shaping cadence with `style` and `margin`. | R | M6 |
| CP-D2 | Decrease Transfers on shaped panels: FASHIONED (adjustable mark width), REVERSIBLE (double bed), SIMPLE; 1- and 2-stitch decreases; pre/transfer/final-transfer row settings. | Missing. | Edge shaping styles on outline-derived pieces. | R | M6 (flat hat crown), M7 |
| CP-D3 | Increase Transfers: Simple and Fashioned (5 from the edge) using split stitches. Customist lists Reversible as "not implemented". | Missing. | Edge shaping (increase) styles. | R | M7 |
| CP-D4 | Neckline Shaping: two feeders knit both sides, central bind-off, 1- and 2-stitch decreases in FASHIONED/REVERSIBLE/SIMPLE style, reversible central bind-off, reverse roll and ×2 reverse roll, and settings per row role. | Missing. | `piece.top: neckline{…}` with split-feeder regions. | R | M7 |
| CP-D5 | Bind-off: front, rear or both beds; direction; one or two yarns; knit first stitch, delete above, reverse knit, move last, roll first transfer, knit last, setup, reverse setup; graded settings per row type. Used at the end of a piece and for large decreases (armholes). | Frame bind-off only (fixed per preset). | `bind-off` finish and bind-off spans with named options. | R | M6 (piece end), M7 (armholes) |

## E. Waste, cast-on, placement and finishing

| ID | Customist capability | Studio today | Design-language construct | Evidence | Milestone |
|---|---|---|---|---|---|
| CP-E1 | Waste & Cast-on: draw, waste and body yarns (the first body yarn casts on; repeat a yarn to change direction), full-needle and 1×1 cast-on options, full-needle body, interlock rows (default 80), reverse draw, reverse waste, body first, delete rows below, retract feeders. | Fixed Customist-matched frames per backing; not editable. | `piece.bottom: start{recipe, options}` with value provenance. | R | M5 (options), M6 (rib cast-on) |
| CP-E2 | Waste & Cast-on settings for each part (start, interlock, insertions, tubular front/rear, draw insert, cast-on tubular, cast-on zig-zag, transfer options, draw final). | Fixed by preset. | Recipe section settings exposed as `preset` values that can be `pinned`. | R | M5 |
| CP-E3 | Finishing: waste rows at the top, or bind-off. | Park bind-off (fairisle frame); waste-and-drop. | `piece.top` finish (waste-off, bind-off, crown closure). | R | M5 |
| CP-E4 | Center on Bed, Trim Workspace, Position Feeders (needle offset from the bed edge). | Needle offset edit. | Placement on the bed from `needleOffset` / centering rule, shown in the Plan. | R | M5 |

## F. Machine settings (options column)

| ID | Customist capability | Studio today | Design-language construct | Evidence | Milestone |
|---|---|---|---|---|---|
| CP-F1 | Per-row options: rack −4.0 to +4.0 incl. ±0.5; speed ≤ 800 mm/s; roller −500 to 999; stitch size front/rear 0–15; direction forced or automatic; carrier 1–6 (0 for transfer rows). | Missing (pass overrides block compilation). | Anchored row-setting overrides that compile; recipe presets otherwise. | R | M5 |
| CP-F2 | Edit Options Column over a selection: Constant, By Block, By Step, Graded; fields per row type (knit, transfer, …); keywords speed, roller, stitch (one or front/rear), direction, carrier, racking. | Missing. | Range-setting edits (constant / block / step / graded) over zone or row anchors. | R | M5 |
| CP-F3 | Compiler options: carrier spacing and stopping distance. | Emitted as headers the vendor converter reports as unknown; extracted for the operator only. | Recipe `compiler` settings, with a verified path into the emitted program or an operator-owned checklist item. | R or E | M5 |
| CP-F4 | Tensions saved with each design. | Frame presets only. | Project-level recipe + pinned settings persisted in the project file. | F + R | M5 |
| CP-F5 | Recommended settings per structure (single jersey, 1×1 rib, jacquard, double jersey, cardigan) and fixed transfer settings (stitch 0, roller 0, speed 120). | Customist-matched presets for fairisle and birdseye only. | Versioned recipe presets per fabric kind, each value `preset`. | R | M5–M8 |

## G. Views and checks

| ID | Customist capability | Studio today | Design-language construct | Evidence | Milestone |
|---|---|---|---|---|---|
| CP-G1 | Pattern view (carrier colours) and Stitch view (stitch-symbol colours). | Partial (M5, CLI): `render --view chart` at gauge-true proportions; pass grid; no stitch-symbol view. | `render --view pattern` and `render --view stitch` | F | M5 (pattern), M8 (stitch) |
| CP-G2 | Heat-map views: roller, speed, stitch size, occupancy (stitches per needle); direction view. | Partial (M5, CLI): `render --view speed/roller/stitch/direction` per emitted pass; no occupancy map. | `render --view` with roller, speed, stitch-size, occupancy or direction, from the RunArtifact. | F | M5 |
| CP-G3 | Checks window: Issues (critical / warning), Kicks, Moves, split view, locations shown on the canvas. | KCode-native findings (43-rule validator), pass roles (kickback, carrier move), anchored diagnostics. | Findings with `owner` and design `path`; pass roles per piece. | F | M5 |
| CP-G4 | Named checks: pick-up stitch not stable; two-sided needle action needs half racking; knitting without carrier; transfer row with carrier; float distance too large; transfer from an empty needle; carrier must first move left-to-right (warning); loop has > 2 parents; needle action in unsafe bed range; invalid needle specification (transfer at half rack). | Mapped 2026-10-24. Blocking: two-sided needle actions at a whole rack (`machine-safety.facing-needles`), transfer row with carrier (`machine-safety.transfer-with-carrier`), unsafe bed range (`machine-safety.unsafe-bed-range`), carrier first moving left or away from home (`machine-safety.carrier-start`, stricter than the editor's warning), transfer from an empty needle (`machine-trace.transfer-source-empty`), transfer at half rack (`machine-trace.unknown-action`), knitting without carrier (KCode encodes it as a drop). Warning: loop with more than two parents (`machine-trace.loop-stack-policy`, error above three). Information: float distance (`machine-advisory.float-distance`). Pick-up stitch stability is a design check, not mapped. | A rule-to-rule table in the findings catalog; each Customist check shown to fire on its triggering design. | F + R | M5 |
| CP-G5 | Markers and Query on a selection; Zoom to canvas; Zoom to selection. | Zoom to selection shipped; no markers or query. | UI + `describe --at <path>` | F | M8 |

## H. Workspace and files

| ID | Customist capability | Studio today | Design-language construct | Evidence | Milestone |
|---|---|---|---|---|---|
| CP-H1 | Multi-canvas workspace: several panels at once, each with its own edit history; add, duplicate, rename, delete canvas; Insert design from the library. | One chart per project. | Multiple `pieces` in one project; history entries scoped by piece. | F | M7 |
| CP-H2 | Save and reload a design with its full editable command stack (Cstack `.json`); flattened canvas (`.buck`). | Project file with full edit history (shipped). | Project v2 file (lossless, bundled assets). | F | M5 |
| CP-H3 | Download image (`.png` of the canvas). | Partial (M5, CLI): `render -o file.png`; printable run sheet. | `render -o file.png` | F | M5 |
| CP-H4 | Knit! / Export Kcode: compile to `.kc` for the SD card as `command.kc` (one-way). | Shipped, gated by the verdict. | Per-piece `.kc` in the export bundle. | F | M5 |
| CP-H5 | Undo/redo shortcuts; tool shortcuts (M, S, P, L, R, F). | Undo/redo and tool shortcuts shipped for colour tools. | Unchanged. | F | M8 (stitch tools) |

## I. Customist behaviour Studio replaces (still needs equivalent evidence)

| ID | Customist behaviour | Studio equivalent | Evidence |
|---|---|---|---|
| CP-I1 | Ordered command stack (Layers), with reorder, hide, rename, per-layer Params and Location/Selection. Editing an earlier layer disables later layers until each is re-confirmed. | Typed Design edits with stable IDs; derived pieces regenerate; anchored overrides are revalidated and quarantined, never silently dropped. | F: every Customist command outcome in §A–§F reachable through Design edits; re-editing an earlier choice recomputes without manual re-confirmation, or produces a quarantine finding. |
| CP-I2 | Checks before Knit!, where critical issues block compilation. | Three-rung verdict + computed readiness ([`DESIGN-LANGUAGE.md`](./DESIGN-LANGUAGE.md) §7). | F |

## J. Platform features — product ruling required

These Customist v2.5 features are real, but they conflict with Studio's
local-first invariant (no backend, login or telemetry). They are **not**
silently excluded; each needs an explicit user ruling before V1 closes.

| ID | Customist feature | Conflict |
|---|---|---|
| CP-J1 | Account and login; My Designs cloud storage; Duplicate; 30-day trash bin; local backup compression. | Needs a backend and accounts. A local equivalent (a project library folder with duplicate and trash) would satisfy the capability without one. |
| CP-J2 | Public design sharing; likes, remixes, comments, follows; notifications. | Needs a backend and a community service. |
| CP-J3 | Wi-Fi SD-card transfer. | The manual marks it "Under development"; it is not a shipped Customist capability. Revisit if it ships. |
| CP-J4 | Anonymous bug report. | Telemetry-like. A local "copy a diagnostic bundle" action would satisfy the capability. |

---

## Studio beyond Customist (the "more")

Already shipped:

- `.kc`/`.k` import and inspection. Customist cannot import `.kc`.
- Honest three-rung verdict with an exact-artifact physical registry.
- Back-face preview.
- Loop-topology and execution debugger.
- Run sheet with time estimates.
- Local-first and offline operation.
- Deterministic, reproducible exports.

V1 additions:

- **AI-driven design:** Claude authors typed Design intent through the CLI
  ([`DESIGN-LANGUAGE.md`](./DESIGN-LANGUAGE.md)).
- **Beanie template:** Customist v2.5 offers only Rectangle and Sweater.
- **Gauge-aware sizing** that shows its derivation.
- **Computed readiness.**
- **Finishing and assembly instructions** in the export bundle.

## Reference captures (dependency)

Level R and E evidence needs Customist programs exported from **known source
designs**. The 13 captured references do not come with their source designs.
Only `fairisle.kc` has a reconstructed chart. Every V1 row therefore needs a
purpose-built design authored in Customist (by the user, with a Customist
account). Save each capture as:

- the exported `.kc`;
- the Cstack `.json` (so the exact source design is known);
- a note recording the Customist version and every parameter set.

Captures are external inputs, stored under `packages/machine-lib/reference/`
with their provenance. Suggested first batch, ordered by milestone:

1. **M5:** 40 × 60 rectangle; Birdseye MINIMAL and FULL at 2, 4 and 6 colours;
   yarn order; tiling; options-column ranges; a waste & cast-on variant.
2. **M6:** flat 2×2 rib beanie with crown decreases (compare with
   `2x2-rib-beanie.kc`); rib → jersey transfers; a motif in the body.
3. **M7:** Sweater template in S and XL with crew and V-neck and each shoulder
   and sleeve style: every panel including the collar.
4. **M8:** vector import, txt import, stitch block, invert, full-needle, borders.
