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

Beanies: one construction, `pnpm --silent studio -- beanie`. It is a flat
2×2 rib beanie seamed afterwards, in Customist's construction:
- Size it with `--head-cm`, optional `--ease` (default −0.10) and `--gauge`
  measured on 2×2 rib, which sets the width. Set the body length with
  `--body-cm` or `--rib-rows`.
- It writes the program and finishing instructions. Read the `needles.how`
  derivation and `predicted` back to the person.
- At 194 needles it is Kniterate's own reference hat. Other widths use our
  eight-line crown, which nobody has knitted yet; say so.
- Beanies are generated outside the project pipeline, so readiness is not
  computed for them. Never call a beanie "ready": report its verdict and
  predicted size, and treat a missing rib gauge as a reason to ask.

Not supported yet: motifs on beanies, a knitted-in fold-up cuff (folding the
rib brim is fine), sweaters, other shaping, and seamless tubes. Say so and offer the nearest supported thing instead of
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
