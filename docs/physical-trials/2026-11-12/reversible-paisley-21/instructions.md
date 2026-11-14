# Small–large–small paisley: 8 → 21 → 8

Current development candidate; software checked, not physically tested. Supersedes the 20-column trial. No SD copy performed.

## Setup

- C3: orange, one strand of the previous 2/14 acrylic.
- C4: grey, one strand of the previous 2/14 acrylic.
- C1: the existing draw thread. C6: the previous waste yarn, two strands of 2/30 acrylic.
- C2/C5 unused. Do not manually move carriers over the carriage.
- Source needles 119–126 at the start/end, 119–139 at maximum width. Left edge stays fixed.
- Main body: stitch 7, speed 200, roller 450, with first-row speed/roller 100/100. Transfers speed 100, roller 0, stitch 5. Same main-body settings as the reversible diamond.
- Full two-bed cast-on: 8 needle positions = 8 loops on each bed (16 live loops), NOT eight loops total. Full-width draw and zigzag/tubular start; retain rear loops. This deliberately does not include the single-bed rear-to-front collapse.
- 80 initial waste passes plus insertion/tubular setup; finish on eight tubular waste courses. No bind-off test. Secure live body stitches before removing top waste.


## Change and test scope

One additional right-edge increase and decrease: 13 of each. Left edge fixed. 81 design rows, still every three rows. Increase rows 4,7,…40; width21 on rows40–42; decrease rows43,46,…79; finish rows79–81 at width8. Same yarns, machine settings, joined-edge and borrowed-loop increase construction. 522 carriage passes.

Artwork is derived from the original paisley outer/inner curves, not the exact earlier stitch chart. It is rescaled and simplified. Small motifs moved away from the narrow tips; centre motif slightly narrowed (horizontal scale0.5→0.45) and moved three rows upward to the new centre. Every motif pixel checked to leave blank space between artwork and the joining area, including the two-column increase area. The visible contrast stitches at the edge are structural joins, not paisley touching the border.

Software checks: strict source/KCode, safety, loop audit, per-row counts, increase colour sequence, actual yarn-path joins and motif margin pass. Zero C1/C6 body passes; zero warnings/errors/float advisories. Physical loop capture, edge appearance and take-down remain to be tested. Record any stop/miss by screen pass and edge; photograph both faces. Do not remove top waste without securing live stitches.

## Event map

| Row | Event | Width | Transfer passes | Knitting passes |
|---|---|---|---|---|
| 4 | increase | 9 | [123] | [126, 127] |
| 7 | increase | 10 | [135] | [139, 143, 146] |
| 10 | increase | 11 | [153] | [156, 157] |
| 13 | increase | 12 | [165] | [169, 173, 176] |
| 16 | increase | 13 | [183] | [186, 187] |
| 19 | increase | 14 | [195] | [199, 203, 206] |
| 22 | increase | 15 | [213] | [216, 217] |
| 25 | increase | 16 | [225] | [229, 233, 236] |
| 28 | increase | 17 | [243] | [246, 247] |
| 31 | increase | 18 | [255] | [259, 263, 266] |
| 34 | increase | 19 | [273] | [276, 277] |
| 37 | increase | 20 | [285] | [289, 293, 296] |
| 40 | increase | 21 | [303] | [306, 307] |
| 43 | decrease | 20 | [314, 317] | [321, 322] |
| 46 | decrease | 19 | [329, 331] | [334, 335] |
| 49 | decrease | 18 | [342, 345] | [349, 350] |
| 52 | decrease | 17 | [357, 359] | [362, 363] |
| 55 | decrease | 16 | [370, 373] | [377, 378] |
| 58 | decrease | 15 | [385, 387] | [390, 391] |
| 61 | decrease | 14 | [398, 401] | [405, 406] |
| 64 | decrease | 13 | [413, 415] | [418, 419] |
| 67 | decrease | 12 | [426, 429] | [433, 434] |
| 70 | decrease | 11 | [441, 443] | [446, 447] |
| 73 | decrease | 10 | [454, 457] | [461, 462] |
| 76 | decrease | 9 | [469, 471] | [474, 475] |
| 79 | decrease | 8 | [482, 485] | [489, 490] |

SHA-256 `972789a80a34743a573f87e5a54e63289199c39a0525eaf188dea2595a153b0b`; 635356 bytes. Rebuild: `python3 scripts/experiments/draw-edge-paisley.py --wide21`, then `node --import tsx scripts/experiments/reversible-right-edge-swatch.ts ../reversible-paisley-21 --paisley --wide21`. Verify: `node --import tsx scripts/experiments/verify-reversible-right-edge.ts ../reversible-paisley-21`.
