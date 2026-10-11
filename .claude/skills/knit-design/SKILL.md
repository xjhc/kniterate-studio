---
name: knit-design
description: Design a Kniterate machine-knitting project (sweater in flat pieces, beanie, scarf, blanket, rectangle panel, colorwork from an image) from a plain-language request, using the Kniterate Studio CLI. Use when someone asks to make, size, resize, or check something to knit on the Kniterate.
---

# Knit design with the Kniterate Studio CLI

You author **intent**; Studio derives everything else. Run commands from the
repository root. Every command prints JSON; exit 0 = ok/ready, 1 = blocked or
not ready, 2 = usage error. `pnpm --silent studio -- help` lists commands and
`pnpm --silent studio -- explain <term|rule>` explains any term or finding.

## What exists (M5)

One flat rectangular panel per project (scarf, blanket, swatch, colorwork
panel): up to 252 stitches wide and 1,200 rows tall (75,600 cells), up to four
pattern colors on carriers C2–C5, Fairisle or Birdseye (exactly four colors)
backing.

Beanies: flat, seamed afterwards, in Customist's construction. Two kinds:
- **All 2×2 rib:**
  `new --object beanie --head-cm 56 [--ease -0.1] --body-cm 18 --gauge <rib st>,<rib rows> --color "Name=#hex" -o hat.json`.
  The chart is the rib body.
- **Rib cuff + colorwork body (e.g. an Arc'teryx-style toque):** add
  `--cuff-cm 7 --rib-gauge <rib st>,<rib rows> [--fold] --accent "Name=#hex"`.
  Here `--gauge` is the body's colorwork gauge and `--body-cm` the body
  above the cuff; `--fold` knits the cuff at twice its visible height. The
  cuff height, fold and rib gauge are stored, and `plan` checks the cuff
  against them (`cuff-off-target` carries the fix).
  Put the motif in as a **placement**:
  `place hat.json --image logo.png --height-cm 8 --id logo [--x center] [--above-cuff rows] [--colors 2]`.
  With `--colors 3` or more, an image color with no matching yarn is refused:
  map it (`--map "2=main"`) or drop it on purpose (`--leave 2`).
  The image is cropped to its artwork, so `--height-cm` is the visible
  motif's height and `--above-cuff` counts rows to its lowest visible stitch.
  It is converted at the body gauge and stored with its anchor, so it stays
  centred above the cuff when you resize; one that no longer fits is a
  `project-placement-conflict`, never clipped. After a gauge change, run
  `place hat.json --refresh logo`. If it reveals a new unmapped color,
  the refresh refuses without saving; repeat with `--map "2=main"` or
  `--leave 2` to make that choice. `--leave` also removes a default mapping;
  do not both map and leave the same color. Remove one with the `remove-placement`
  edit. Motif color 0 is left as the ground.

**Change fit, cuff, height, gauge or backing with `fit`**, never by editing
needle or row counts: `fit hat.json --head-cm 52`, `--cuff-cm 8`,
`--no-fold`, `--body-cm 15`, `--gauge 24,30 --gauge-source measured`,
`--rib-gauge …`, `--backing birdseye`. It is one undoable operation that
applies the plan's own sizing fixes; motifs keep their anchors. `new` takes
`--backing birdseye` too.

**Hand-off:** `package hat.json -o hat-package/` writes the editable project,
`program.k`/`program.kc`, `instructions.md`, `schematic.svg`, `chart.png`,
`measurement-form.md`, `measurements.json` and `manifest.json`. When the
knitter returns the filled `measurements.json`, `measure hat.json
measurements.json` records the trial, makes the gauges measured and re-sizes
in one undoable operation; the knitted candidate's files stay as they were.
Mark made-up values `"synthetic": true`; never present them as a real knit.

For both kinds:
- The target width is the finished circumference; the plan adds the seam
  stitches and keeps the rib symmetric. `plan`, `describe`, `readiness`,
  `render` and `export` work as for any project, and `export` also writes
  finishing instructions.
- `plan` and `describe` give the cuff, body and crown rows and cm and the
  finished height, with the gauge each one assumes. Quote them; don't
  compute your own.
- Floats are measured along each yarn's real path through the program,
  across rows and sections. Floats over 7 stitches are design warnings, so
  the hat is not ready. Say so, and suggest a bolder or more compact motif.
  Never claim ready around them. A `carried-yarn` operator check (yarn carried
  in from the waste section) is not a blocker.
- **Birdseye back** for logos and thin motifs (like the Arc'teryx bird):
  `edit hat.json '{"kind":"set-strategy","strategy":{"technique":"birdseye","floatLimit":7}}'`.
  Every color knits its share of the back on every row, so no float is over
  a few needles, and the fabric is thicker and warmer. The body knits 3 extra
  ground rows (back start and join); `plan` counts them and its height fix
  allows for them. The body gauge must be measured on birdseye fabric. Prefer
  this over shrinking or simplifying the motif, and say that birdseye is
  heavier.
- At 194 needles, the all-rib crown is Kniterate's own; it ends with one
  3-loop stack, so readiness reports a warning. Other widths use our
  eight-line crown, which has never been knitted; say so.

**Sweaters: flat pieces, sewn** (`sweater help` lists everything). A
sweater is one project: front, back, a sleeve knitted twice and (crew neck)
a neckband, each its own `.kc`. You state the design; Studio drafts the
shapes from finished measurements and the gauge, and every piece compiles
through the same strict checks.

- Styles: `--silhouette set-in` (shaped armhole, capped sleeve), `j-sleeve`
  (a drop shoulder with a short curved underarm step and a flat-topped
  sleeve) or `drop-shoulder` (straight body, flat sleeve top). Necks:
  `--neck crew` (shaped, separate rib neckband; the right shoulder knits on
  a second cone of the same yarn) or `boat` (straight top with a rib edge).
- Size: `--size XS…XXL --fit fitted|classic|relaxed|oversized` gives finished
  measurements; override any with `--measure chest=112,length=66,…` (cm,
  the garment not the body).
- Stitch: `--stitch <id>` from `sweater choices` (stockinette, reverse,
  1×1/2×2 rib, seed, moss, garter, broken rib, welts, basketweave, half
  cardigan, fisherman rib, slip-stitch tweed), or your own repeat with
  `--texture "kp/pk"`: rows top first, `k` knit, `p` purl, `t`/`u` tuck on
  the front/back bed, `s` slip. A row cannot both knit and tuck on the same
  bed (one carriage pass); the refusal says which row and why.
- Edges: `--hem-rib kkpp --hem-cm 6`, `--cuff-rib`, `--cuff-cm`,
  `--neck-rib`, `--neck-cm`; `--top bind-off|waste`; `--fashion 2` moves the
  shaping two stitches in from the edge.
- **Any silhouette by hand** (A-line, waist, cropped, boxy, a deeper
  armhole), like a garment-shaping knitting machine: `sweater plan` prints
  `shapes.body.points` and `shapes.sleeve.points` as `"width,height[,underarm][,concave|convex]"`
  (cm; the full width at that height, bottom up). Change the points and send
  them back with `sweater shape s.json --body "66,0 50,22 56,41,underarm 50.6,41 41.5,49.4,concave 41.5,62"`.
  Front and back share the body edge, so the side seams match. A set-in or
  J sleeve cap refits itself to the new armhole. `--reset body|sleeve|all`
  returns to the measurements. The measurements a shape replaces are marked
  `setBy: "shape"`. Read the seam findings after: a drop-shoulder sleeve top
  must match its armhole.

```bash
pnpm --silent studio -- sweater new -o s.json --title "Weekend" --silhouette j-sleeve --size L --fit relaxed --stitch seed --yarn "Moss=#5B6B3A"
pnpm --silent studio -- sweater set s.json --measure length=70 --gauge 24,38 --gauge-source measured   # one undoable change
pnpm --silent studio -- sweater plan s.json      # pieces as pattern steps (shaping rhythm); measurements wanted vs knitted; shape points
pnpm --silent studio -- sweater shape s.json --body "64,0 54,24 58,41,underarm 58,62"   # hand-shape the body
pnpm --silent studio -- sweater check s.json     # every piece compiled and checked; exit 0 only when ready
pnpm --silent studio -- sweater package s.json -o s-package/   # every .kc/.k, instructions.md, schematic.svg, manifest
```

Quote `plan`'s knitted measurements; never compute counts. A crew neck
needs the same yarn on a second carrier (C4 by default) — say so. Readiness
blocks on assumed gauges (body and rib) until measured. The shaping (fashioned
transfers, chain bind-offs, the split neck) follows Kniterate's own sweater
programs but has no captured reference parity and has never been knitted:
say that a first sweater is a development knit. Raglan, V-neck, colorwork on
sweater pieces and stripes are not built yet.

Not supported yet: raglan and V-neck sweaters, colorwork on sweaters, seamless tubes, and float
catching or any beanie body backing other than fairisle and full birdseye (another backing is
refused with `project-beanie-backing-unsupported`). Say so and offer the
nearest supported thing instead of approximating.

## Rules

1. **Never compute stitch or row counts yourself.** Record gauge and target
   (`set-gauge`, `set-target`) and read `plan`. Apply the edits a finding
   offers in `fixes`; they are checked to clear the finding.
2. **Sizing needs a gauge.** If the request gives no gauge, ask for it (stitches
   and rows per 10 cm, measured on a swatch in the same yarn and fabric), or
   record it with `"source": "assumed"` and say plainly that the size is
   unverified. An assumed gauge keeps the project not ready.
3. **Only `readiness` decides "ready".** Say a project is ready only when
   `readiness.ready` is `true`. Otherwise report each blocker. Do not describe
   Surface-proven as physically proven; Knit-proven needs a registered
   physical run.
4. **Never edit `.k` or `.kc` files.** Change the project; export again.
5. **Look before claiming placement or proportions**: `render --view chart`
   draws the design at knitted proportions when a gauge is recorded. Open the
   PNG and check it.
6. Keep carrier numbers out of yarn names (the carrier is its own field).

## Workflow

```bash
# 1. Start: from a blank chart, a ColorworkChartV1 file, or an image
pnpm --silent studio -- new --width 60 --height 100 --palette "Oat=#E8DFCF,Rust=#B5532E" --title "Scarf" -o p.json
pnpm --silent studio -- image logo.png --height-cm 8 --gauge 26,34 --colors 2 -o motif.json   # then: new motif.json -o p.json

# 2. Record gauge and requested size (both undoable edits)
pnpm --silent studio -- edit p.json '[{"kind":"set-gauge","gauge":{"stitchesPer10cm":26,"rowsPer10cm":34,"source":"measured"}},
                                      {"kind":"set-target","target":{"widthCm":25,"heightCm":180}}]'

# 3. Read the plan; apply offered fixes (resize to the derived counts)
pnpm --silent studio -- plan p.json
pnpm --silent studio -- plan p.json | jq '[.findings[].fixes[].edits[]]' > fixes.json && pnpm --silent studio -- edit p.json fixes.json

# 4. Design: paint cells (row ids from `show`; cells are listed top row first)
pnpm --silent studio -- show p.json
pnpm --silent studio -- edit p.json '{"kind":"paint-cells","cells":[{"rowId":"row_0001","column":0,"paletteIndex":1}]}'

# 5. Check, look, export
pnpm --silent studio -- describe p.json          # one-screen summary + readiness
pnpm --silent studio -- render p.json --view chart -o chart.png
pnpm --silent studio -- export p.json -o command.kc
```

For many cells, generate the edit JSON with a short script (a stripe or a
repeat) rather than writing it by hand. `schema` prints every edit kind.

## Reporting back

Give: size in stitches × rows and predicted cm (with the gauge used and its
source), yarns → carriers, backing, verdict, readiness (and each blocker),
operator checks, estimated knit time, and the exported file path. If the
gauge was assumed or a request was out of scope, say so first.
