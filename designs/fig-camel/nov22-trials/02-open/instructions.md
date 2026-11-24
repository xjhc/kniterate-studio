# Paisley with the widening edge left open

`program.kc`: 484 passes, 587,728 bytes, SHA-256 `a27ac85c234491cc801e628dc71eb6409a6441c9f72d031aaf4db1a2228941ac`.
**Not knitted.** The checks below are software checks.

This is the hedge for the widening edge. The first choice is still the joined edge (the 510-pass file, `2c85e526…9aac`). If that edge cannot be made clean on the machine, this one leaves the two faces unjoined along the widening edge so they can be linked afterwards.

## What is different from the 510-pass file

One thing: through row 42 no yarn crosses between the beds at the right edge.

- Grey knits only front needles there and orange only rear needles, so both edge columns of the grey face are grey on every row, and both edge columns of the orange face are orange.
- Each increase is two passes shorter. The extra grey pass on the rear bed and its return are gone.
- The second split of each increase now has a knitted needle outside it, as in Kniterate's own split increases. The first split is still on the outermost needle.

The edge is not fully open. At each increase the two splits each leave one loop that both faces knit through, so the faces are tied together at two points per increase and free in between.

## What is the same

- Grey makes all 13 increases, starting on rows 4, 6, 10, 12, … 36, 40, with the same widths and paisley cells as the 510-pass file.
- Passes 1–116 are identical to the 514-pass file that knitted on 14 November, and the last 193 passes (row 42 on: all 13 decreases and the top waste) are identical to it too.
- The narrowing edge keeps its join, as knitted. So this piece has an open widening edge and a joined narrowing edge.
- The left edge stays joined.
- Yarn and settings: C3 orange and C4 grey single 2/14 acrylic, C1 draw, C6 waste. Body stitch 7, speed 200, roller 450; first body row 100/100. They are in the file.

## Checks

- Strict KCode parse, machine validator, machine-safety envelope and schedule comparison pass. No float advisories.
- Loop replay: no body stitch is knitted on an empty needle; one loop per bed per column after every row, apart from the one rear needle held empty between the two rows of an increase.
- No yarn crosses beds at the right edge in rows 1–42; the left edge is joined at least every four rows.
- Eleven tests pass in `scripts/experiments/paisley-split-swatch.test.ts`. The 514-pass and 510-pass files still rebuild byte for byte.
- `studio audit` reports the same four parking moves (passes 111–114) as for the knitted paisleys.

## What to record

1. Both faces, and a close-up of the widening edge on each.
2. Whether the open edge curls, gapes or has loose edge loops, and whether it looks linkable.
3. How the open widening edge compares with the joined narrowing edge on the same piece.
4. The pass number of any dropped waste stitch during the start, and any stop, repair or setting change.

## Events

| Design row | Event | Width | Passes | Split pass |
|---|---|---:|---|---|
| 4 | growth | 9 | 121–126 | 125 |
| 5 | completion | 9 | 127–131 | 128 |
| 6 | growth | 10 | 132–136 | 135 |
| 7 | completion | 10 | 137–141 | 138 |
| 10 | growth | 11 | 146–150 | 149 |
| 11 | completion | 11 | 151–155 | 152 |
| 12 | growth | 12 | 156–160 | 159 |
| 13 | completion | 12 | 161–165 | 162 |
| 16 | growth | 13 | 170–176 | 175 |
| 17 | completion | 13 | 177–181 | 178 |
| 18 | growth | 14 | 182–188 | 187 |
| 19 | completion | 14 | 189–193 | 190 |
| 22 | growth | 15 | 198–204 | 203 |
| 23 | completion | 15 | 205–209 | 206 |
| 24 | growth | 16 | 210–216 | 215 |
| 25 | completion | 16 | 217–221 | 218 |
| 28 | growth | 17 | 226–230 | 229 |
| 29 | completion | 17 | 231–235 | 232 |
| 30 | growth | 18 | 236–242 | 241 |
| 31 | completion | 18 | 243–247 | 244 |
| 34 | growth | 19 | 252–258 | 257 |
| 35 | completion | 19 | 259–263 | 260 |
| 36 | growth | 20 | 264–270 | 269 |
| 37 | completion | 20 | 271–275 | 272 |
| 40 | growth | 21 | 280–286 | 285 |
| 41 | completion | 21 | 287–291 | 288 |
| 43 | decrease | 20 | 294–301 | — |
| 46 | decrease | 19 | 306–313 | — |
| 49 | decrease | 18 | 318–325 | — |
| 52 | decrease | 17 | 330–337 | — |
| 55 | decrease | 16 | 342–349 | — |
| 58 | decrease | 15 | 354–361 | — |
| 61 | decrease | 14 | 366–373 | — |
| 64 | decrease | 13 | 378–385 | — |
| 67 | decrease | 12 | 390–397 | — |
| 70 | decrease | 11 | 402–409 | — |
| 73 | decrease | 10 | 414–421 | — |
| 76 | decrease | 9 | 426–433 | — |
| 79 | decrease | 8 | 438–445 | — |

Rebuild: `node --import tsx scripts/experiments/paisley-split-swatch.ts <folder> open`. Test: `node --import tsx --test scripts/experiments/paisley-split-swatch.test.ts`.
