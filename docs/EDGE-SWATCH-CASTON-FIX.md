# Edge experiment: single-bed reference cast-on

User observed the alternating front-bed pickup at the bottom of the strip and requested exact agreement with Kniterate's single-colour/single-bed cast-on. The comparator is `reference/swatch.kc`, NOT fairisle. Its body is C5 and cast-on C3; the test uses C3 throughout.

Implemented in a scoped experiment builder, `scripts/experiments/edge-swatch-full-caston.ts`, using a SHA-pinned, unchanged copy of the partner's supplied source (`fixtures/experiments/edge-swatch-original.k`, gist fec49e102df7953e43492dace738f826). The partner's generator commit 5fe1661 is not available from origin, so no claim is made to have modified it. The builder parses source into the existing IR, replaces the waste-to-jersey transition and compiles via the canonical emitter/converter; no generated machine file was hand-edited. Production Studio emitters/UI are unchanged.

## Exact comparison

Four *knitting* passes are new 106,107,108,111 versus reference 98,99,100,103. Two transfers intervene: new 109–110 versus reference 101–102. All selected needle/bed actions, stitch selectors (including transfer stitch 3), rack, direction, speed and roller match after width 80→40, placement normalization and reference body C5→C3. Stop distances and whole-file bytes are not claimed identical.

- Zigzag: full front and rear, rack +0.5, speed 200, roller 400, stitch 4.
- Front then rear row: rack 0, speed 200, roller 400, stitch 5.
- Rear→front transfers: two parity passes, speed 100, roller 0, transfer stitch 3.
- First jersey row: speed 300, roller 450, stitch 6.
- Remaining body: original speed 200/stitch 9, 141 passes unchanged against the original edge trial, including all shaping. Original suffix IR preserved (2271 operations).

The waste is no longer consolidated into alternating-bed 1x1 before cast-on. Full rear waste is dropped, full front draw is knitted, and C6 parks left of the full shape. This maintains support for the different cast-on. Finish stitch actions are unchanged; its first positioning pass now picks up C6 instead of being an empty carriage return. This is a consequence of left parking, not a new knit row.

## Validation and output

Reproduce from repository root:

```
node --import tsx scripts/experiments/edge-swatch-full-caston.ts ../edge-full-caston-swatch
node --import tsx scripts/experiments/verify-edge-full-caston.ts ../edge-full-caston-swatch
node --import tsx scripts/check-machine-file.ts ../edge-full-caston-swatch/program.kc --json
node --import tsx scripts/studio.ts audit ../edge-full-caston-swatch/program.kc
```

Regression checks reject the original cast-on against the reference, accept all six corrected passes, compare every remaining body pass, and require zero C1/C6 body passes. Machine-safety envelope/validator and loop audit pass. Saved reference evidence: `docs/research/edge-full-caston-validation.json`.

Candidate: **268 passes**, 325360 bytes, SHA-256 **2c5ef66ef99610d933f9fbdf7998d6dad242e67402ad06ba61201684ee72a8ac**. Local candidate and updated event table: `../edge-full-caston-swatch/`.

One informational float-distance advisory remains: C6 travels 33 needles between its last initial waste stitch and its first top-waste stitch. It is parked for the intervening body. The encoded checks pass, but software does not validate the physical yarn span or take-down. No physical success claim. Not copied to SD by this change.

Event pass numbers shift by −6 from the partner's file: first narrowing 117–171, widening 177–188, second narrowing 193–247. The earlier cast-on should not be asserted to have caused the later shaping failure. This change addresses the observed bottom-edge structure only.
