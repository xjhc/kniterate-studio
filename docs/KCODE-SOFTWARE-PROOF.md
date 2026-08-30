# KCode software proof

Kniterate Studio treats emitted KCode—not a pre-lowering stitch preview—as the
machine-facing source of truth. This document defines what `pnpm verify:kcode`
proves, how it proves it, and where the evidence boundary remains.

## Fixed target and pipeline

The implemented target is the versioned `kniterate-7gg-kcode@2` profile: a
252-needle-per-bed, six-carrier Kniterate contract. Its operation decision table
is part of the profile: `Kn-Kn`, `Tu-Tu`, `Kn-Tu`, `Tu-Kn`, `Tr-Rl`, `Tr-Rr`,
`Rl-Tr`, and `Rr-Tr`, with explicit direction, bed action, carrier-zero,
carrier-1–6, empty-selection, transfer-source, and rack-target behavior. The
parser, projector, and validator consume that same table. The public parser keeps an
explicit dialect label for provenance. Under the current profile, `app` and
`knitout-vendor` are semantic aliases with the same marker-free raster mapping;
Studio therefore applies the canonical `knitout-vendor` label instead of asking
the user to choose between behaviorally identical options.

```text
project/chart
  -> deterministic Knitout
  -> pinned backend lowering + exact scheduled-pass IR
  -> emitted KCode bytes
  -> strict lossless parser
  -> versioned operation/direction/carrier/rack command contract
  -> MachineTraceV1
  -> KCode-native validator + MachineSceneV1
  -> bounded MachineTopologyV1 + schematic MachineTopologyMeshV1
  -> verdict, exact diff, movement/topology views, source/design provenance
```

The browser worker compares every machine-executable scheduled field with the
independently parsed trace. `sourceLines` and `isAutoMove` are backend-only side
channels. `comment` is serialized as inert KCode prose, preserved by lossless
parsing, and deliberately excluded from movement/state equivalence. Studio
fail-closes if scheduled source lines or their claimed design rows cannot be
projected onto parsed Knitout operation lines and stable design rows. Studio
does not assume preview pass N equals emitted pass N.

Foreign Knitout follows the same machine-facing rail: pinned lowering, strict
parse of the emitted KCode, MachineTrace projection, loop/kinematic replay, and
scheduled-pass differential. A syntactically valid `.k` file cannot earn a clean
verdict by bypassing its lowered output.

The same rail is available headlessly through
`pnpm machine:check -- <file.k|file.kc>`. The command reads accepted input once
as bytes, preserves direct KCode bytes, returns Studio's conservative foreign
verdict, and exits nonzero for warning-only blockers. Its bounded JSON receipt
includes the input SHA-256 and format-evidence disclosure without embedding
source or emitted KCode. Use `pnpm --silent machine:check -- <file> --json` when
stdout must contain JSON only.

Pass and row metrics preserve their evidence boundary. Authored projects retain
stable design-row identity through typed provenance and label the strict output
as emitted machine passes. Foreign `.kc` and `.k` files have no authored-row
identity: their successful strict trace reports total programmed passes and the
subset containing at least one knit, tuck, or split action as **loop-forming
passes**. Split counts even though it belongs to the transfer operation family;
carrier-0 drop and repositioning passes do not. When trace projection is
unavailable, the foreign pass metrics are unavailable rather than inferred from
operation names or called rows.

The strict trace also produces an exact **programmed stop-coordinate travel**
sum. Its adjacent distance/time model is deliberately weaker: it assumes one
encoded stop-coordinate unit equals the profile's officially documented 3.63
mm needle pitch and assumes each pass's encoded speed is constant mm/s. The
time term is summed per pass, not from one aggregate speed. A nonpositive or
non-finite speed on any contributing pass makes that term unavailable. Studio
and the checker label the result assumption-derived—not physical travel,
elapsed duration, or a physical lower bound—and keep it separate from the
authored plan heuristic. The physical-trial manifest binds both terms to the
same exact candidate; one observed run may yield only a candidate-specific
residual, not a universal multiplier.

For clean foreign files, the same strict trace can also feed the independent
`MachineTopologyV1` projector. It records stable loop identities, formed-
through/tuck/yarn-continuity connections, transfer movements, rack anchors,
carrier chains, and final stacks. A second deterministic transform produces a
schematic mesh in normalized trace/pass space. Studio runs the transforms in a
module Worker with explicit 6,000-loop and 18,000-edge/movement limits, and
withholds the view for a Blocked file or any failed/over-limit projection. The
mesh contract and visible disclosure state that this is software topology, not
physical stitch geometry or knitted-fabric appearance.

## Deterministic gate

Regenerate the deterministic receipt explicitly from the repository root:

```bash
pnpm verify:kcode
```

`pnpm verify:kcode:check` runs the same gates without rewriting evidence and
fails unless the tracked receipt already has the exact expected bytes. The full
`pnpm verify` and CI paths use this read-only form, as well as the read-only
physical-registry and conformance-report checks.

The command runs the exact machine-library and Studio proof-test lists, their
strict TypeScript checks plus the checker entrypoint typecheck, the KCode-native
refusal corpus, the named-rule
witness ledger, source mutation testing, a Studio production build, and audits every reference
KCode file, and writes a deterministic receipt to:

```text
packages/machine-lib/out/kcode-proof/proof-manifest.json
```

In writer mode, a plain-JavaScript preflight removes any prior receipt before
the TypeScript proof harness is parsed. The harness writes both successful and
final blocked results through a temporary file plus atomic rename, and the
preflight supplies an atomic blocked fallback if the harness cannot load. Check
mode preserves the tracked receipt and fails on missing, stale, or blocked
evidence.

The harness independently inventories and fingerprints the complete proof input
immediately before and after its gates, including every reference KCode byte.
Any addition, removal, or byte change observed between those snapshots blocks
the receipt. Release evidence is closed by running the writer on a stable tree
and then the read-only check; the check also rejects edits made in the narrow
process-start or final-rename windows outside the paired gate snapshots.

The receipt fingerprints the profile/parser/trace/validator/diff/backend,
public barrels, generated browser backend, Studio integration dependencies,
the chart/project/colorwork workspace dependencies, proof harness and tests,
package scripts, lockfile, and TypeScript/Vite config.
It also records the Node/pnpm/platform toolchain, fixed property-test seeds,
commands, reference hashes, byte/pass/action totals, validation counts, the
profile/operation-contract/oracle hashes, the 1,904-case matrix ledger, all
named rule witnesses, and normalized mutation counts. It
contains no timestamp, so the same fingerprinted inputs and toolchain produce
the same receipt.

## Software claims

The gate establishes:

- lossless one-byte/one-code-unit intake and exact byte re-emission for every
  input within the documented byte ceiling; larger byte arrays remain
  caller-owned, are never decoded, and the emitter refuses them explicitly;
- fail-closed, named resource profiles. Foreign input keeps the conservative
  envelope: Knitout is limited to 64 Mi code units, 250,000 records, 16,384
  code units per record, 4,096 source-scheduled/emitted passes, and 200,000
  emitted selected cells; foreign Knitout conversion also refuses before
  50,000 emitted KCode records. KCode intake is limited to 64 Mi code units,
  100,000 materialized records, 8,192 footer/pass records, 2 Mi code units per
  record, and 200,000 selected cells per exact trace. Both KCode intake labels
  share that record ceiling because KCode has no reliable in-band origin and
  an authored export must reopen through the normal import path. Project-derived
  compiler output uses the fixed `authored-v1` envelope: 600,000 Knitout
  records, 8,192 passes, 200,000 selected cells, and 100,000
  emitted/materialized KCode records. The
  authored KCode ceiling covers the serializer's proved maximum of 12 records
  per pass plus three headers. Studio projects are admitted before
  replay/compile under a separate bounded 252-needle by 300-row document
  contract. Local machine
  files over 64 MiB and project files over 16 MiB are refused before
  `arrayBuffer()` / `text()`. Each validation layer retains at most 512 detailed
  diagnostics while exact omitted error and warning totals remain separate;
  within-limit rejected bytes stay retained for audit and exact KCode
  re-emission;
- strict grammar, record ordering, field widths/alphabets, stop markers,
  footer types, rack values, and rejection of unknown or truncated content;
- exhaustive agreement with an independent, production-import-free legality
  oracle over 8 operations × 2 directions × 7 carrier tokens × 17 rack values
  (1,904 cases), exercised through both Node modules and the browser entrypoint;
- boundary partitions for empty, front-only, rear-only, both-bed, left/center/
  right, selector 0/15, paired/unpaired transfer, marker placement, stop
  containment, and pass continuity;
- deterministic pinned lowering across repeats, cross-document call ordering,
  and the public two-stage API;
- one-file `.k`/`.kc` preflight with Studio-equivalent verdicts, exact input
  SHA-256, bounded human/JSON diagnostics, explicit lifecycle/differential
  evidence, and exit `0` only for `Surface-proven (imported)`;
- exact authored-candidate coordinate evidence from the pinned backend's actual
  placement through marker-free KCode columns and normalized trace coordinates,
  hash-bound to the emitted KCode and tested for both physical endpoint
  orientations without claiming those endpoints were observed;
- exact agreement between every machine-executable scheduled field and parsed
  KCode;
- cross-section agreement between predicted planning passes and the pinned
  backend where that planning prefix is defined, plus independent Fairisle
  footer-equivalence and Kniterate topology-policy oracles;
- programmed carriage/carrier stops and continuity, selections, traversal
  order, transfer pairing, rack geometry, and action semantics;
- empty-bed loop-state replay for knit, tuck, drop, transfer, and split;
- a shared conservative software loop-stack policy (warning above two loops,
  error above three) used by planning and KCode replay;
- full-raster KCode diffing rather than footer-only comparison;
- deterministic renderer input for synchronized carriage, guide, two beds,
  actions, and before/after loop counts;
- fail-closed loop-identity topology and bounded schematic-mesh projection
  across knit, tuck, racked transfer/split, drop, both beds, and both current
  dialect labels, without synthesizing carrier lifecycle or physical fabric
  facts;
- fail-closed execution of the checked-in known-bad machine-safety refusal
  corpus and the separate raw-KCode command refusal corpus, with every named
  parser and command-validation rule tied to an executed witness; and
- zero surviving, timed-out, uncovered, compile-error, runtime-error, or pending
  in-scope generated source mutants in the parser, trace projector, machine
  validator, and scheduled-trace differential. Diagnostic-prose exclusions and
  reviewed equivalent mutants must be locally reasoned and receipt-fingerprinted;
  anonymous or global exclusions block the gate; and
- byte-identical distribution of the vendored converter's MIT notice in the
  production Studio build.

The proof includes 2,000 valid-document round trips, 5,000 grammar-critical
input mutations, 1,296 exhaustive depth-four action sequences, 96 seeded varied
backend programs with more than 1,000 scheduled passes, and 13 reference KCode
fixtures parsed under the canonical V1 dialect label without inferring their
external producer, totaling 25,111,478 bytes, 20,568 passes, and 710,063
actions.
All reference files have zero validation errors. The corpus retains 220
conservative depth-three loop-stack review warnings across five fixtures, plus
183 model-observed empty-cleanup warnings in two late `fox-baby-beanie.kc`
cleanup sweeps. Empty-bed replay observes no modeled loop-state change for
those drops, but their operational machine consequence is unverified; empty
transfer/split remains an error. The shared validator and proof receipt retain
the depth-three observations as conservative warnings. At the foreign Studio
boundary, those specific observations are presented as non-blocking
informational evidence because five captured references establish that a brief
three-stack occurs repeatedly in the checked-in corpus. Those bytes do not
establish their external producer or a physical loop-stack limit; this remains
a narrow product presentation policy. The error above three loops is unchanged.
Every other unresolved foreign warning remains blocking.
The resulting Studio import verdicts are 12 Surface-proven and one Blocked:
`fox-baby-beanie.kc` remains blocked by its 183 empty-drop warnings. None of the
13 fixtures is blocked by a validation error. This is a software product policy,
not an established physical loop-stack limit.

The mutation rail keeps the existing grammar/input mutations and adds
StrykerJS 10.0.0 implementation-source mutation scoring with the Vitest runner,
fixed tests, concurrency one, and deterministic normalized evidence at
`packages/machine-lib/out/kcode-proof/mutation-manifest.json`. Diagnostic prose
string mutations may be excluded only at diagnostic-prose sites; rule
identifiers, severities, control flow, conditionals, arithmetic, boundaries,
and collections remain in scope. Equivalent-mutant suppressions must be
reviewed next to the affected code with a reason. Both exclusion classes are
normalized and fingerprinted in the receipt.

## Explicit non-claims and opportunities

Software proof does not turn encoded commands into a physical-knit claim.

1. **Physical needle labels are unverified.** Authored candidates now retain the
   pinned backend's exact placement offset and a hash-bound bridge from
   compiler/project endpoints to marker-free KCode columns and normalized trace
   coordinates. The 253-column serialized frame versus 252 physical needles
   still needs the documented two-endpoint machine observation before the UI
   labels a trace coordinate as a physical needle number. Direct foreign KCode
   has no authored-coordinate provenance and cannot inherit this bridge.
2. **Operational safety envelopes are incomplete.** Official/editor bounds are
   recorded separately from encodable values. The shared two/three-loop
   thresholds are a conservative software policy, not a physical-safety claim;
   safe speed, signed roller, and operational loop limits still require
   authoritative evidence.
3. **Foreign KCode lacks carrier lifecycle.** KCode does not encode Knitout
   `in`/`out`; authored compilation retains source provenance, while a foreign
   file cannot prove carrier threading lifecycle from KCode alone.
4. **Programmed motion and schematic topology are not dynamics or fabric.** The
   validator proves encoded stops, continuity, reach, ordering, and aggregate
   empty-bed loop-state transitions. The separate topology projector proves its
   deterministic software graph under that assumption, and the motion receipt
   adds an exact encoded-coordinate total plus clearly labelled pitch/speed
   assumptions. Neither models momentum, yarn friction, collision tolerances
   absent from the format, stitch geometry, drape, or resulting fabric
   mechanics.
5. **Lowering is pinned, not clean-room.** Studio now makes the vendored backend
   deterministic and auditable. A future native pass scheduler/lowerer could be
   built behind the same scheduled-pass contract and differentially tested
   against both the pin and captured references.
6. **Dialect provenance is external metadata.** The file format does not carry a
   reliable origin tag. The current profile's two origin labels currently have identical
   movement semantics, so Studio canonicalizes the label. A signed or sidecar
   artifact manifest would still be required to establish who produced bytes
   created outside Studio.
7. **Official documents do not establish physical motion from tokens.** The
   [official KCode 1.0 specification](https://drive.google.com/file/d/1KFiS1Crfaqba8t1vhqk2IqthqDSTyqKS/view)
   defines the serialized `Tr`/`Rr`/`Rl` modes, while the
   [machine manual](https://support.kniterate.com/hc/en-us/article_attachments/360009817198)
   describes bed-transfer direction differently.
   Profile V2 explicitly makes the official KCode specification authoritative
   for serialized logical commands. It does not use either document to infer a
   controller-observed physical direction: that interpretation remains
   unresolved and is carried as an operational-assurance limitation.

## Controller-observed evidence

`release:trial` first requires the complete read-only KCode gate, then adds
`command-legality.json` and `CONTROLLER-REVIEW.md` to the clean exact-artifact
package. They bind the profile, contract, proof receipt, KCode hash, pass count,
present command combinations, and the seven-value compiled initial-settings
receipt, with `controllerObserved: pending` and operational setting safety
unverified. The operator must compare the loaded recipe independently; the
physical-registry gate blocks a mismatch, deviation, or intervention. One clean
recipe still cannot establish a general operating envelope.

Kniterate's [start-up guide](https://support.kniterate.com/hc/en-us/articles/18230075945885-Start-up-guide)
documents that `.kc` cannot be imported into its design app. The
machine reads the exact `command.kc` transfer copy from SD card, so Studio does
not claim an automated controller-only dry run. A clean, complete,
non-deviated, current registry entry can contribute controller-observed coverage
only after `out.kc` is independently reparsed and revalidated. Coverage is
aggregated by machine serial and control-software version; partial, aborted,
edited, failed, or stale runs remain history and contribute no accepted claim.

The real-machine procedure in `V1-PHYSICAL-TRIAL.md` remains the separate final
acceptance gate. Its result may promote one exact hash-pinned artifact to
Knit-proven; it is not used to make the parser, compiler, or simulator pass.
