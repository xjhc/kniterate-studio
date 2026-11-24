# Fig/Camel reversible cashmere scarf

The operator completed the first full-size knit on November 23, 2026. It ran from **1:25 to 5:16 p.m. Pacific**, an elapsed **3 h 51 min**, with two reported yarn feeder breaks. The earlier 1:07 attempt encountered a startup issue. [Run log](fig-camel-full-scarf/run-log.md)

## Current files

- [Studio project](Fig-Camel-141cm-9-Rows.kniterate-studio.json) for the 141 × 49 cm target. Open the file in Studio, or use `?design=fig-camel&fieldRows=9` for the editable design.
- [Full scarf command.kc](fig-camel-full-scarf/command.kc), [Knitout source](fig-camel-full-scarf/Fig-Camel-141cm-9-Rows.k) and [verification record](fig-camel-full-scarf/verification.json). The machine file is **4,384 passes**, SHA-256 `3c82521ea30c5c59c79798bd0ea5d8aa64c4d468ed2c94ff34a6f0fed425d254`.
- [Starting tie detail](previews/Fig-Camel-starting-tie-A.png) and [nine vs. eleven field rows](previews/Fig-Camel-11-and-9-row-comparison.png).

The scarf uses three-column tips, nine rows of small paisleys and a single sideways A beside the first border cross. The A spans six needles and eight courses, with a two-course crossbar. The operator preferred this placement to an isolated letter near the tip. Count 211 joined C4 increases and 211 decreases on the right edge. On each decrease the two outer loops transfer one needle inward to opposite beds. C3 knits the outer front stitch on the decrease course and C4 knits it on the next course. The left edge stays fixed.

## Machine and yarn

| Setting | Full-size run |
| --- | --- |
| Feeders | C1 draw, C3 Camel, C4 Fig, C6 waste |
| Body yarn | One end of 3/28 cashmere per colour, 1,360 m per 150 g |
| Body settings | Stitch size 6, ordinary knitting at 150 mm/s and roller 400. First three-stitch course at 100 mm/s and roller 100. Transfers at 100 mm/s and roller 0. |
| Measured gauge | 48 stitches across 11 cm and 30 courses over 5 cm, measured across the full size-6 section |
| Body chart | 846 courses, 3 → 214 → 3 columns. Planned one-based positions 20–22 at the tips and 20–233 at full width. |
| Turn | Widest pair at passes 3,070–3,083. Narrowing starts at 3,084. |

Planning estimates were approximately 154 g per colour, with 175 g per colour recommended on hand, and 2 h 18 min to 2 h 54 min before operator stops. Yarn consumption was scaled from the operator’s 10 g two-section cashmere sample. Actual yarn consumption and finished dimensions have yet to be reported.

## Swatches and verification

The [two-setting gauge swatch](cashmere-3-28-sizes-6-5/instructions.md) compared stitch sizes 6 and 5. The [knitted 398-pass A swatch](cashmere-triangle-A/c3-knitted-A/command.kc) is the decrease reference. Its SHA-256 begins `55797036` and it has a one-course crossbar. The [two-course crossbar revision](cashmere-triangle-A/c3-compact-A/command.kc) also has 398 passes, with SHA-256 beginning `1be99dcd`. The full scarf combines the preferred decrease with the thicker letter. Earlier chart revisions, previews, gauges and shaping comparisons are included alongside these files.

After installing the repository dependencies, run these commands from the repository root:

```sh
node --import tsx designs/fig-camel/cashmere-triangle-A/build.mjs --full-scarf
node --import tsx designs/fig-camel/cashmere-triangle-A/verify.mjs --full-scarf
```

The replay checks the exported stitches against all 846 chart courses, the carrier assignments, supported increases, paired decrease transfers, edge joins and final release. For this run the top-level SD file was read back, compared byte for byte with the full export and counted at 4,384 passes. An earlier swatch had been copied to a subfolder while the machine still loaded the previous file from the root.
