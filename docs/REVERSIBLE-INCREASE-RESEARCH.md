# Reversible increase research — 2026-11-11

Status: **research candidate; export blocked; not a machine recipe.** No production emitter, UI option, safety rule, existing swatch, or SD file was changed. This investigation responds to the operator's request to research and validate before another swatch, and preserve the findings on GitHub #18.

## Physical finding and correction to earlier advice

The completed 16–48–16 paisley diamond has open-looking increase marks, especially orange bars on the grey face. The operator finds decreases satisfactory. Repeated CLUMP-like stops during idle C1/C6 shuffling are a separate unresolved issue. The exact candidate was registered byte-for-byte as `2026-11-11-reversible-diamond-paisley` (SHA `7217462cfe9297bbffbbe82f78d683f6bde09292f0d979e007039beb5d9c9540`). It is development evidence, not a clean/Knit-proven run. Photos IMG_1185/1186 were inspected locally and not published.

Current increases transfer a rear edge loop diagonally to the new front column; both the vacated rear needle and the new rear needle subsequently knit empty. This is a lined-fabric borrow construction, not a loop-preserving increase on both faces. Turning off alternating-colour edge joins does not change it. Current decreases cross the two edge loops diagonally inward to occupied opposite-bed needles (two-loop stacks), then knit them together.

Earlier advice was too strong: split increases are not impossible on a reversible fabric, but the ordinary single-bed recipe cannot be pasted onto two occupied beds. More importantly, Studio already refuses split KCode because its controller encoding has no captured Kniterate reference. A converter accepting `split` is not permission to knit it. A fashioned border only relocates shaping; it does not supply missing loops.

## Sources and what they establish

- [Kniterate split stitch](https://support.kniterate.com/hc/en-us/articles/360012868178-Split-stitch): a split transfers an old loop and forms a new loop through it on the delivering needle. Establishes the physical primitive, not this two-bed sequence or its KCode.
- [Kniterate Increase Transfers](https://support.kniterate.com/hc/en-us/articles/39032141113757-Global-Local-commands#h_01M252RSBE45PEEWBQGNSZJ5AS): Simple/Fashioned use splits for single-bed fabric; reversible is explicitly unimplemented. Does not establish a validated reversible recipe.
- [STOLL double-jersey widening modules](https://software.stoll.com/m1plus/m1plusknowledgebase/en-US/8252147979.html): documents closing-stitch/kick-back and tubular widening module families. Supports investigating double-bed-specific constructions, but hardware and hidden module steps cannot be transplanted to Kniterate.
- Local official reference corpus: `sleeves.kc` is reversible and increases, but is the source of the borrow-style family already used. Machine-profile/safety documentation and corpus tests record no split-bearing reference. No public source located in this investigation supplies a complete, machine-proven two-colour reversible Kniterate split sequence.

## Derived candidate: right edge, two temporary outside needles

This is our derivation from the documented split primitive, NOT an official Kniterate recipe. All coordinates below are abstract knitout coordinates, not verified machine labels. Let the last occupied column be n, with front loop A and rear loop B. Columns n+1 and n+2 are empty. At rack r, front f equals rear b+r in the pinned converter.

| Step | Rack | Operation | Loop result |
| --- | ---: | --- | --- |
| 1 | −1 | Split leftward f(n) → b(n+1), front-face yarn | New A-derived loop stays f(n); old A moves to empty b(n+1) |
| 2 | 0 | Transfer b(n+1) → f(n+1) | Old A returns to front face on new column |
| 3 | +2 | Split rightward b(n) → f(n+2), rear-face yarn | New B-derived loop stays b(n); old B moves to empty temporary f(n+2) |
| 4 | +1 | Transfer f(n+2) → b(n+1) | Old B returns to rear face on new column |
| 5 | 0 | Resume planned knitting | Four supported loops occupy two columns; temporary column is empty |

The extra outside column allows step 3 to avoid the already occupied f(n+1). Final loop ancestry remains on its original face. Four loop-changing operations add two live loops with no stacking or knit-on-empty. A shorter pair of cross-bed splits would leave old A/B on opposite faces; that does not meet this candidate's face-preservation requirement.

This still carries physical uncertainties: the temporary two-needle reach, split direction and receiving latches, yarn crossing/tension, loop size, colour transitions and edge connection. Both carriers knitting extra local loops can produce a local height/bulk difference. Whole-row scheduling must account for those stitches rather than blindly adding full rows. Loop accounting does not prove a smaller visible opening.

## Reproducible software validation

Run from the repository root:

```sh
node --import tsx scripts/experiments/reversible-increase-research.ts
```

The script builds synthetic operations in memory through Studio's pinned converter, strict KCode parser, emitted-action replay, loop-topology projection and unchanged machine-safety envelope. It never writes runnable KCode. Synthetic occupied beds are not a physical cast-on. The saved result is `docs/research/reversible-increase-validation.json`.

Eight cases cover mirrored edges, both first-split directions and swapped C3/C4 face colours. Each repeats four increases, with ordinary knitting on both faces between increases. Checks require: 32 initial loops → 40 final live loops; one loop per occupied needle; eight split loops each with one existing parent; no occupied transfer targets, empty transfer sources or empty-needle body knits; correct front/rear yarn identity. Negative controls detect the naive split's occupied destination and the current borrow method's two empty rear knits.

Results:

- All eight pass the stated topology/accounting assertions. **This is not eight safety-approved cases.**
- Right-edge, first split leftward: both colour assignments have ONLY the eight expected `machine-safety.transfer-with-carrier` refusals. This is the preferred candidate for further engineering, not an export-ready variant.
- Right-edge first split rightward additionally fails stop-overrun checks. Left-edge variants additionally fail attached-yarn checks; one direction also fails feeder-clearance/stop-overrun. Their exact diagnostics are preserved. Do not generalize the preferred right-side schedule to mirrored shaping.
- An initial isolated zero-take-down probe also triggered take-down-gap. The retained fixture includes ordinary knitting with synthetic positive take-down between units. This is neither a machine-setting recommendation nor a fix proven for a whole swatch.
- The production split refusal stays blocking. None of these results establish controller acceptance, physical yarn clearance or appearance.

## How this belongs in Studio, once the blockers are resolved

1. Capture a minimal **Kniterate official-software-generated** single-bed split file with its source chart, direction, receiving bed, rack and settings. Cover front→rear and rear→front and the racked cases needed here; matching an un-racked example alone is insufficient. Compare exact KCode with the pinned converter. Add reference fixtures and positive/negative encoding tests before considering any narrow safety-policy change.
2. Implement a separate reversible edge-increase unit in `stockinette-shaped.ts`, routed only when `retainComplementBeds` is true. Keep birdseye borrowing and existing decreases unchanged. Use the canonical `CarriageSimulator`; do not edit emitted files.
3. Schedule the two face yarns from chart colour assignments and edge-join parity. Require two empty temporary columns, in-bed bounds and known carrier sides. Integrate split-created loops into the row plan so the edge does not receive unaccounted extra courses. Preserve the alternating join's actual yarn-path connection.
4. Reconcile simulator predictions with vendor split sub-passes (the simulator's generic split prediction is not evidence of exact pass parity). Repeat trace/topology/safety checks on a full right-only project, including startup, idle C1/C6, working carriers, return to top waste and finish. The simple solid-face fixture does not cover these.
5. Keep export blocked until encoding, whole-project safety, topology and parity checks pass. Then use a small supervised physical comparison, not the full paisley diamond, to establish actual increase quality. No new test file has been prepared this round.

The immediate missing evidence is the official split KCode reference. Widened waste or proper C1/C6 withdrawal remains separate feeder work; it cannot validate an increase's loop structure.
