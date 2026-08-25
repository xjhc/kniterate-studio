# KCode software proof

Kniterate Studio treats emitted KCode—not a pre-lowering stitch preview—as the
machine-facing source of truth. This document defines what `pnpm verify:kcode`
proves, how it proves it, and where the evidence boundary remains.

## Fixed target and pipeline

The implemented target is the versioned `kniterate-7gg-kcode@1` profile: a
252-needle-per-bed, six-carrier Kniterate contract. KCode source dialect is
always explicit (`app` or `knitout-vendor`); imports never guess it.

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

The browser worker compares every KCode-encoded scheduled field with the
independently parsed trace. `sourceLines`, `isAutoMove`, and `comment` are
backend-only provenance side channels: they are not serialized in KCode and
therefore are not fields in that differential. Studio fail-closes if scheduled
source lines or their claimed design rows cannot be projected onto parsed
Knitout operation lines and stable design rows. `isAutoMove` and `comment` are
preserved backend annotations, not independently verified KCode facts. Studio
does not assume preview pass N equals emitted pass N.

## Deterministic gate

Run from the repository root:

```bash
pnpm verify:kcode
```

The command runs the exact machine-library and Studio proof-test lists, both
strict TypeScript checks, a Studio production build, audits every reference
KCode file, and writes a deterministic receipt to:

```text
packages/machine-lib/out/kcode-proof/proof-manifest.json
```

A plain-JavaScript preflight removes any prior receipt before the TypeScript
proof harness is parsed. The harness writes both successful and final blocked
results through a temporary file plus atomic rename, and the preflight supplies
an atomic blocked fallback if the harness cannot load.

The receipt fingerprints the profile/parser/trace/validator/diff/backend,
public barrels, generated browser backend, Studio integration dependencies,
proof harness and tests, package scripts, lockfile, and TypeScript/Vite config.
It also records the Node/pnpm/platform toolchain, fixed property-test seeds,
commands, reference hashes, byte/pass/action totals, and validation counts. It
contains no timestamp, so the same fingerprinted inputs and toolchain produce
the same receipt.

## Software claims

The gate establishes:

- lossless one-byte/one-code-unit intake and exact byte re-emission;
- strict grammar, record ordering, field widths/alphabets, stop markers,
  footer types, rack values, and rejection of unknown or truncated content;
- deterministic pinned lowering across repeats, input permutations, and the
  public two-stage API;
- exact agreement between every KCode-encoded scheduled field and parsed KCode;
- programmed carriage/carrier stops and continuity, selections, traversal
  order, transfer pairing, rack geometry, and action semantics;
- empty-bed loop-state replay for knit, tuck, drop, transfer, and split;
- full-raster KCode diffing rather than footer-only comparison;
- deterministic renderer input for synchronized carriage, guide, two beds,
  actions, and before/after loop counts.

The proof includes 2,000 valid-document round trips, 5,000 grammar-critical
input mutations, 1,296 exhaustive depth-four action sequences, 96 seeded varied
backend programs with more than 1,000 scheduled passes, and 13 captured App
KCode references totaling 25,111,478 bytes, 20,568 passes, and 710,063 actions.
All reference files have zero validation errors. `fox-baby-beanie.kc` retains
183 model-observed empty-cleanup warnings in two cleanup sweeps. Empty-bed
replay observes no modeled loop-state change for those drops, but their
operational machine consequence is unverified; empty transfer/split remains an
error.

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
   recorded separately from encodable values, but safe speed, signed roller,
   and loop-stack limits are not asserted without authoritative evidence.
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
   reliable dialect tag, so Studio requires the importer to choose. A signed or
   sidecar artifact manifest would remove that human provenance step for files
   created outside Studio.
7. **Source mutation scoring is not yet a gate.** Add a deterministic
   implementation-source mutation score for the parser, projector, validator,
   and trace differential to quantify whether tests kill injected code faults.

The real-machine procedure in `V1-PHYSICAL-TRIAL.md` remains the separate final
acceptance gate. Its result may promote one exact hash-pinned artifact to
Knit-proven; it is not used to make the parser, compiler, or simulator pass.
