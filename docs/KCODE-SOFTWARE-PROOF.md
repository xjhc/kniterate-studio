# KCode software proof

Kniterate Studio treats emitted KCode—not a pre-lowering stitch preview—as the
machine-facing source of truth. This document defines what `pnpm verify:kcode`
proves, how it proves it, and where the evidence boundary remains.

## Fixed target and pipeline

The implemented target is the versioned `kniterate-7gg-kcode@1` profile: a
252-needle-per-bed, six-carrier Kniterate contract. The public parser keeps an
explicit dialect label for provenance. Under profile V1, `app` and
`knitout-vendor` are semantic aliases with the same marker-free raster mapping;
Studio therefore applies the canonical `knitout-vendor` label instead of asking
the user to choose between behaviorally identical options.

```text
project/chart
  -> deterministic Knitout
  -> pinned backend lowering + exact scheduled-pass IR
  -> emitted KCode bytes
  -> strict lossless parser
  -> MachineTraceV1
  -> KCode-native validator + MachineSceneV1
  -> verdict, exact diff, movement view, source/design provenance
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

## Deterministic gate

Regenerate the deterministic receipt explicitly from the repository root:

```bash
pnpm verify:kcode
```

`pnpm verify:kcode:check` runs the same gates without rewriting evidence and
fails unless the tracked receipt already has the exact expected bytes. The full
`pnpm verify` and CI paths use this read-only form, as well as the read-only
physical-registry and conformance-report checks.

The command runs the exact machine-library and Studio proof-test lists, both
strict TypeScript checks, a Studio production build, audits every reference
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
commands, reference hashes, byte/pass/action totals, and validation counts. It
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
- deterministic pinned lowering across repeats, cross-document call ordering,
  and the public two-stage API;
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
- fail-closed execution of the checked-in known-bad machine-safety refusal
  corpus; and
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

The mutation rail mutates proof inputs and grammar-critical KCode fields. It is
not implementation-source mutation scoring and makes no source-mutant survival
claim.

## Explicit non-claims and opportunities

Software proof does not turn encoded commands into a physical-knit claim.

1. **Physical needle labels are unverified.** The exact marker-free KCode column
   and trace coordinate are shown, but the 253-column serialized frame versus
   252 physical needles still needs authoritative mapping evidence before the UI
   labels a column as a physical needle number.
2. **Operational safety envelopes are incomplete.** Official/editor bounds are
   recorded separately from encodable values. The shared two/three-loop
   thresholds are a conservative software policy, not a physical-safety claim;
   safe speed, signed roller, and operational loop limits still require
   authoritative evidence.
3. **Foreign KCode lacks carrier lifecycle.** KCode does not encode Knitout
   `in`/`out`; authored compilation retains source provenance, while a foreign
   file cannot prove carrier threading lifecycle from KCode alone.
4. **Programmed motion is not dynamics.** The validator proves encoded stops,
   continuity, reach, ordering, and loop topology. It does not model momentum,
   yarn friction, collision tolerances not present in the format, or resulting
   fabric mechanics.
5. **Lowering is pinned, not clean-room.** Studio now makes the vendored backend
   deterministic and auditable. A future native pass scheduler/lowerer could be
   built behind the same scheduled-pass contract and differentially tested
   against both the pin and captured references.
6. **Dialect provenance is external metadata.** The file format does not carry a
   reliable origin tag. Profile V1's two origin labels currently have identical
   movement semantics, so Studio canonicalizes the label. A signed or sidecar
   artifact manifest would still be required to establish who produced bytes
   created outside Studio.
7. **Source mutation scoring is not yet a gate.** Add a deterministic
   implementation-source mutation score for the parser, projector, validator,
   and trace differential to quantify whether tests kill injected code faults.

The real-machine procedure in `V1-PHYSICAL-TRIAL.md` remains the separate final
acceptance gate. Its result may promote one exact hash-pinned artifact to
Knit-proven; it is not used to make the parser, compiler, or simulator pass.
