---
name: knit-design
description: Design a Kniterate machine-knitting project (scarf, blanket, rectangle panel, colorwork from an image) from a plain-language request, using the Kniterate Studio CLI. Use when someone asks to make, size, resize, or check something to knit on the Kniterate.
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
  above the cuff; `--fold` knits the cuff at twice its visible height. Put
  the motif in with `place hat.json motif.json [--x center] [--above-cuff rows]`,
  after `image logo.png --height-cm 8 --gauge <body gauge> --colors 2 -o motif.json`.
  Motif color 0 is left as the ground.

For both kinds:
- The target width is the finished circumference; the plan adds the seam
  stitches and keeps the rib symmetric. `plan`, `describe`, `readiness`,
  `render` and `export` work as for any project, and `export` also writes
  finishing instructions.
- Long floats behind a motif (over 7 stitches) are design warnings, so the
  hat is not ready. Say so, and suggest a bolder or more compact motif.
  Never claim ready around them.
- At 194 needles, the all-rib crown is Kniterate's own; it ends with one
  3-loop stack, so readiness reports a warning. Other widths use our
  eight-line crown, which has never been knitted; say so.

Not supported yet: sweaters, other shaping, seamless tubes, and float
catching or birdseye backing on beanie bodies. Say so and offer the nearest supported thing instead of
approximating.

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
