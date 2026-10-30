# Closing the verified compiler, inspection, and qualification gaps

Planning baseline: `accumulate` at `ef11fd4`, reviewed 2026-10-30. This is an
implementation plan, not a report of completed work or physical qualification.
The order in [ROADMAP.md](./ROADMAP.md) remains in force; this document expands
its safety work and the dependencies of M9. [STATUS.md](./STATUS.md) remains the
authority for implemented behavior.

## Scope and existing foundation

Close gaps in the existing fixed 7gg product before expanding its compiler
architecture. Keep the pinned converter, deterministic artifact pipeline,
strict emitted-KCode validation, and exact-artifact Knit-proven policy.

Already present: `.k` import and lowering; raw `.kc` inspection; pass-role
classification; event playback and per-needle loop counts; parametric Fairisle
and flat-piece starts; transfer batching and cable helpers; rack-aware bed-range,
feeder-clearance, and loop-stack checks. Extend these seams instead of rebuilding
them. The Fairisle frame is generated reference-derived choreography, not a
splice of reference bytes.

The remaining work has three different completion conditions:

- **Software:** reproducible behavior, diagnostics, and appropriate regression
  coverage at the shared engine and product boundaries.
- **Evidence:** versioned source captures or observed machine runs tied to exact
  artifacts. Software tests cannot substitute for this evidence.
- **Release:** all representative artifacts qualified at the frozen source
  fingerprint, including finishing and assembly where applicable.

## Order and ownership

Implementation owners below are repository areas, not assigned people. A machine
operator supplies observations and performs physical runs; the implementation
agent prepares reproducible inputs, checks records, and implements software.

| Package | Work | Depends on | Roadmap placement | Completion |
| --- | --- | --- | --- | --- |
| G1 | Last-stitch-to-parking yarn paths | Existing trace and safety engine | B, first software slice | Software; physical limits tracked in G5 |
| G2 | Loop lineage and pickup stability | G1 baseline; small conformance captures | B, sequence checks | Software plus bounded construction evidence |
| G3 | Held fabric, moving short rows, increase spacing | G2; relevant source/physical evidence | B before affected new C constructions | Supported envelope or explicit refusal |
| G4 | Shared pass filters and occupancy colors | Existing trace/cursor | Optional parallel UI work | Authored/imported workflow checks |
| G5 | Yarn presets, qualified recipes, inferred limits | Can prepare now; candidate checks from G1–G3 | A presets; B qualification | Software preparation plus operator evidence |
| G6 | Capacity, prediction coverage, and conformance corpus | Existing inspector; G5 candidates | Before freeze for supported workloads | Measured software coverage; separately scoped motion evidence |
| G7 | Multi-artifact qualification and fingerprint closure | Start infrastructure early; all included software settled before freeze | D / M9 | Exact frozen rectangle, beanie, complete sweater |

Continue A's current development-knit and usability work. Before an operator runs
a waiting candidate, verify its identity and current checks; if a newly identified
blocking issue applies, regenerate a corrected candidate. Development observations
remain useful even when a later compiler change makes their registry match stale.
They are not final qualification.

## G1 — Close the within-pass yarn carry omission

**Owner:** `packages/machine-lib/src/knitout/kcode/machine-safety.ts`, its safety
tests, and the existing Studio/CLI diagnostic consumers.

The current `attached-yarn` check requires an empty move after the last stitch.
A knitting pass that ends well beyond its final stitch clears that marker, so
later needles can work beneath its carried yarn without that rule firing.

1. Start with the existing regression in `kcode-machine-safety.test.ts` named
   `treats a carry within a knitting pass as a float, and a move after it as a drag`.
   Retain both encodings as a paired witness of the same encoded anchor-to-stop
   span, without asserting identical physical yarn shape or tension.
2. Represent the latest attached stitch, its bed/coordinate, last encoded carrier
   stop, and covering-knit history independently of whether an empty move occurred.
   Reuse the existing rack/traversal coordinate conversion and transfer updates.
3. Evaluate subsequent operated needles against that span for both directions and
   beds. Include transfer receivers, rack changes, tuck versus knit covering,
   drops, repeated moves, and carrier reuse. Resolve drop/recast lineage through
   G2; do not silently treat an unknown attachment as released.
4. Add source-anchored findings through existing validator/verdict seams. Compare
   `.k`, its emitted `.kc`, authored output, CLI checking, and all export routes.
   Raw KCode must not infer a cut from parking or from an idle pass.
5. If the corrected checker exposes authored output, repair that construction's
   carrier scheduling with the existing simulator. Keep the refusal if no
   evidence-backed repair exists; do not suppress the finding for that recipe.

**Done when:** the same encoded anchor-to-stop spans receive equivalent modeled
subsequent-clearance decisions; direction/rack/transfer boundary tests pass; the known four-color
minimal-birdseye witness is either repaired or blocked with a useful location;
all impacted download/package paths enforce the result. The existing 7-needle and
36-covering-knit numbers retain their current evidence labels pending G5. This
slice does not reconstruct physical motion during a pass.

## G2 — Track lineage and define a bounded pickup check

**Owner:** `machine-validator.ts`, `machine-safety.ts`, `machine-topology.ts`,
`machine-execution.ts`, and their existing shared loop-effect helpers/tests.

1. Add small source/expected-state fixtures for knit, tuck, transfer, stacked
   transfer, drop, and recast sequences on both beds, including rack changes and
   repeated operations at the same coordinate. Cross-check safety counts,
   validator state, execution snapshots, and topology loop identities. A reused
   needle coordinate must not accidentally inherit a dropped loop's history.
2. Capture known cast-ons, intended waste drops, increases, and a demonstrated
   unstable pickup from versioned authoritative examples or operator-reviewed
   examples. Record what the emitted code actually proves and what setup is assumed.
3. Specify anchoring over the relevant sequence, not simply `knit on empty needle`
   or `loop has no parents`. Those shortcuts would reject legitimate cast-ons and
   miss later anchoring. Distinguish observed loop connections from physical
   stability; document any state that the serialized file cannot determine.
4. Implement only the supported detector. Give known invalid sequences anchored
   diagnostics and route unresolved cases through the existing conservative
   warning policy. Keep the empty-bed assumption explicit and preserve intended
   waste/drop/finish behavior without per-file exemptions.

**Done when:** fixtures show the exact incorrect and accepted sequence boundaries;
all replay surfaces agree; ordinary supported starts/finishes have explained
outcomes; unknown cases remain visibly unknown. If available evidence cannot
distinguish pickup stability, close the lineage fix separately and leave the
pickup detector open with the missing evidence named. Do not call count replay
alone a complete stability verifier.

## G3 — Bound held-fabric and increase behavior

**Owner:** the safety engine, shaped-panel/crown construction helpers, and the
conformance corpus prepared with G5/G6.

1. Use G2 identities to characterize a knitting region that moves laterally while
   older loops remain held on both sides. Compare with an edge bind-off chain;
   simply following every moving loop forever would reject valid finishing.
2. Capture paired accepted/refused examples for central versus edge short rows,
   held opposite-bed fabric, sleeve increases, and consecutive-row increases.
   Record controller/editor version, settings, width, yarn, and source construction.
3. Implement evidence-backed construction limits using existing helpers. Retain
   rack-dependent facing geometry; do not add an arbitrary 20–232 margin or
   automatically rerack every two-bed pass to 0.5.

**Done when:** each included construction has explicit supported conditions,
regression witnesses, and a development-knit record. Cases beyond that envelope
are refused or remain named qualification blockers for the affected construction.
This work does not require a universal fabric-force solver. Resolve the envelope
before enabling a C construction that depends on it.

## G4 — Make existing inspection data easier to use

**Owner:** `apps/studio/src/App.tsx`, `engine.ts`, `kcode/ExecutionControls.tsx`,
`kcode/MachineMovementView.tsx`, and shared pass-grid components.

1. Populate authored pass `role` from the canonical strict-trace classifier and
   `origin` only from existing validated provenance. Reuse imported labels.
   Direct `.kc` retains unknown origin; only proven backend-inserted carrier moves
   may be labelled Kickback. Machine passes must not become inferred design rows.
   Follow the existing source-operation origin policy rather than treating
   `isAutoMove` alone as proof. Extend compact Worker navigation metadata if needed;
   keep full imported traces in their owning Worker.
2. Add a role filter and an independent issues filter. Keep original pass/event
   indices, source links, design-row selection, and breakpoints stable. Make a
   selected pass hidden by a filter explicit; do not silently select a different
   execution state. Filtering changes navigation, never validation or export.
3. Color existing front/rear occupancy counts at the selected event as 0/1/2/3+,
   with numbers, legend, keyboard access, and a non-color cue. Preserve blocked or
   unavailable replay. Label it modeled loop count; no tension/stress meaning.

**Done when:** imported `.kc`, lowered `.k`, and authored Step through each retain
correct source/selection behavior while filtering; forward/backward playback and
blocked state render correctly; keyboard and narrow-screen flows pass. Confirm
compiled bytes and verdicts are unchanged. Scope new projections inside
`apps/studio` when existing engine exports suffice; a machine-lib change affects
the compiler fingerprint even when its emitted bytes remain identical.

## G5 — Separate convenient presets from qualified recipes

**Owner:** existing project edits, `apps/studio/src/machineSetup.ts`, `swatch.ts`,
`readiness.ts`, the swatch registry schema/checker, and release registration tools.

1. Implement A's starting gauge/stitch-size presets through existing typed edits
   and setup fields. Show their source and assumed/measured status; applying one
   must be undoable and must not create a measured gauge or Knit-proven status.
   Reuse existing recipe types where their evidence semantics fit. Preserve manual
   settings or show the proposed changes before replacing them; do not store an
   assumed gauge in a field whose contract says it is empirical.
2. Reuse current section settings for waste, cast-on, rib, body, and transfers.
   Prepare a small recipe matrix for the release constructions. Bind actual yarn
   identity/lot, structure, width, all emitted settings and transitions, machine,
   controller, and exact KCode identity to each observation. Extend the existing
   registry only for information it cannot yet retain; do not build another registry.
3. Have a qualified operator select conservative, reviewable development samples
   to investigate the inferred clearance rule and construction transitions. Include
   evidence that could falsify the hypothesis. Synthetic boundary/refusal cases
   belong in software tests; never instruct the operator to execute a known-invalid
   file merely to exercise a test boundary.
4. Record clean, failed, stopped, and intervened runs honestly through the existing
   evidence workflow. `release:register -- <name> --package <dir>` already accepts
   supported single-project handoff packages. Do not misdescribe that capability
   as missing; sweater qualification is the separate G7 extension.

**Done when:** presets have honest provenance; selected recipes have complete
artifact-bound observations; each proposed threshold has a stated evidence scope
or remains an unresolved qualification item. One clean swatch never proves all
yarns, widths, settings, or future artifacts. Broad per-carrier/per-operation
profile authoring can follow only when these concrete recipes require it.

## G6 — Measure coverage and collect conformance evidence

**Owner:** existing import/topology Workers, execution tests, browser E2E,
`programmed-motion.ts`, and the trial evidence packet.

**Capacity:** inventory event/loop/edge counts, payload size, memory, import time,
and interaction responsiveness for the accepted reference corpus and the largest
supported rectangle, beanie, and sweater panel candidates. Existing tests cover
reference inspection, a `<16 MiB` `front.kc` opening response, document replacement,
and a 2-second main-thread heartbeat ceiling; preserve those checks. Test the
400,000-event boundary separately with synthetic inputs. If a supported candidate
exceeds it, implement bounded/lazy indexing in the owning Worker or explicitly
revise the supported envelope. Do not merely raise limits or truncate the trace.
An execution-index refusal must preserve the existing static inspection and
verdict behavior; it must not become a fabricated machine-invalid finding.

**Prediction coverage:** inventory complete/partial/missing simulator predictions
for the selected release routes, including raw sections, section handoffs, and
finish tails. Report the first divergence and affected fields. Use existing
`KniteratePlan`, `CarriageSimulator`, and simulator handoff types to repair one
bounded route at a time; retain emitted bytes unless fixing an independently
diagnosed output defect. Closure for a route means whole-program agreement with
the pinned backend on pass count/order and executable machine fields, not merely
an agreeing prefix. Unmigrated routes stay explicitly partial; scheduled-backend
versus strict emitted-trace comparison remains the downstream authority.

**Conformance and motion:** retain small source designs plus exported `.kc`,
producer/version/settings, and expected operation transitions. Prioritize G1–G3
witnesses. Select the M8 parity rows needed for V1 explicitly: strict whole-trace
equality proves reproduction; topology equivalence needs a declared comparator,
and workflow parity needs browser evidence. Face similarity alone proves neither
whole-program reproduction nor loop equivalence. Authentic source exports are an
external input, not something to infer from a rendered example.

For reviewed machine candidates, collect the documented coordinate
mapping and observed movement/phase timestamps where possible. The first useful
timing result is an exact-candidate observed duration beside the existing
assumption-derived term, not an inferred universal acceleration model.

**Done when:** the declared supported files remain fully inspectable within
measured resource bounds, or have an explicit explained refusal; captures can be
replayed and attributed to their source versions. Physical sub-pass animation
remains open until observations constrain pickup, release, needle engagement,
carriage, rack, and roller timing. Validate any future model on held-out runs,
report error/uncertainty, and keep it out of the verdict authority. A calibrated
motion model is not required for the current schematic debugger's V1 release.

## G7 — Complete the actual M9 release gate before freezing

**Owner:** `scripts/build-v1-knit-trial.ts`, `register-v1-knit-trial.ts`,
`check-v1-physical-release.ts`, machine-lib registry support/checker, and the
canonical `apps/studio/src/sweater/sweaterPipeline.ts`.

The current final physical check freshly compiles the fixed rectangle. Registry
project recompilation uses `compileColorworkProject`, which rejects sweater/panel
projects because they compile through the shaped-piece pipeline. Single-project
development registration therefore does not yet satisfy the roadmap's complete
sweater qualification.

1. Add a versioned release manifest covering the rectangle, beanie, every sweater
   panel, required copies, finishing, assembly, and tolerances declared before runs.
   Recompile each artifact through its existing canonical in-process pipeline;
   do not execute stored shell commands or trust stored re-emit assertions.
2. Audit the compiler fingerprint's complete dependency closure for those routes,
   including shaped-piece orchestration and settings adapters. Final qualification
   must become stale when any input that determines output or eligibility changes.
   Document this boundary instead of assuming all `apps/studio` files are UI-only.
3. Extend registration and the fresh physical check to require the complete set,
   matching identities/fingerprint and assembly evidence. Test missing/duplicate
   panels or copies, mixed fingerprints, byte/settings changes, stale results,
   interventions, failed outcomes, and absent finishing evidence.
   Compare observed finished dimensions and required motif placement against the
   declared tolerances. Reject missing measurements, assumed gauge where measured
   gauge is required, out-of-tolerance results, and records with the wrong finishing
   or rest conditions. Operator attribution and supporting observations are
   required; a schema-valid measurement alone is not proof of a physical run.
4. Reconcile the procedure in `V1-PHYSICAL-TRIAL.md` with the shipped commands and
   supported routes. Finish selected compiler/contract/evidence-schema changes,
   then freeze, regenerate, knit, finish, measure, register, and run the full gate.
   Before freezing, record the selected M8 coverage, release constructions, and
   user/operator-approved measurement and finishing tolerances. Do not invent
   those acceptance values or adjust them after seeing a knit's result.

**Done when:** the current complete release set passes software checks and the
fresh physical gate at one frozen fingerprint. Changes within that fingerprint
closure after the freeze require requalification of the release artifacts.
Prefreeze runs remain development evidence; they do not require repeating all
three final qualification pieces after every development commit. Tagging or
publishing remains a separate release action.

## Compiler expansion after the bounded work

These are real future capabilities, not prerequisites for closing the current
checker gaps. They remain deferred, not marked complete:

- **General transfer planning:** when a selected construction exceeds existing
  `bed-transition.ts`, `lateral-shift.ts`, and `cable-cross.ts` helpers, first retain
  a minimal desired start/end loop mapping. Introduce a bounded planner using
  existing plan types, preserve rack/loop intent, refuse unsupported mappings, and
  verify emitted topology, carrier clearance, and a development knit before enabling
  that construction. Cables already have reusable choreography.
- **Editable Knitout / Knitout-JS:** add only as an explicit product milestone.
  Start with editing `.k` through existing import/lowering and the same export
  gates. JavaScript needs a separate execution/resource-isolation contract; it is
  not necessary to accept or check generated `.k` files today.
- **Native backend:** consider only after a measured converter limitation cannot
  be addressed within the current contract. Extend existing pass IR, run the new
  backend in shadow differential mode, preserve refusal/topology coverage, and
  qualify new emitted artifacts before replacing the pinned path. No V1 rewrite
  is part of this plan.

## Verification and first implementation slice

For safety/compiler/contract changes, run focused witnesses, the reference and
refusal corpora, then `pnpm verify` and the targeted KCode proof/mutation workflow
in [KCODE-SOFTWARE-PROOF.md](./KCODE-SOFTWARE-PROOF.md). Record changed findings
explicitly: a reference file is evidence to investigate, not permission to tune
away a newly discovered hazard. Add no per-file allowlists to keep a corpus green.
Cover browser, headless check, authored CLI, and download/package verdict parity.
Refresh receipts only after the owned changes pass their required gates.

For G4, run relevant component and browser flows plus typecheck/build; broader
checks follow if shared engine behavior changes. For every slice, review the
owned diff, update the implemented/open status, and distinguish local tests,
deployed-browser evidence, and physical observations.

**Start with G1:** a regression and the smallest shared state fix, then consumer
and authored-output validation. Prepare G5 evidence packets and G7 infrastructure
in parallel; G4 may proceed independently. Do not mark any evidence-dependent gap
closed merely because its software preparation is complete.
