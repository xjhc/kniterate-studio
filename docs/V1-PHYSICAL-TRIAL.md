# V1 physical trial

**Status:** the rectangle package is software-ready; no machine run has taken
place. **The V1 gate was widened on 2026-09-28** (see the next section). The
executable gate below still checks only the fixed rectangle.

## V1 physical gate (revised 2026-09-28)

V1 now covers Customist parity plus AI-driven rectangles, beanies and
sweaters ([`FOUNDING.md`](./FOUNDING.md) §1). One multicolour rectangle no
longer qualifies the release. `1.0.0` requires **exact-artifact** Knit-proven
registry entries, all at the frozen final compiler fingerprint, for this
representative set:

1. **Rectangle.** Multicolour colourwork, the Customist-matched waste and
   cast-on frame, and the bind-off: today's fairisle candidate, regenerated at
   the final commit.
2. **Flat, seamed beanie.** 2×2 rib, rib → jersey transfers, a colourwork
   motif in the body, stepped crown decreases, gather closure, centre-back
   seam and fold-up cuff (the M6 goal in [`ROADMAP.md`](./ROADMAP.md)).
3. **Complete sweater.** Every panel: front, back, both sleeves and collar.
   Proposed style: crew neck, classic shoulders and standard sleeves, because
   together they exercise the most new mechanisms: sleeve increases, armhole
   bind-offs, cap and armhole decreases, neckline split with central bind-off,
   body, cuff and collar ribs, and the collar pickup. Assembly is part of the
   gate.

A physical run proves only the exact file that was knitted.
`findKnitProvenMatch` requires the compiler fingerprint, source fingerprint
and KCode SHA-256 all to match. Designs made later from the same
construction remain Surface-proven. The run sheet may state that the
construction was physically exercised by a named registry entry, but only as
information; it never changes a verdict.

### Development runs vs. final qualification

The compiler fingerprint (`COMPILER_FINGERPRINT_INPUTS` in
`packages/machine-lib/scripts/registry-support.ts`) covers all of
`machine-lib/src`, `project-contract/src`, `compileProject.ts`, the release
scripts, the lockfile and the TypeScript configuration. Changes in M5–M8 will
therefore make any earlier entry stale, even for a rectangle whose emitted
bytes stay identical. The registry check rejects stale entries.

- **Development runs.** Any run before the freeze, including the current
  fairisle rectangle, is development evidence. Record it through the normal
  registration procedure: it finds physical defects early and feeds the
  refusal corpus. It does not qualify `1.0.0`.
- **Final qualification.** This is a scheduled step after the software
  milestones:
  1. Freeze a release-candidate commit.
  2. Regenerate every representative artifact from that clean commit.
  3. Knit each one and register it.
  4. Run the extended physical check, which must match all of them at the
     same fingerprint.

  Any compiler or contract change after the freeze requires re-qualification.
  Given today's fingerprint scope, that means every artifact.

### Pass/fail tolerances (declared before knitting)

Each qualification artifact's manifest must declare the following **before
the run**. Recording dimensions after the fact does not pass the gate.

- **Requested finished dimensions and intended ease.** For example: head 56 cm
  with −10% ease gives a 50.4 cm finished circumference.
- **Gauge.** Body and rib gauge from swatches in the same yarn, lot, settings
  and finishing. The candidate's Plan must use these measured values; no
  `assumed` gauge is allowed.
- **Measurement conditions.** After the finishing the export bundle
  specifies, dried flat, rested at least 24 h, laid flat without tension, and
  measured with a rigid rule. A circumference is 2 × the flat width at the
  stated height, taken after seaming.
- **Allowable error.** Proposed default, **pending user approval before the
  first qualification run:** each specified finished dimension within ±3% or
  ±1 cm of the requested value, whichever is larger. Motif placement within
  ±1 stitch column and ±1 row of the Plan, in the correct orientation.

A measured dimension outside tolerance fails the gate, even when the run
itself was clean. Record the measurements, the gauge swatches and the
conditions in the registry entry.

### Sweater assembly evidence

In addition to each panel's own clean run:

- seams and collar attached according to the generated instructions;
- every deviation from those instructions recorded;
- photographs of the front, back, sides and inside seams;
- measured chest, body length, sleeve length and neck opening, checked
  against the declared tolerances.

### Controller capacity evidence

Every machine run records:

- machine serial and controller/software revision;
- the exact file's SHA-256, bytes, KCode records and passes;
- whether the controller accepted, knitted and completed the file.

This is evidence for **that exact file on that machine and software** only.
The longest captured reference, `sophie.kc` (3,766 passes), is a parser smoke
test in the test manifest, not controller evidence. Do not infer that
shorter programs are accepted, or that longer ones need redesigning. If a
planned artifact is longer than anything run so far, schedule an early
development run of it and record the result.

### Executable gate status

`pnpm release:trial`, `release:register` and `release:physical-check` handle
only the fixed rectangle. `scripts/check-v1-physical-release.ts` compiles only
the fixed V1 trial. The extension is required V1 work (ROADMAP M9) and **is
not built**:

- a multi-artifact manifest covering every sweater panel;
- declared tolerances;
- registered measurements;
- assembly evidence.

## Rectangle procedure (current executable gate)

The original founding contract required a representative multicolour
rectangle on a real Kniterate before `1.0.0`. That artifact is now the first
member of the representative set above. Build its immutable trial package
with:

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

The release trial partially reproduces a captured Customist Studio program:
the `reference/fairisle.kc` design (64x50, two colors;
`fixtures/colorwork-chart-v1/customist-fairisle-reference.json`) with ground on
C4 (casts on and leads) and motif on C3, compiled through Studio's
Customist-matched fairisle frame (87 waste passes on C6, C1 draw yarn,
Customist cast-on and transfers, closing waste with park-out and final drop).
The generated package has 14,209 Knitout operations, 286 predicted and
emitted passes, and an authored-plan estimate of 2,081 seconds. Against the
reference, the manifest's `customistParity` records 0 footer differences and
280 of 286 passes stitch-identical (including both transfer selectors) at the
same bed position, plus the full strict machine-trace comparison. The six
differing passes contain 21 extra C4 front knits in the reference. The intended
catch-loop rule is not established from this single captured file. The modified
candidate has no controller or physical-run evidence.
Its strict trace totals 21,300 encoded stop-coordinate units;
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

### Timing evidence boundary

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

### Rectangle promotion gate

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
7. If it succeeds, the rectangle is qualified only at that exact compiler
   fingerprint. **Do not bump to `1.0.0` on this run alone.** The widened gate
   also requires the beanie and the complete sweater, all qualified at the
   frozen final fingerprint through the extended check (see "V1 physical gate"
   above).

*(Superseded 2026-09-28: "This single blanket run closes the v1 release
ruling.")* M4's broader Knit-proven set remains four exact registry entries:
tension, fairisle, birdseye, and complement.
