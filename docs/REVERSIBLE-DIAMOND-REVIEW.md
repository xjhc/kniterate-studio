# Focused review of the merged reversible diamond — 2026-11-13

This reviews the integration repair in `2fd796c` against the operator fork
`da30721`. It is local software evidence. The repaired start and carrier
sequence have not been knitted, and this review does not approve an operator
handoff or a new reversible increase design.

## Result and correction

No additional emitted-pass defect was found in the cases below. The repair
continues to use the old borrowed-rear-loop increase; it starts two empty rear
needles per widened edge. Passing its audit does not establish a clean edge.

One handoff defect was corrected: the diamond form asked for width and height,
but `measurements.json` has hat-specific dimension fields. Panel width is no
longer labelled as a circumference prediction. Instructions now put labelled
panel dimensions in `notes` and gauge in `bodyGauge`, leaving `finishedCm`
null. The existing measurement import retains those notes. Automated panel
dimension comparison remains unavailable. A regression failed on the previous
instructions before the correction. No machine output changed.

## Pass and loop checks

- **Start:** waste and draw knit the eventual maximum width; outer front loops
  are cleared before the narrow tip's retained two-bed cast-on. Existing tests
  check the start's bed selection and the final two-bed waste support. The
  single-bed orange trial does not physically qualify this different start.
- **Parking:** C1/C6 remain idle during the body. Export, safety and audit checks
  pass at offsets 1, 6, 9 and 205 for the 48-needle diamond, covering both bed
  limits and the home/on-bed parking choices. Clearance moves precede widening
  transfers. Yarn order follows the carriage, with one complete pass per yarn
  per design row.
- **Colour and joins:** even and odd widths, solid interiors and stripes retain
  inverse faces. Existing emitted-yarn-path assertions check cross-bed
  turnarounds within one column at the moving edges. The widening-row old/new
  edge colour repair remains visible and undoable; the interior is preserved.
- **Shaping:** new checks cover intervals of three and four rows and reversed
  carrier assignments. Every increase transfers each old rear edge to the new
  front edge. Every decrease transfers both outgoing loops inward onto the
  opposite beds. Exact destinations are checked per row, beyond the existing
  `sleeves.kc` transfer-unit comparisons.
- **Loop counts:** full-file replay in those additional cases finds no stack
  above two. Every completed body row leaves one loop on each bed in every
  active column. There are exactly four empty rear starts on each both-edge
  increase row, zero on other body rows, and no front empty starts or splits.
  This pins the old construction's limitation rather than treating it as a
  reversible split solution.

`apps/studio/src/diamondChart.test.ts` contains 15 focused cases.
The paired diamond/hat workflow run passes 42 tests. All 47 construction
matrix files pass and are byte-identical to the final hashes in
`development-trials/2026-11-13/split-increase/regression-evidence.json`.

The matrix diamond remains 530 passes, SHA-256
`b197be8722b4b405397a8e7b89daaaa7597e47d6c6d6c726aa41739654a6e668`.
Its audit reports zero idle-feeder moves, 1.15 movement passes per knit, zero
paired-empty starts and maximum stack two. The automatic audit's section
boundaries differ from authored row provenance; the per-row empty-start
assertions above use authored provenance, not those inferred boundaries.

Reproduce with:

```sh
pnpm --dir apps/studio exec vitest run src/diamondChart.test.ts src/beanieWorkflow.test.ts
node --import tsx scripts/studio.ts matrix -o /tmp/diamond-review-matrix
node --import tsx scripts/studio.ts audit /tmp/diamond-review-matrix/diamond-48.kc
```

## Preserved baseline and remaining physical gate

The [522-pass mixed-paisley baseline](../packages/machine-lib/registry/swatches/2026-11-13-mixed-paisley-baseline/outcome.md)
uses a separate experiment generator and still replays both files exactly.
Its inferred photo association is not a confirmed machine-run hash. It must
not be replaced by this 530-pass production matrix case.

The next split-knit evidence comes from the unchanged single-bed swatch.
Gate 3 still requires paper design and review before implementing a new
reversible increase. Edge appearance, attachment of the layers, yarn behaviour
and controller acceptance remain physical questions.
