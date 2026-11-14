# Paisley reversible right-edge trial — 8 → 20 → 8

Paisley revision: the previous motif’s outer/inner curves are scaled into 20 columns, repeated every 25 rows and cropped to the active width. Dense inner decoration omitted at this scale. Front grey with orange motif; rear inverse. Construction overrides the boundary and old increase column. Adds colourwork to the edge trial, so faults now need their motif position recorded too. Exact startup, finish, row schedule, edge ownership and event passes match the plain candidate.

Software-checked development candidate; not physically tested. Built 2026-11-12.

## Setup

- C3: orange, one strand of the previous 2/14 acrylic.
- C4: grey, one strand of the previous 2/14 acrylic.
- C1: the existing draw thread. C6: the previous waste yarn, two strands of 2/30 acrylic.
- C2/C5 unused. Do not manually move carriers over the carriage.
- Source needles 119–126 at the start/end, 119–138 at maximum width. Left edge stays fixed.
- Main body: stitch 7, speed 200, roller 450, with first-row speed/roller 100/100. Transfers speed 100, roller 0, stitch 5. Same main-body settings as the reversible diamond.
- Full two-bed cast-on: 8 needle positions = 8 loops on each bed (16 live loops), NOT eight loops total. Full-width draw and zigzag/tubular start; retain rear loops. This deliberately does not include the single-bed rear-to-front collapse.
- 80 initial waste passes plus insertion/tubular setup; finish on eight tubular waste courses. No bind-off test. Secure live body stitches before removing top waste.

## Exactly what this tests

1. Whether an eight-column two-bed start takes down and retains all edge loops with this yarn.
2. Whether the reference-derived reversible increase avoids the loose/open-looking corner and colour bar seen on the diamond. Move the old rear C3 loop to the new front needle. On the next design row, C3 knits the new rear and old front; C4 knits the old rear and new front. Thus each yarn knits ONE empty rear needle, rather than one yarn spanning two neighbouring empty rear needles. This is a borrowed-edge-loop increase, NOT a split or a lifted-bar increase.
3. Whether both edges stay connected: left-edge yarn/bed ownership alternates; the right join is coordinated with the borrowed loop and temporarily swapped old edge column. Small contrasting edge stitches are intentional, not an aesthetic trim solution yet.
4. Whether the existing reversible paired cross-bed decrease stays clean after widening: move the outgoing front loop into the adjacent rear loop, then the outgoing rear into the adjacent front, and knit through both merged stacks. This is NOT the three-edge-stitch single-bed fashioned decrease from the last successful diagnostic.
5. Whether C1/C6 remain clear: they park to the left of the fixed left edge. Actual emitted body has zero C1/C6 passes. C3/C4 still need repositioning and shaping moves.

## Shape and schedule

75 design rows, each knitting both colours/beds. A design row is NOT a carriage pass.

- Rows 1–3: width 8.
- Increase one column on the right on rows 4, 7, …, 37: 8 → 20.
- Rows 37–39: three design rows at width 20.
- Decrease one column on the right on rows 40, 43, …, 73: 20 → 8.
- Rows 73–75: three design rows at width 8, then top waste.

The three-row interval means successive increases alternate direction. On one event the new C3 rear needle is knitted first, on the next it is knitted last. Record whether either direction misses a loop. The colour/bed selection matches the two local columns in official sleeves.kc passes 169/172/173; this is not a claim of identical full-pass directions, settings or garment construction.

## Evidence and limits

Strict source and KCode checks, machine-safety envelope, backend differential, loop audit and trial-specific checks pass. Zero warnings, errors or float advisories. At every completed body row the replay retains exactly two live loops per column. No empty-source transfers; each decrease merges two occupied single loops. Actual yarn paths cross beds near both edges. Software cannot prove latch capture, yarn tension, edge appearance or physical take-down on eight columns.

494 total carriage passes. Body passes 115–468 contain 156 knitting, 36 transfer and 162 movement-only passes (movement/knitting 1.038). These are not 75 or 150 carriage passes. No C1/C6 body moves.

This small swatch does not validate detailed paisley, a final scarf, an automatic decorative trim algorithm, a full-size taper or a 3–4-stitch tip. It isolates reversible edge construction first. Preparation used canonical frame/simulator/backend in an isolated experiment generator; the general Studio project/UI recipe is unchanged.

## Record the result

Check all eight starting columns, then the first two increases (opposite directions), maximum width, first decrease, and final eight columns. Record screen pass number, bed/edge and any missed loop, stop or manual intervention. Photograph both faces plus both edges; report whether the faces can separate at the sides. Measure relaxed body-only width at 20 columns and body height excluding ALL waste. If the machine clumps or loops drop, stop and record the pass rather than forcing completion.

## Event map (machine screen, one-based)

| Design row | Event | Width | Transfer passes | Knitting passes | C3 direction |
|---|---|---|---|---|---|
| 4 | increase | 9 | 123 | 126, 127 | - |
| 7 | increase | 10 | 135 | 139, 143, 146 | + |
| 10 | increase | 11 | 153 | 156, 157 | - |
| 13 | increase | 12 | 165 | 169, 173, 176 | + |
| 16 | increase | 13 | 183 | 186, 187 | - |
| 19 | increase | 14 | 195 | 199, 203, 206 | + |
| 22 | increase | 15 | 213 | 216, 217 | - |
| 25 | increase | 16 | 225 | 229, 233, 236 | + |
| 28 | increase | 17 | 243 | 246, 247 | - |
| 31 | increase | 18 | 255 | 259, 263, 266 | + |
| 34 | increase | 19 | 273 | 276, 277 | - |
| 37 | increase | 20 | 285 | 289, 293, 296 | + |
| 40 | decrease | 19 | 303, 304 | 306, 307 | - |
| 43 | decrease | 18 | 314, 317 | 321, 322 | + |
| 46 | decrease | 17 | 329, 331 | 334, 335 | - |
| 49 | decrease | 16 | 342, 345 | 349, 350 | + |
| 52 | decrease | 15 | 357, 359 | 362, 363 | - |
| 55 | decrease | 14 | 370, 373 | 377, 378 | + |
| 58 | decrease | 13 | 385, 387 | 390, 391 | - |
| 61 | decrease | 12 | 398, 401 | 405, 406 | + |
| 64 | decrease | 11 | 413, 415 | 418, 419 | - |
| 67 | decrease | 10 | 426, 429 | 433, 434 | + |
| 70 | decrease | 9 | 441, 443 | 446, 447 | - |
| 73 | decrease | 8 | 454, 457 | 461, 462 | + |

SHA-256 `88999800b1991e2c9f75ad6dbacfbbf404d81a33e25dd56dcb0c6e05fdf8a875`. File: `program.kc`, 601173 bytes. No SD card mounted during preparation; not copied.

Rebuild from studio-source: `node --import tsx scripts/experiments/reversible-right-edge-swatch.ts ../reversible-paisley-edge-swatch --paisley`; verify with `node --import tsx scripts/experiments/verify-reversible-right-edge.ts ../reversible-paisley-edge-swatch`.
