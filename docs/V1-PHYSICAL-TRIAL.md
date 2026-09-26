# V1 physical trial

**Status:** software package ready; machine run pending.

The founding contract requires a representative multicolor rectangle on a real
Kniterate before `1.0.0`. Build the immutable trial package with:

```bash
pnpm release:trial
```

The command first requires a clean Git worktree, including no untracked files,
then writes `out/v1-knit-trial/`:

- `project.kniterate-studio.json` and `chart.colorwork.json`
- validated `blanket.k` and `blanket.kc`
- `manifest.json` with the full generating commit, clean-worktree assertion,
  compile hash, SHA-256 identities, carrier map, dimensions, frame, pass counts,
  authored-plan time heuristic, exact programmed stop-coordinate travel,
  assumption-derived travel/time model, and the hash-bound
  compiler/KCode/trace coordinate bridge, plus a first-class physical-settings
  gate for the exact seven-value initial recipe
- `OPERATOR-CHECKLIST.md` for the actual machine session
- `command-legality.json`, binding the profile/contract, proof receipt, exact
  KCode hash, pass count, exact scheduled-versus-parsed machine-field match,
  and present command combinations with controller observation explicitly
  pending
- `CONTROLLER-REVIEW.md`, preserving the software/controller evidence boundary

`release:trial` first runs `pnpm verify:kcode:check`; it cannot package an
artifact against a stale or incomplete software proof receipt. The manifest
records the exact lowering placement from compiler/project coordinates through
marker-free KCode columns to normalized trace coordinates. That software bridge
is not a physical needle-label claim. Resolve both trace endpoints against a
documented machine/vendor datum procedure, record whether physical labels
increase or decrease across them, and record an independent placement
verification in `run.json` before sending the job.

The same package extracts stitch, transfer-stitch, speed, roller, transfer
style, carrier spacing, and carrier stopping distance from the exact compiled
Knitout. The operator checklist prints those values for independent comparison
with the controller-loaded recipe. Registration copies them into `machine.json`
and the tension-swatches settings record; the registry gate compares them with a
fresh current compile and blocks promotion for any mismatch, recorded deviation,
or in-run intervention. This establishes an exact-candidate settings receipt,
not a generally safe speed/roller envelope.

The release trial reproduces a captured Customist Studio program rather than
an original design, so the first machine run knits a program already knit by
Kniterate users: the `reference/fairisle.kc` design (64x50, two colors;
`fixtures/colorwork-chart-v1/customist-fairisle-reference.json`) with ground on
C4 (casts on and leads) and motif on C3, compiled through Studio's
Customist-matched fairisle frame (87 waste passes on C6, C1 draw yarn,
Customist cast-on and transfers, closing waste with park-out and final drop).
The generated package has 14,209 Knitout operations, 286 predicted and
emitted passes, and an authored-plan estimate of 2,081 seconds. Against the
reference, the manifest's `customistParity` records 0 footer differences and
280 of 286 passes stitch-identical (including stitch size) at the same bed
position; the six differing passes are Customist catch loops the engine does
not reproduce. Its strict trace totals 21,300 encoded stop-coordinate units;
the 3.63 mm/unit and constant-speed assumptions give a separate 342-second
idealized term. These are software comparisons and derived units, not
physical observations.

Kniterate's [start-up guide](https://support.kniterate.com/hc/en-us/articles/18230075945885-Start-up-guide)
says `.kc` cannot be imported into the design app, and its
[machine manual](https://support.kniterate.com/hc/en-us/article_attachments/360009817198)
requires the SD-card file to be named `command.kc`. After independent hash review,
copy the exact `blanket.kc` bytes to the SD
card as `command.kc`, verify the copied bytes, eject the card correctly, and let
the machine read it under the supervised manual procedure. There is no
automated controller-only dry run in this repository.

## Timing evidence boundary

`manifest.json` keeps three different values separate for the exact candidate:
the authored plan heuristic, the exact sum of encoded carriage-stop coordinate
deltas, and an idealized term that assumes one coordinate unit equals the
documented 3.63 mm needle pitch and each encoded speed is constant mm/s. The
last two physical interpretations are assumptions, not observed duration or a
physical lower bound. Any contributing nonpositive speed makes the idealized
term unavailable.

Record one continuous `run.json.startedAt` / `endedAt` interval around the
physical attempt plus every stop and intervention. A clean run can yield an
aggregate ratio or residual only for this KCode hash, machine serial, controller
revision, yarn, and settings. One blanket run cannot identify acceleration,
reversal, rack, roller, transfer, or intervention costs and must not become a
universal calibration constant.

## Promotion gate

1. Complete the operator checklist and record exact yarn brand, line, lot,
   fiber, machine identity, software revision, gauge, and tension settings.
   Independently compare all seven controller-loaded initial settings with the
   manifest receipt and record every deviation or later setting change.
2. Confirm waste, draw thread, carrier bring-in, body, backing, edges, and
   bind-off complete without manual source edits.
3. Photograph front/back and all four boundaries; record rested dimensions and
   every machine stop or intervention.
4. From the same clean generating commit, run
   `pnpm release:register -- v1-customist-fairisle`. Registration refuses a
   different commit or dirty tree. Then complete
   `machine.json`, `yarn.json`, structured `run.json`, and the narrative
   `outcome.md`. A failed or interrupted run remains valid history but is not
   promotable.
5. Run `pnpm release:physical-check`. It first checks the generated registry,
   then freshly recompiles and re-emits the fixed trial in-process. It must find
   one clean, complete, non-deviated physical entry with exact current Knitout
   and KCode identities; stored commands and caller-marked re-emit statuses are
   never trusted. Studio will then show Knit-proven only for that compile hash
   and `.kc` hash.
   The registry report also reparses exact accepted `out.kc` bytes and aggregates
   controller-observed operation/direction/carrier/rack combinations by machine
   serial and control-software version. Only the same clean, current,
   non-deviated entries that qualify for Knit-proven contribute coverage.
6. If the run fails, keep the RC capped, add the failure to the refusal corpus,
   fix the engine, regenerate, and repeat.
7. If it succeeds and the physical check passes, bump workspace versions from
   `1.0.0-rc.1` to `1.0.0` and tag the release.

This single blanket run closes the v1 release ruling. M4's broader Knit-proven
gate remains four exact registry entries: tension, fairisle, birdseye, and
complement.
