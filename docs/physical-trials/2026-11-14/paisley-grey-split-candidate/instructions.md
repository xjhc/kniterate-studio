# Paisley with grey making every increase

`program.kc`: 510 passes, 619,370 bytes, SHA-256 `2c85e52672cc19100a882c1f2feaf8d7cf3b83bf471fa00c010dd54589709aac`.
**Not knitted.** The checks below are software checks.

This is the 514-pass split paisley that knitted on 14 November (`2868d508…aa1d`), with one change to the increases. It answers the operator's request to keep grey stitches on the grey face.

## The one change

In the 514-pass file, the yarn that happened to be on the left made each increase, so grey made 7 increases and orange made 6. An orange increase knits orange in the two edge columns of the grey face.

Here C4 grey makes all 13 increases. The increase needs grey on the left when it starts. The yarns swap sides on every plain row and end an increase where they began, so the increases now start two rows apart, then four, in place of three every time. The average is still three rows.

| | 514-pass file | This file |
|---|---|---|
| Increase rows (first of two) | 4, 7, 10, 13, … 40 | 4, 6, 10, 12, 16, 18, … 34, 36, 40 |
| Splitting yarn | grey 7, orange 6 | grey 13 |
| Orange stitches on the grey face, two edge columns, rows 1–42 | 32 | 20 |
| Of those, in increase rows | 25 | 13 |

Each increase still leaves one orange stitch on the grey face, in the outer column of its second row, and one grey stitch on the orange face. That stitch is the edge join; the straight parts of the edge have the same stitch on every other row.

Rows 6, 12, 18, 24, 30 and 36 are one stitch wider than in the 514-pass file. Every other row has the same width.

## What is the same

- Passes 1–133 (start, first rows, first increase) and the last 203 passes (all 13 decreases, top waste) are identical to the 514-pass file. Only passes 134–307 differ.
- 8 → 21 → 8 columns, 81 rows, fixed left edge, the same paisley cells.
- Each increase is the same two-row sequence, both splits on the front bed at rack 0.
- Yarn and settings: C3 orange and C4 grey single 2/14 acrylic, C1 draw, C6 waste. Body stitch 7, speed 200, roller 450; first body row 100/100. They are in the file.

## Checks

- Strict KCode parse, machine validator, machine-safety envelope and schedule comparison pass. No float advisories.
- Loop replay: no body stitch is knitted on an empty needle; one loop per bed per column after every row, apart from the one rear needle held empty between the two rows of an increase.
- Every split is made by C4, through one existing loop, and the rear needle receives that loop.
- Eight tests pass in `scripts/experiments/paisley-split-swatch.test.ts`. The 514-pass file still rebuilds byte for byte.
- `studio audit` reports four idle-feeder moves. They are the C6 and C1 parking passes 111–114, and the audit reports the same four for the 514-pass file and for the 12 November paisley, both of which knitted.

## What to record

1. Both faces, and a close-up of the widening edge on each face.
2. Whether the increases two rows apart (for example rows 4 and 6, passes 121–145) look different from the ones after a four-row gap.
3. The pass number of any dropped waste stitch during the start. Waste dropped twice in the last paisley run while orange and grey were being introduced (around passes 81–110), and no pass number was noted.
4. Any stop, repair or setting change, with its pass number.

## Events

| Design row | Event | Width | Passes | Split pass |
|---|---|---:|---|---|
| 4 | growth | 9 | 121–126 | 125 |
| 5 | completion | 9 | 127–133 | 130 |
| 6 | growth | 10 | 134–138 | 137 |
| 7 | completion | 10 | 139–145 | 142 |
| 10 | growth | 11 | 150–154 | 153 |
| 11 | completion | 11 | 155–161 | 158 |
| 12 | growth | 12 | 162–166 | 165 |
| 13 | completion | 12 | 167–173 | 170 |
| 16 | growth | 13 | 178–184 | 183 |
| 17 | completion | 13 | 185–191 | 188 |
| 18 | growth | 14 | 192–198 | 197 |
| 19 | completion | 14 | 199–205 | 202 |
| 22 | growth | 15 | 210–216 | 215 |
| 23 | completion | 15 | 217–223 | 220 |
| 24 | growth | 16 | 224–230 | 229 |
| 25 | completion | 16 | 231–237 | 234 |
| 28 | growth | 17 | 242–246 | 245 |
| 29 | completion | 17 | 247–253 | 250 |
| 30 | growth | 18 | 254–260 | 259 |
| 31 | completion | 18 | 261–267 | 264 |
| 34 | growth | 19 | 272–278 | 277 |
| 35 | completion | 19 | 279–285 | 282 |
| 36 | growth | 20 | 286–292 | 291 |
| 37 | completion | 20 | 293–299 | 296 |
| 40 | growth | 21 | 304–310 | 309 |
| 41 | completion | 21 | 311–317 | 314 |
| 43 | decrease | 20 | 320–327 | — |
| 46 | decrease | 19 | 332–339 | — |
| 49 | decrease | 18 | 344–351 | — |
| 52 | decrease | 17 | 356–363 | — |
| 55 | decrease | 16 | 368–375 | — |
| 58 | decrease | 15 | 380–387 | — |
| 61 | decrease | 14 | 392–399 | — |
| 64 | decrease | 13 | 404–411 | — |
| 67 | decrease | 12 | 416–423 | — |
| 70 | decrease | 11 | 428–435 | — |
| 73 | decrease | 10 | 440–447 | — |
| 76 | decrease | 9 | 452–459 | — |
| 79 | decrease | 8 | 464–471 | — |

Rebuild: `node --import tsx scripts/experiments/paisley-split-swatch.ts <folder> grey`. Test: `node --import tsx --test scripts/experiments/paisley-split-swatch.test.ts`.
