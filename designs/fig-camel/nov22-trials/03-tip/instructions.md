# Tip swatch: start and end on two columns

`program.kc`: 378 passes, 458,343 bytes, SHA-256 `3ea65875e829afc7b406a6a12d3270cc33e16c6f498af6c921dab04ef357b5c1`.
**Not knitted.** The checks below are software checks.

The triangle in #21 starts and ends at a point. This swatch asks whether the reversible fabric can start on two columns, widen, narrow and end on two columns. It is a small piece: 2 → 8 → 2 columns over 42 rows.

## How it is built

1. **Start (passes 1–114).** The 8-column start of the paisleys, unchanged.
2. **Starter (passes 115–167).** Orange and grey reversible fabric, 21 rows, narrowing from 8 columns to 2 with the same decrease the paisleys use. This part is thrown away. It is there so the rollers always have fabric to pull, and so every column ends in a decrease.
3. **Neck (passes 168–174).** The draw thread (C1) knits one round on the four needles: front in pass 169, rear in pass 170. Orange then casts on over it the way every piece starts: a zigzag row (172), a front row (173) and a rear row (174).
4. **Piece (passes 175–349).** Three rows on 2 columns, then six increases to 8 columns, four rows, six decreases back to 2, and three rows. The increases and decreases are the ones in the 514-pass paisley that knitted on 14 November.
5. **Top (passes 350–369).** Eight rounds of waste on the 2 columns, then the loops are released.

Passes 1–120 are identical to the 514-pass paisley.

## What is new

- Knitting on fewer than 8 columns, down to 2 (four needles).
- The draw thread coming back in the middle of a piece. It has been parked five needles left of the fabric since pass 114.
- The cast-on over 2 columns.
- The top waste over 2 columns.
- An increase when the fabric is only 2 columns wide (first one: passes 181–193).

## Yarn and settings

C3 orange and C4 grey single 2/14 acrylic, C1 draw thread, C6 waste, as for the paisleys. Body stitch 7, speed 200, roller 450. They are in the file.

## After knitting

1. Find the draw thread at the neck, between the starter and the piece. Cut it close to the neck and pull the round out.
2. One orange and one grey strand still run from the starter into the piece. Cut each, leaving a tail on the piece.
3. At the top, take the waste off and run a yarn tail through the four open loops.

## What to record

1. The pass number of anything that goes wrong, and which needle. The narrow part is passes 153–200 and 326–369.
2. Whether the draw thread caught on all four needles (passes 169–170).
3. Whether the cast-on at the neck (172–174) held, and what the bottom point looks like once the starter is off.
4. Whether the fabric stayed down on the needles while it was 2 or 3 columns wide, or rode up.
5. A photo of each face, and close-ups of both points.
6. The pass number of any dropped waste stitch during the start, and any stop, repair or setting change.

## Checks

- Strict KCode parse, machine validator, machine-safety envelope and schedule comparison pass. No float advisories.
- Loop replay: no stitch in the starter, neck or piece is knitted on an empty needle. One loop per bed per column after every row, apart from the one rear needle held empty between the two rows of an increase. No needle holds more than two loops.
- The neck holds a loop on each of its four needles after every pass.
- Four tests pass in `scripts/experiments/tip-swatch.test.ts`. `studio audit` passes.

## Events

| Part | Row | Event | Width after | Passes | Split pass |
|---|---|---|---:|---|---|
| Starter | 4 | decrease | 7 | 121–124 | — |
| Starter | 7 | decrease | 6 | 129–132 | — |
| Starter | 10 | decrease | 5 | 137–140 | — |
| Starter | 13 | decrease | 4 | 145–148 | — |
| Starter | 16 | decrease | 3 | 153–156 | — |
| Starter | 19 | decrease | 2 | 161–164 | — |
| Starter | 21 | one yarn only | 2 | 167 | — |
| Neck | — | draw thread round | 2 | 169–170 | — |
| Neck | — | cast-on | 2 | 172–174 | — |
| Piece | 4 | growth | 3 | 181–186 | 185 |
| Piece | 5 | completion | 3 | 187–193 | 190 |
| Piece | 7 | growth | 4 | 196–202 | 201 |
| Piece | 8 | completion | 4 | 203–209 | 206 |
| Piece | 10 | growth | 5 | 212–216 | 215 |
| Piece | 11 | completion | 5 | 217–223 | 220 |
| Piece | 13 | growth | 6 | 226–232 | 231 |
| Piece | 14 | completion | 6 | 233–239 | 236 |
| Piece | 16 | growth | 7 | 242–246 | 245 |
| Piece | 17 | completion | 7 | 247–253 | 250 |
| Piece | 19 | growth | 8 | 256–262 | 261 |
| Piece | 20 | completion | 8 | 263–269 | 266 |
| Piece | 25 | decrease | 7 | 278–285 | — |
| Piece | 28 | decrease | 6 | 290–297 | — |
| Piece | 31 | decrease | 5 | 302–309 | — |
| Piece | 34 | decrease | 4 | 314–321 | — |
| Piece | 37 | decrease | 3 | 326–333 | — |
| Piece | 40 | decrease | 2 | 338–345 | — |

The last starter row is knitted by one yarn only, so that both yarns stand on the right for the cast-on, as they do at the normal start.

Rebuild: `node --import tsx scripts/experiments/tip-swatch.ts <folder>`. Test: `node --import tsx --test scripts/experiments/tip-swatch.test.ts`.
