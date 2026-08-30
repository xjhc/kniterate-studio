# KCODE-COMPILER-GAPS — tracked baseline and corrected gap register

**Evidence class: tracked local software evidence plus explicitly labelled external
documentation.** Revised 2026-08-29 against `accumulate`. The compiler source
baseline is `cff1d6e`; the reproducible evidence is the checked-in
[software-proof receipt](../packages/machine-lib/out/kcode-proof/proof-manifest.json)
and [mutation receipt](../packages/machine-lib/out/kcode-proof/mutation-manifest.json).
No deployed instance, controller acceptance, physical-machine run, or knitted
fabric outcome is claimed here.

External reference points:

- Agnes Cameron's
  [knitout-js cheatsheet](https://soup.agnescameron.info/2026/04/09/cheatsheet.html)
  and [Local First workshop notes](https://soup.agnescameron.info/2026/07/09/local-first.html);
- Kniterate's [machine specification](https://www.kniterate.com/product/kniterate-the-digital-knitting-machine/),
  [options-column documentation](https://support.kniterate.com/hc/en-us/articles/11675168630045-THE-OPTIONS-COLUMN),
  and [roller guide](https://support.kniterate.com/hc/en-us/articles/360019405297-Adjusting-the-rollers);
- the [Customist Studio changelog](https://editor.kniterate.design/changelog)
  and [2.5 release notes](https://www.kniterate.com/2026/07/29/customist-studio-2-5-new-template-editor-and-much-more/).

---

## Finding

**The compiler, its software-proof rail, and a supported one-file checker now
exist. The remaining gaps are higher-level models and physical evidence.**

For the fixed `kniterate-7gg-kcode@2` profile, the repository has lossless
byte-preserving KCode intake, pinned Knitout lowering, strict emitted-KCode
inspection, scheduled-pass differential checks, a projection of encoded KCode
fields into `MachineTraceV1`, a 43-rule structural, semantic, kinematic, and
operational validator, and deterministic renderer input.

“Exact” in this document means exact programmed KCode semantics under the pinned
profile and dialect. It does not mean controller-observed motion, operationally
safe settings, or the fabric produced by a machine.

The headless verdict and format-provenance disclosure gaps closed on 2026-08-29.
The remaining gaps concern a conditional programmed-motion model, fabric
topology and rendering, physical coordinate observations, physical setting
evidence, and a legible foreign-file pass metric.

---

## 1. Tracked baseline

The baseline intentionally omits the earlier ad hoc timing run,
hostile-mutation table, and hand-written 688-operation program because their
exact inputs and outputs were not retained as proof artifacts. The tracked
receipts establish the following instead.

| Tracked evidence | Result |
| --- | --- |
| Fixed profile | `kniterate-7gg-kcode@2`; 252 needles per bed |
| Reference corpus | 13 fixtures; 25,111,478 bytes; 20,568 passes; 710,063 projected actions |
| Reference validation | 0 errors; 403 raw validator warnings |
| Studio corpus verdicts | 12 `Surface-proven (imported)`; 1 `Blocked` |
| Warning disposition | 220 depth-three loop-stack observations across five fixtures are non-blocking information at the foreign Studio boundary; `fox-baby-beanie.kc` remains blocked by 183 empty-drop warnings |
| Command-legality matrix | 1,904 cases: 8 operations × 2 directions × 7 carrier tokens × 17 rack values |
| Native KCode refusal rail | 10 invalid-command cases; none export-eligible |
| Named rule ledger | 30 parser rules + 43 validator rules = 73 runtime-witnessed rules; all 70 blocking rules have targeted witnesses; 3 rules are advisory-only |
| Source mutation rail | 2,420 killed; 0 survived, timed out, uncovered, compile-error, runtime-error, or pending; 60 reviewed ignored mutants |
| Receipt verdict | `software-proven`; every listed gate passes; `auditFailures` is empty |
| Physical acceptance | Excluded; the Knit-proven registry has no entries and `pnpm release:physical-check` remains separate |

The receipt supplies the per-fixture validator counts. The passing fingerprinted
Studio integration gate plus [STATUS.md](./STATUS.md) supplies the current
foreign verdict/reclassification policy, and the swatch-registry check supplies
the zero-entry physical state:

| Fixture | Passes | Validator errors | Validator warnings | Studio verdict |
| --- | ---: | ---: | ---: | --- |
| `2x2-rib-beanie.kc` | 530 | 0 | 1 | `Surface-proven (imported)` |
| `back.kc` | 2,108 | 0 | 82 | `Surface-proven (imported)` |
| `color-swatch-bindoff.kc` | 458 | 0 | 0 | `Surface-proven (imported)` |
| `dbj.kc` | 498 | 0 | 0 | `Surface-proven (imported)` |
| `fairisle.kc` | 286 | 0 | 0 | `Surface-proven (imported)` |
| `fox-baby-beanie.kc` | 220 | 0 | 183 | `Blocked` |
| `front.kc` | 2,544 | 0 | 64 | `Surface-proven (imported)` |
| `jacquard.kc` | 350 | 0 | 0 | `Surface-proven (imported)` |
| `sleeves.kc` | 1,994 | 0 | 68 | `Surface-proven (imported)` |
| `sophie.kc` | 3,766 | 0 | 5 | `Surface-proven (imported)` |
| `sophie2.kc` | 3,716 | 0 | 0 | `Surface-proven (imported)` |
| `sophie_stripe.kc` | 3,734 | 0 | 0 | `Surface-proven (imported)` |
| `swatch.kc` | 364 | 0 | 0 | `Surface-proven (imported)` |

Run the deterministic receipt check from the repository root:

```bash
pnpm verify:kcode:check
```

The evidence boundary is defined in
[KCODE-SOFTWARE-PROOF.md](./KCODE-SOFTWARE-PROOF.md). These results establish
parsing, lowering, encoded command semantics, replay, differential checks where
a backend schedule exists, and product verdict behavior. They do not establish
controller acceptance, collision dynamics, safe physical settings, physical
needle labels, yarn
behavior, elapsed duration, or knitted outcome.

---

## 2. Coverage against both toolchains

The external workflow is JavaScript → Knitout → KCode. Studio's authored
workflow is Chart → Knitout → KCode, while foreign intake can begin at either
`.k` or `.kc`. The paths share downstream KCode inspection, but `.k` retains
source information that serialized KCode does not.

| Stage | JavaScript / Knitout workflow | Studio and tracked proof | Remaining boundary |
| --- | --- | --- | --- |
| Author | JavaScript emits `.k` | Chart emits deterministic Knitout | Arbitrary JavaScript authoring is outside Studio's compiler contract |
| File intake | Tool-specific | Browser and `pnpm machine:check` accept resource-bounded `.k` and `.kc` under one verdict contract | Gap 01 closed |
| Knitout | Backend input with source lifecycle | Parse and validate, then lower through the pinned backend | Backend warnings remain foreign-file findings |
| KCode | Backend output | Strict parse under the product's canonical `knitout-vendor` provenance; direct `.kc` intake preserves exact bytes and discloses the lifecycle boundary | Serialized bytes still cannot prove producer, dialect, or source lifecycle; gap 05 disclosure closed |
| Differential | Usually absent | Foreign `.k` lowering compares scheduled machine fields with the independently parsed emitted trace; direct `.kc` has no backend schedule | Backend-only provenance is not treated as machine state |
| Trace and validation | Author/tool responsibility | Exact encoded `MachineTraceV1`; 30 parser and 43 validator rules | Not controller-observed movement |
| Render | External stitch/loop visualizer | Deterministic programmed-movement scene | No proven fabric projection; gap 03 |
| Verdict | Author/tool policy | `Blocked` or `Surface-proven (imported)` under the foreign policy | Imported files cannot become Knit-proven through software inspection |
| Run | Machine execution | Exact physical trial remains pending | Physical acceptance is a separate gate |

---

## 3. Gap register

Ranked by what each gap unblocks per unit of work, not by nominal size.

### 01 — Closed: unified arbitrary-file headless verdict

**Status: implemented 2026-08-29 · Class: software**

The workspace now has a supported single-file command that returns Studio's
strict foreign-file verdict for arbitrary `.k` and `.kc` files. The fixed-corpus
proof commands and specialized topology oracle remain separate tools.

The shipped interface is:

```bash
pnpm machine:check -- ./pattern.kc
pnpm --silent machine:check -- ./pattern.k --json
```

The implementation is not a text-based KCode wrapper and cannot exit zero merely
because there are no errors. It calls Studio's `openMachineDocument` verdict
seam directly and retains these contracts:

1. Check size before reading and enforce the same 64 MiB limit as Studio. Read
   an accepted file once as bytes.
2. Accept only `.k` and `.kc`; do not infer a format from content.
3. For `.kc`, pass the bytes directly to `parseKCodeBytes` with
   `KNITERATE_7GG_KCODE_PROFILE_V2` and pin the same canonical
   `knitout-vendor` provenance as Studio's V1 file picker. Record that as a
   product-selected contract; the bytes do not identify their own dialect. Do
   not infer a dialect, expose a V1 override, or introduce a UTF-8 round trip.
   Project the trace, validation report, and deterministic movement scene.
4. For `.k`, use Studio-equivalent decoding, parse and validate the Knitout,
   lower through `knitoutToKCodeWithTrace`, strictly parse the emitted KCode,
   project and validate its trace, project the movement scene, and run the
   scheduled differential.
5. Apply the same foreign verdict policy as Studio. Any error or unresolved
   warning is `Blocked`; only the evidence-backed depth-three
   `machine-trace.loop-stack-policy` observation is reclassified as
   non-blocking information. Backend warnings continue to block.
6. Exit `0` only for `Surface-proven (imported)`, `1` for a checked but blocked
   file, and `2` for usage, unsupported extension, read failure, or internal
   checker failure. Do not add a warning waiver or Knit-proven override.
7. Human output should include verdict, counts, stable rule identifiers,
   occurrences, and available line/pass anchors. `--json` should emit a
   versioned, bounded result with byte count, SHA-256, profile, format, dialect,
   verdict, stats, and diagnostics—not the source or emitted KCode.

The Node and browser converter adapters now share one warning contract: Studio
behavior is authoritative, `console.warn` is captured as backend warnings, and
routine `console.log` chatter is suppressed as non-diagnostic information.
Focused parity tests assert identical warning counts and details.

The existing Studio policy rail pins all 13 corpus verdicts and the parser,
resource, depth-three, depth-four, and scheduled-differential boundaries. CLI
subprocess tests pin a clean `.kc` exit `0`, `fox-baby-beanie.kc` exit `1`, and a
clean `.k` exit `0` with source-lifecycle and differential evidence. Direct
`.kc` receipts explicitly report that no backend schedule exists.

**Now available:** repository CI, generated-file preflight, editor integrations,
and other local tools without weakening Studio's safety policy.

### 02 — Trace-derived programmed motion with bounded assumptions

**Size: small–medium · Class: software model with explicit physical/controller assumptions**

**Status: implemented and software-proven.** The public
`deriveMachineTraceProgrammedMotionV1` API sums exact encoded stop-coordinate
travel and separately evaluates the per-pass assumption model. The versioned
profile now records the official 3.63 mm physical needle pitch while explicitly
stating that it does not prove KCode-coordinate scale. Studio's foreign and
authored run sheets and the machine-check receipt expose the exact coordinate
metric, assumption-derived millimetres, and idealized constant-speed term with
their claim boundary. Any contributing pass with zero, negative, or non-finite
speed makes the time term unavailable; no default is substituted.

The exact-candidate trial manifest retains the same motion receipt beside the
authored-plan heuristic. Its checklist requires one continuous observed run
interval and confines any ratio or residual to that artifact, machine,
controller, yarn, and settings. This closes the software/model and trial-
preparation seam, not the physical assumptions or a reusable elapsed-time
model.

Each `MachineTracePassV1` carries encoded half-step
`carriageStops.left` / `carriageStops.right` coordinates and a footer speed
whose profile unit is mm/s. The trace can therefore report an exact programmed
coordinate-distance metric:

```text
programmedTravelUnits = sum(abs(rightStop - leftStop))
```

Converting that value into physical millimetres or seconds is not yet an exact
trace derivation. Two assumptions remain outside the software proof:

1. Kniterate's official specification documents 7 gauge, 252 needles per bed,
   and 3.63 mm needle spacing, and repository comments repeat that pitch. But the
   KCode raster has 253 columns for 252 needles, and trace stop coordinates are
   explicitly not physical needle labels. A one-coordinate-unit to one-pitch
   distance mapping has not been verified.
2. The encoded speed field is advisory, its operational bounds are unknown, and
   the profile does not establish how a controller turns the command into
   observed velocity. The command value is not yet a proven physical upper
   bound.

An assumption-labelled model may still expose:

```text
assumedTravelMm = programmedTravelUnits * assumedPitchMm
idealizedSeconds = Σ(passTravelUnits[i] * assumedPitchMm / encodedSpeed[i])
```

It must name the pitch and controller assumptions, keep the fully encoded
coordinate metric beside the derived number, and avoid calling the result
physical travel, elapsed duration, or a physical lower bound. That stronger
label requires evidence that half-step stop deltas map to physical distance and
that the recorded controller gives the speed command the required bound
semantics.

If any contributing pass has a nonpositive speed, return `unavailable` with a
diagnostic. The parser accepts signed and zero numeric settings, while the
profile has no documented lower operational speed bound; the model must not
divide by zero, produce a negative duration, or silently substitute a default.

The earlier 5–6× comparison was invalid. `compile-chart.ts` estimates authored
plans from the count of timed knit, tuck, miss, transfer, and split operations,
scaled by an assumed 50 operations per pass. It does not use emitted KCode pass
count, and imported KCode currently gets no product estimate. A valid comparison
must use the same candidate's authored
`KniteratePlan.estimatedKnitTimeSeconds` (as surfaced in compiled Studio stats)
and its emitted strict KCode trace.

Even after the coordinate and speed assumptions are established, a
constant-speed term omits acceleration, reversal and controller dwell, rack or
roller motion, transfer settling, stops, and intervention. A physical run can
measure an aggregate residual for that exact artifact, machine serial,
controller revision, yarn, and settings. One clean run cannot identify the
component costs or provide a universal multiplier; a reusable duration model
requires multiple designed workloads or per-component observations.

Carriage travel also does not yield yarn consumption. That needs a separate
carrier- and topology-aware loop/float-length model with its own material
assumptions and calibration.

**Unblocks:** exact programmed-coordinate travel now, plus an
assumption-labelled matched-candidate timing comparison; it does not yet
unblock a physical duration claim.

### 03 — Studio has no verdict-bounded fabric view

**Size: medium–large · Class: software**

`kcToKnitout` exists, is exported, and has no Studio call site, but it is not a
proven drop-in decompiler for arbitrary accepted KCode.

It bypasses the strict parser/trace and calls legacy `parseKc(kcText)` in its
default `app` mode. That legacy parser's `knitout-vendor` option applies a −1
decorated-marker indexing correction to carrier-engaged rows. `kcToKnitout`
cannot select that legacy source mode, so vendor-origin input can place knit,
tuck, or split actions in a different recovered frame from carrier-0 transfers.
Existing tests cover operation multisets and isolated transfer subsets, not loop
continuity through a mixed knit → transfer → knit sequence.

This is a legacy-adapter issue, not a difference in current strict trace
semantics. In the V2 profile, `app` and `knitout-vendor` are marker-free aliases
with offset zero; `MachineTraceV1` has already removed the decorated markers.
The new topology adapter must use those normalized trace coordinates and must
not apply the legacy −1 correction again.

The converter also synthesizes `in` on first carrier use and `out` at the end.
KCode does not encode source carrier lifecycle, so those operations are preview
scaffolding, not recovered facts, and must not feed lifecycle verdicts.

Nor does the current validator's loop replay already contain a stitch mesh: it
stores loop counts and aggregate changes, not loop identities, yarn edges, or
mesh connectivity. The vendored `CellMachine` topology model is exercised by a
Node VM oracle for aggregate conformance, but there is no browser-safe Studio
renderer.

Closing this gap requires a separately proven projection:

1. Adapt ordered `MachineTraceV1.actions` into an explicit topology model,
   preserving normalized trace coordinates, rack boundaries, source pass
   indices, unknown-action failures, loop identities, and yarn edges.
2. Add sequence-based tests across knit, tuck, transfer, split, drop, rack
   changes, both dialects, and both beds. Assert topology across operation-family
   boundaries, not just per-family operation counts.
3. Mark synthetic carrier entry/exit as preview assumptions and exclude them
   from verdict computation.
4. Run the topology work outside the main UI thread and virtualize or bound the
   mesh for large files.
5. Prove the topology-to-mesh renderer independently before presenting it as
   more than approximate preview.

An accepted trace does not automatically prove a new topology model. Even after
the software rail closes, the result would establish a software projection—not
controller behavior or the appearance of physically knitted fabric.

**Unblocks:** trustworthy foreign-file topology preview and visual review of
structural mistakes.

### 04 — Software bridge closed; physical needle labels still pending

**Status: software seam implemented 2026-08-29 · Class: exact-candidate physical evidence**

The profile correctly records
`physicalNeedleNumbering.status: 'unverified'`. Official pitch documents needle
spacing; it does not by itself establish physical origin, numbering direction,
or the relationship between the KCode coordinate frame and the machine's
labels.

The repository already defines a stronger closure workflow than a one-marker
observation. [V1-PHYSICAL-TRIAL.md](./V1-PHYSICAL-TRIAL.md), the generated
checklist in `scripts/build-v1-knit-trial.ts`, and the swatch-registry validator
require the mapping before a run. The exact candidate must record:

- `compilerCoordinateStart` and `compilerCoordinateEnd`;
- `physicalNeedleStart` and `physicalNeedleEnd`;
- a documented machine/vendor datum method;
- `verifiedAt` before the run; and
- an independent `verifiedBy` person who is not the run operator.

The validator checks the recorded endpoints, requires equal absolute compiler
and physical spans, and permits reversed physical numbering. With trusted
physical observations and the documented datum method, two endpoints support an
exact-candidate affine 1:1 mapping over that recorded range. They are stronger
than one marker, but they do not independently prove global scale, every
intermediate label, or the meaning of half-step carriage-stop coordinates.

The software seam is now closed for authored candidates. The pinned backend
retains its per-lowering `Position` result and exact affine front-source-slot to
KCode-column offset. The trial builder binds that placement to the KCode SHA-256,
the compiler/project endpoints, strict marker-free `kcodeColumn` endpoints,
normalized `traceCoordinate` endpoints, profile, dialect, and passing scheduled
differential. This matters because `Position: Center` can recenter a project:
there is no globally correct fixed `-1` shortcut. A foreign KCode file without
authored compiler-coordinate provenance has no API path to acquire this bridge.

The registry persists the exact bridge in `machine.json`, compares it with a
fresh current compile, and requires `run.json` to state whether the independently
observed physical labels increase or decrease across the two endpoints. Tests
pin both orientations. The bridge remains explicit that physical labels are
unverified until the pre-run datum procedure, independent verifier, and time are
recorded. Turning gap 02's idealized time into a physical lower-bound claim
would additionally require a verified half-step stop-distance mapping and
controller speed semantics; the integer needle endpoint record alone does not
supply either.

If a separate marker artifact is needed, make it a hash-bound controlled datum.
Do not modify the immutable blanket candidate informally. The resulting evidence
establishes placement for the registered artifact and recorded
machine/controller configuration; it does not automatically fix every future
file or turn an encoded trace into observed physical movement.

**Now available:** hash-bound placement checks and unambiguous operator
instructions for the exact candidate. **Still open:** the machine-side endpoint
observations needed before any physical needle label can be claimed.

### 05 — Closed disclosure: KCode cannot prove source carrier lifecycle

**Status: implemented with gap 01 · Class: permanent format boundary**

KCode does not encode Knitout `in` or `out` operations. A direct `.kc` import
therefore cannot run source-lifecycle rules such as `carrier-active`,
`carrier-in-twice`, `carrier-out-without-in`, or
`carriers-trailing-at-end`. The strict KCode validator correctly begins from
what the serialized format actually says instead of inventing source history.

A `.k` import supplies more evidence before lowering: Studio can parse and
validate lifecycle, lower through the pinned backend, inspect backend warnings,
strictly parse the emitted KCode, run the scheduled differential, and apply the
same downstream trace validation. That makes `.k` more informative at the
source boundary; it does not make a file physically safe or bypass the same
KCode and physical-evidence limits.

Studio's verdict panel and run sheet plus the CLI's human/JSON receipts now state
the asymmetry directly:

- prefer `.k` when source lifecycle and lowering provenance are available;
- treat `.kc` as checkable only within its encoded semantics; and
- label any synthesized `in`/`out` in a preview as assumptions, never recovered
  facts.

The format limitation itself is not closable. The disclosure and consistent
verdict behavior are now shipped.

**Now available:** accurate generated-file guidance without overstating either
import path.

### 06 — Editor ranges are not a proven physical operating envelope

**Size: evidence program, not a single code change · Class: physical**

Four different concepts must stay separate:

1. **Serialized syntax.** Speed and roller footers accept finite signed decimal
   numbers; the syntax itself does not impose the editor's ranges.
2. **Editor-documented command bounds.** The profile records an official
   documented speed upper bound of 800 mm/s, no documented editor lower bound,
   and a roller editor range of −500 to 999.
3. **Physical operational bounds.** These remain `null`. Current official
   product text conflicts between an 800 mm/s specification and a 0.4 m/s
   current maximum; official material does not establish a signed KCode roller
   operating envelope.
4. **Studio verdict.** The raw validator reports values outside known editor
   bounds as advisory warnings because it cannot invent operational limits. The
   conservative foreign policy still blocks unresolved warnings. Thus a foreign
   speed-5000 or roller-−9999 file does **not** reach
   `Surface-proven (imported)`.

A clean physical run at one chosen speed/roller recipe produces one evidence
point for that exact artifact, machine/controller, yarn, and setup. It does not
generalize to arbitrary values or prove an envelope. General bounds require an
authoritative versioned controller source or multiple designed, conservative
trials across relevant operation mixes. Do not use the machine trial to probe
unsafe extremes.

Until then, keep the validation advisory, surface the limitation in the run
sheet, and refuse to turn editor limits or corpus-observed values into physical
safety claims.

**Unblocks:** a future evidence-backed operational profile; it is not a
one-session closeout item.

### 07 — Authored rows and foreign loop-forming passes are different metrics

**Size: small · Class: software · Related vendor parity: Customist 2.5**

**Status: implemented and software-proven.** Studio's authored run sheet labels
authoritative design rows and emitted machine passes separately. Foreign `.kc`
and `.k` intake now reports total programmed passes plus loop-forming passes
from the successful strict emitted-KCode trace, while carrying an explicit
`unavailable-for-foreign-machine-file` authored-row provenance marker through
the UI, printable run sheet, and machine-check JSON/text receipt. If no strict
trace is available, both derived pass metrics render unavailable instead of as
recovered rows.

The authored path already has design-row
provenance and can report authoritative authored rows. A foreign KCode file has
no such provenance, so Studio must not recover “rows” by merely excluding the
transfer operation family.

That shortcut is wrong in both directions:

- a transfer-family `split` can form a new loop; and
- a regular carrier-0 pass can be a drop or repositioning move that forms no
  row.

For foreign KCode, derive and label a **loop-forming pass count**: a pass is
loop-forming when its strict trace contains at least one knit, tuck, or split
action. Keep total programmed passes beside it. Do not call the derived count
“rows” without source-row provenance.

Customist's changelog says its authored Stitch and Row Counter ignores transfer
rows. That is valid evidence for its own authored product behavior, not proof
that arbitrary imported KCode has an authoritative row decomposition.

**Unblocks:** a useful operator-facing metric without fabricating provenance.

---

## 4. What is not a compiler gap

Most Customist Studio 2.5 features are garment-authoring capabilities: its
template wizard, multi-panel editing, measurements and ease, rib fills, shape
import, and per-panel undo. This repository deliberately places chart authoring
across the `ColorworkChartV1` boundary, so matching those features here would be
product-scope expansion rather than closing a KCode compiler gap.

Two release items are still useful vendor intelligence:

- **Knittability checks** are template-aware garment and machine constraints one
  layer above this compiler's command legality; they are not evidence that
  imported KCode is physically knittable.
- **Increase Transfers defaults** changed from speed 300, roller 30, stitch 3 to
  speed 120, roller 0, stitch 0. These are versioned vendor defaults and
  candidate evidence—not universally safe transfer settings for every file,
  yarn, machine, or controller.

### Directional caution

The Local First notes describe experimentation with model-generated direct
KCode, but the author declined to rely on that path because there was no checker
and the output produced many errors; the notes are cautious about the JavaScript
route as well. That supports a checker between any generator and the machine. It
does not support treating either generation route as safe by itself.

---

## 5. Suggested sequence

1. **Done — gaps 01 and 05: one-file checker plus format disclosure.** `.k` and
   `.kc` now share Studio's conservative verdict and warning policy.
2. **Done in software — gap 04's coordinate bridge.** The existing two-endpoint
   registry gate now retains exact-candidate compiler/KCode/trace mapping
   evidence and both physical orientations without an informal one-marker
   shortcut. Machine-side endpoint observations remain pending.
3. **Done — gap 07's loop-forming pass metric.** Authored rows keep their
   provenance; foreign files get strict-trace programmed/loop-forming counts
   and never receive a fabricated row count.
4. **Done in software — gap 02's programmed-coordinate metric and conditional
   time model.** Nonpositive contributing speeds return unavailable; every
   physical/controller assumption remains explicit and trial calibration is
   exact-candidate-only.
5. **Build gap 03 as a separately proven topology and rendering slice.** The
   strict trace is the input, not proof that the renderer is correct.
6. **Treat gap 06 as an ongoing evidence program.** Record exact-recipe settings
   during the planned trial, but require authoritative sources or multiple
   conservative designed workloads before generalizing an operating envelope.

---

## Scope note

This ledger now records gaps 01, 02, 05, and 07 plus gap 04's software bridge as
implemented. It does not yet claim a topology model, fabric renderer, observed
physical coordinate mapping, operational profile, physical travel, elapsed
duration, or physical lower bound.

Needle pitch is official-documented and now recorded numerically in the
versioned KCode profile, but one stop-coordinate unit equaling one pitch remains
an assumption. Physical coordinate
origin, orientation, half-step stop distance, and controller speed semantics
remain unverified. Any future timing result is assumption-derived until those
inputs and candidate-specific machine evidence are recorded, and physical
acceptance remains governed by `pnpm release:physical-check`.
