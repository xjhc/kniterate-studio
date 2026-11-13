# Split-increase swatch — observation package

Candidate: `program.kc`, 230 passes, 278708 bytes, SHA-256 `fb2cb6adcfb4320992dcec26e8b80e0cbdcb905b4d25548780f20b04b5c24de5`.
Software checks below apply to these bytes. This exact file has not been knitted. Operator handoff needs the reviewed candidate and confirmation of the trial yarn; no machine run is claimed.

One piece of plain jersey: 43 body rows, starting at 40 stitches and widening to 52. No decreases.

## Cast-on and yarn

The full-needle cast-on follows the operator’s successful 2026-11-12 edge trial (268 passes, SHA-256 2c5ef66ef99610d933f9fbdf7998d6dad242e67402ad06ba61201684ee72a8ac). Its construction and settings are retained. Idle carriers park farther left to clear this swatch’s wider outline. The combined split swatch still needs its own review and knit.
C3: use the same main yarn as the successful orange edge swatch. Its yarn specification was not recorded; confirm the actual cone with the operator. Body settings are speed 200, roller 450, stitch 9, as encoded in that trial.
C6: the same waste yarn. C1: the same draw thread. Both stay parked through the body. The top is waste yarn; stitches below it remain live.

## What this tests

A split knits a new front loop through an existing loop and moves the old loop to the rear. Transfers then move the edge outward. Software replay finds no empty-needle starts in the body; the knit must establish whether each loop is caught and the edge is clean.
Both-edge increases use right-to-left split rows only. Left-to-right split rows test one edge at a time, because simultaneous left-to-right splits have no captured reference.

1. **Simple, both edges (passes 116–137).** 2 event(s); split right to left, 1 stitch(es) inward from each tested edge.
2. **Simple, left edge (passes 141–146).** 1 event(s); split left to right, 1 stitch(es) inward from each tested edge.
3. **Simple, right edge (passes 149–156).** 1 event(s); split left to right, 1 stitch(es) inward from each tested edge.
4. **Fashioned, both edges (passes 160–189).** 2 event(s); split right to left, 4 stitch(es) inward from each tested edge.
5. **Fashioned, left edge (passes 193–198).** 1 event(s); split left to right, 4 stitch(es) inward from each tested edge.
6. **Fashioned, right edge (passes 201–208).** 1 event(s); split left to right, 4 stitch(es) inward from each tested edge.

## Every increase

| Part | Style | Step | Edge | Split direction | Split pass | Transfer passes | First wider row |
|---|---|---|---|---|---|---|---|
| 1 | Simple | 1 | left | << | 116 | 117, 118, 121, 122, 123, 124 | 125 |
| 1 | Simple | 1 | right | << | 116 | 117, 118, 121, 122, 123, 124 | 125 |
| 1 | Simple | 2 | left | << | 128 | 129, 130, 133, 134, 135, 136 | 137 |
| 1 | Simple | 2 | right | << | 128 | 129, 130, 133, 134, 135, 136 | 137 |
| 2 | Simple | 1 | left | >> | 141 | 142, 143, 144 | 146 |
| 3 | Simple | 1 | right | >> | 149 | 150, 154, 155 | 156 |
| 4 | Fashioned | 1 | left | << | 160 | 161, 162, 163, 164, 167, 168, 169, 170, 171 | 173 |
| 4 | Fashioned | 1 | right | << | 160 | 161, 162, 163, 164, 167, 168, 169, 170, 171 | 173 |
| 4 | Fashioned | 2 | left | << | 176 | 177, 178, 179, 180, 183, 184, 185, 186, 187 | 189 |
| 4 | Fashioned | 2 | right | << | 176 | 177, 178, 179, 180, 183, 184, 185, 186, 187 | 189 |
| 5 | Fashioned | 1 | left | >> | 193 | 194, 195, 196, 197 | 198 |
| 6 | Fashioned | 1 | right | >> | 201 | 202, 203, 206, 207 | 208 |

Paired entries with the same split pass are one simultaneous increase at both edges. Their transfer lists cover the whole event, left edge before right edge. Pass numbers are 1-based, as on the controller.

## What to record

Fill `observations.md` for this exact candidate. Blank or unknown observations do not count as success. Label left and right as viewed facing the machine and keep those labels when photographing the reverse face.

For each fault record these three facts:
1. The pass number shown on the controller.
2. The left or right edge.
3. Whether the loop stayed, dropped, or sat on the wrong needle; note the bed if visible.

If the first split is refused or behaves unexpectedly, stop and record the pass. Stop for piled loops or a needle at risk. Record any stops, interventions and setting changes.
Photograph both faces and each widening edge. Mark the affected part and pass. Compare Simple with Fashioned for holes, loose loops and edge appearance.

## Waste-yarn return advisory

- C6: 51 needles between passes 100 and 216. C6 returns for top waste after remaining parked during the body. Observe its strand and first pickup for snagging, pulling or failure to catch. This is not an increase in the orange C3 body.
The advisory is non-blocking software evidence, not a finding that the carry is harmless. Record what the machine actually does; no cutting or rethreading change is prescribed here.

## Software checks

- Strict KCode validator and machine-safety envelope: passed.
- Loop audit: passed (start-hold 6/12 ok, waste-through-body-loops 0/0 ok, unsupported-body-drops 0/0 ok, loops-left 0/1 ok, max-stack 2/3 ok, idle-feeder-moves 0/0 ok, movement-per-knit 0.37/1.5 ok, paired-empty-knits 0/0 ok, inside-empty-front-knits 0 ok).
- Body work: 43 knitting, 44 transfer, 16 movement-only passes.
- The engine’s 13 capture comparisons cover these forms. Transfer roller stays 0; some Customist returns use 50. No controller acceptance or physical split-knit result is established.
