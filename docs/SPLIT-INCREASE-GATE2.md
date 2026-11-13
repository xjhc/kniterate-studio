# Single-bed split increase: Gate 2 review

The operator fork at `da30721363879cd183fefe2968aac5d952ebb813` is integrated
on `accumulate`, with its successful cast-on and historical trials preserved.
This package is for the reviewer. No file has been sent to the operator,
pushed, posted to #18 or knitted in this work package.

## Candidate

- [Instructions and increase pass table](development-trials/2026-11-13/split-increase/instructions.md)
- [Machine file](development-trials/2026-11-13/split-increase/program.kc)
- [Generated knitout](development-trials/2026-11-13/split-increase/program.k)
- [Verification report](development-trials/2026-11-13/split-increase/verification.json)
- 230 passes; 278,708 bytes; 43 body rows, 40 stitches widening to 52.
- SHA-256: `fb2cb6adcfb4320992dcec26e8b80e0cbdcb905b4d25548780f20b04b5c24de5`.

Each style has two simultaneous both-edge events in right-to-left split rows,
then one left and one right increase in left-to-right split rows. This gives
eight events and twelve new edge loops. Simultaneous left-to-right splits are
excluded until captured. The converter and return roller remain unchanged.

The start reproduces all six knitting/transfer passes of the operator's
successful full-needle cast-on. The shared experiment helper also re-emits
the complete historical 268-pass file byte for byte:
`2c5ef66ef99610d933f9fbdf7998d6dad242e67402ad06ba61201684ee72a8ac`.
The swatch's wider left edge needs idle feeders parked four needles farther
left. After the first jersey row, the body retains speed 200, roller 450 and
stitch 9. Use the same actual yarns as that trial; the record does not identify
the orange cone sufficiently to substitute a new yarn confidently.

Rebuild with:

```sh
node --import tsx scripts/experiments/split-swatch.ts output/split-swatch-review
node --import tsx scripts/check-machine-file.ts output/split-swatch-review/program.kc --json
node --import tsx scripts/studio.ts audit output/split-swatch-review/program.kc
```

The reviewer should compare the eight split passes and their following
transfers with the thirteen capture comparisons in `shaped-panel.test.ts`,
and confirm the exact hash before approving an operator handoff. Record a
fault by pass, edge, and whether the loop stayed, dropped or reached the wrong
needle, with the bed if visible. The generated instructions include the table.

## Gate 1 follow-ups

The proof fingerprint binds the eleven debug captures consumed by the parity
tests, plus the two existing canonical references through the reference
inventory. New or rejected captures do not invalidate it. The successful
cast-on source fixture is also bound because the new test reads it.

Capture tests again call `expectMachineValid`, including maximum loop depth
two and rack magnitude two. Its loop replay now accounts for splits and uses
trace coordinates consistently across yarn and carrierless passes. A deliberate
three-loop split/return detects both old omissions. The edge diagnostic reads
the actual `diagnostics` fields.

## Reversible diamond integration repair

The merged diamond initially failed the existing audit: 444 idle-feeder moves,
4.62 movement-only passes per knit, and 30 paired empty-needle starts. The user
requested that this be fixed while integrating the fork.

The corrected construction:

- Knits waste and draw across the maximum width, clears their outer loops,
  then casts on only the narrow tip. C1 and C6 park outside the full outline;
  their yarn anchors are no longer inside the eventual body. Simply parking
  farther away failed the attached-yarn safety check.
  At the far left, if there is no on-bed parking slot, the idle carrier goes
  home instead; the waste carrier is brought back for the finish. Tests cover
  offsets 1, 6 and 205 for a 48-needle diamond, including both bed limits.
- Moves a body feeder outward before a widening transfer can reach it. Chooses
  the first body yarn from the carriage's next direction, avoiding needless
  fetches. Each design row has exactly one full knitting pass per yarn.
- Offers a visible, undoable colour repair: on widening rows the former edge
  and new edge have opposite colours. The borrowed-loop transfer is unchanged;
  its two empty rear needles are knitted by different yarns, as in `sleeves.kc`.
- Preserves the paired cross-bed decrease, the inverse faces, and the existing
  yarn-turnaround joins. Interior artwork is unchanged by the edge repair.

The matrix diamond now has 530 passes, zero idle-feeder moves, a 1.15 movement
ratio, zero paired-empty starts, and a maximum two-loop stack. Its new start
and carrier sequence have not been knitted. Rectangular reversible output and
all original forty constructions remain byte-identical; only `diamond-48.kc`
changes among the merged forty-seven matrix files.

This repairs software defects in the **old** construction. It still creates
two rear loops without parent loops at each increase and may retain the loose
widening edge. It is not the proposed reversible split design. Gate 3 still
requires paper design and review before a new reversible increase is coded.

## Verification evidence

Focused checks: 29 machine tests and 19 Studio tests pass. Controlled negative
runs restore the old fingerprint/replay (two failures), merged diamond behavior
and old cast-on (six failures), and right-to-left-only split scheduling (one
failure). Restoring the off-bed parking also fails both left-boundary tests.
All owned files are restored after these controls.

The full 47-file construction matrix passes. Strict parsing, machine validation,
safety and loop audit pass for the exact single-bed candidate. The cast-on
reference verifier passes its six-step comparison, rejects the former cast-on,
and confirms all 141 remaining historical body passes unchanged.
The [matrix hash comparison](development-trials/2026-11-13/split-increase/regression-evidence.json)
records all forty original hashes and all forty-seven files before and after
the diamond repair.

The final proof reports `software-proven` with 3,268/3,268 mutants killed.
`pnpm verify` passes and reports `software-proven · receipt current`; Chromium
passes 54/54 tests. `git diff --check` is clean. These are software results,
not physical machine acceptance. Gate 2 review is the next step.
