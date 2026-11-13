# Edge swatch — full-needle reference cast-on

Candidate: `program.kc`, 268 passes, SHA-256 `2c5ef66ef99610d933f9fbdf7998d6dad242e67402ad06ba61201684ee72a8ac`.
A development trial, checked by software only. It has not been knitted.

One small piece of plain jersey, 46 rows. It casts on 40 stitches on needles 101–140, narrows to 32, widens to 44 (needles 99–142) and narrows to 36. Both edges do the same thing in the same row.

## Yarns

- C3: main yarn, one colour. Same yarn and settings as the first increase swatch.
- C6: waste yarn. C1: draw thread. Both stay parked on the left after the start.

## What each part tests

1. **First narrowing (passes 117–171).** The edge has fabric under it. Decreases 1 and 2 move one loop per carriage pass; decreases 3 and 4 move the three edge stitches together, as the first swatch did.
2. **Widening (passes 177–188).** Each widening row brings one new needle into work at each edge. The edge where the row starts knits its new needle first; the other edge knits it last, as the first swatch did. Half the rows start from each side.
3. **Second narrowing (passes 193–247).** The same four decreases as part 1, but straight after a widening, so the edge hangs past the fabric below it. This repeats the first swatch's conditions.

## Every event

| Part | Step | Row | Passes | What happens | Left edge | Right edge |
|---|---|---|---|---|---|---|
| 1 | 1 | 7 | 117–133 | decrease, one loop per pass (16 transfer passes), then knit at 133 | one loop per pass | one loop per pass |
| 1 | 2 | 9 | 135–151 | decrease, one loop per pass (16 transfer passes), then knit at 151 | one loop per pass | one loop per pass |
| 1 | 3 | 11 | 153–161 | decrease, three stitches together (8 transfer passes), then knit at 161 | three stitches together | three stitches together |
| 1 | 4 | 13 | 163–171 | decrease, three stitches together (8 transfer passes), then knit at 171 | three stitches together | three stitches together |
| 2 | 1 | 19 | 177 | new needle at each edge, knitted left to right | new needle knitted first | new needle knitted last |
| 2 | 2 | 21 | 179 | new needle at each edge, knitted left to right | new needle knitted first | new needle knitted last |
| 2 | 3 | 23 | 181 | new needle at each edge, knitted left to right | new needle knitted first | new needle knitted last |
| 2 | 4 | 26 | 184 | new needle at each edge, knitted right to left | new needle knitted last | new needle knitted first |
| 2 | 5 | 28 | 186 | new needle at each edge, knitted right to left | new needle knitted last | new needle knitted first |
| 2 | 6 | 30 | 188 | new needle at each edge, knitted right to left | new needle knitted last | new needle knitted first |
| 3 | 1 | 35 | 193–209 | decrease, one loop per pass (16 transfer passes), then knit at 209 | one loop per pass | one loop per pass |
| 3 | 2 | 37 | 211–227 | decrease, one loop per pass (16 transfer passes), then knit at 227 | one loop per pass | one loop per pass |
| 3 | 3 | 39 | 229–237 | decrease, three stitches together (8 transfer passes), then knit at 237 | three stitches together | three stitches together |
| 3 | 4 | 41 | 239–247 | decrease, three stitches together (8 transfer passes), then knit at 247 | three stitches together | three stitches together |

## What to record

Three facts for anything that goes wrong, because "bad" cannot be told apart afterwards:

1. The pass number on the screen (the table above says which event that is).
2. Which edge, and whether the loop stayed on its needle, fell off, or was on the wrong needle.
3. For a decrease: whether it went wrong as the stitch crossed to the rear bed or as it came back to the front.

If it can run to the end without harm, let it: later events are still worth seeing after an early fault. Stop if loops pile up or a needle is at risk.

Afterwards: a photo of each face flat, and a close-up of each edge. Mark part 1, 2 and 3 on the photo if they are not obvious (the piece has a waist, then a wide part).

The top ends on waste yarn; the stitches under it are live.

## Cast-on verification and limitations

Compared against Kniterate single-bed `swatch.kc`: new passes 106/107/108/111 match reference knitting passes 98/99/100/103; transfer passes 109–110 match 101–102. Width reduced 80→40, placement normalized, body C5 mapped to C3. Every selected needle/bed, stitch selector, direction, rack, speed and roller value matches under those mappings. There are three cast-on knitting passes, two transfers, then the fourth knitting pass (first jersey row).

Full-bed waste support is retained until rear waste is dropped; draw thread knits the full front width. C6 is parked left of the widest piece. First jersey row uses reference speed 300/stitch 6; subsequent body rows restore speed 200/stitch 9. All remaining 141 body passes match the prior file. No shaping changes.

Strict machine validator and machine-safety envelope pass; loop audit passes. No C1/C6 moves in the body. One non-blocking float-distance advisory for C6 returning to top waste (33 needles between its last initial stitch and first top stitch). KCode cannot establish whether yarn was cut; this file keeps the carrier active. Physical performance remains unproven.

Do not use event numbers from the old 274-pass file: the numbers above are for this 268-pass revision. No bind-off test; top loops are live under the waste.
