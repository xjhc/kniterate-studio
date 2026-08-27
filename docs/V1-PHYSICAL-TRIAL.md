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
  and estimated time
- `OPERATOR-CHECKLIST.md` for the actual machine session
- `command-legality.json`, binding the profile/contract, proof receipt, exact
  KCode hash, pass count, and present command combinations with controller
  observation explicitly pending
- `CONTROLLER-REVIEW.md`, preserving the software/controller evidence boundary

`release:trial` first runs `pnpm verify:kcode:check`; it cannot package an
artifact against a stale or incomplete software proof receipt. The manifest
range is expressed only in compiler/project coordinates. It is
not a physical needle-label claim. Resolve that range against a documented
machine/vendor datum procedure and record an independent placement verification
in `run.json` before sending the job.

The release trial is a 120x160 four-color birdseye rectangle on the fixed 7gg
profile: C1 draw, C2-C5 pattern yarns, C6 waste, 20 waste rows, and machine
bind-off. The current generated package has 152,488 Knitout operations, 2,656
predicted passes, 2,662 vendor-emitted passes, and an estimated 15,102 seconds.
The six-pass preview delta is confined to the known-approximate frame/finish
tail; body parity and generated-file revalidation gate export.

Kniterate's [start-up guide](https://support.kniterate.com/hc/en-us/articles/18230075945885-Start-up-guide)
says `.kc` cannot be imported into the design app, and its
[machine manual](https://support.kniterate.com/hc/en-us/article_attachments/360009817198)
requires the SD-card file to be named `command.kc`. After independent hash review,
copy the exact `blanket.kc` bytes to the SD
card as `command.kc`, verify the copied bytes, eject the card correctly, and let
the machine read it under the supervised manual procedure. There is no
automated controller-only dry run in this repository.

## Promotion gate

1. Complete the operator checklist and record exact yarn brand, line, lot,
   fiber, machine identity, software revision, gauge, and tension settings.
2. Confirm waste, draw thread, carrier bring-in, body, backing, edges, and
   bind-off complete without manual source edits.
3. Photograph front/back and all four boundaries; record rested dimensions and
   every machine stop or intervention.
4. From the same clean generating commit, run
   `pnpm release:register -- v1-four-color-blanket`. Registration refuses a
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
