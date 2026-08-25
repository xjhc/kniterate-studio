# Swatch Registry

Per-physical-knit ledger of what we sent to a real Kniterate, what came off,
and what we measured. Designed to be the load-bearing record between
"valid knitout" and "physically good knitting" — see plan §6.6, and the
school-gap doc's P0 #2 (swatch / settings registry before more export
formats).

The registry is the source of truth for:

- which `x-stitch-number` / `speedNumber` / `rollerAdvance` values worked
  for a given yarn + structure + gauge target
- measured gauge after rest / steam / wet-finish (the school's "Tension
  Swatch" foundation — every cast-on, shaping row, and garment dimension
  decision depends on this number)
- known-bad combinations (cone X jams at stitch number 5, takedown skips
  at speed > 200 on 4-ply, etc.)
- whether a specific compile output knit cleanly end-to-end

## Layout

```
registry/swatches/
  README.md                           ← this file
  _template/                          ← scaffolding template; do not edit
    spec.json                         ← compile provenance + the KniteratePlan
    request.json                      ← saved source request (command text is historical only)
    out.k                             ← knitout emitted (commit verbatim)
    out.kc                            ← kcode the machine ran (commit verbatim)
    machine.json                      ← exact machine/program settings and carrier links
    yarn.json                         ← yarn identity, lot, and structured tension evidence
    run.json                          ← authoritative outcome and run observations
    photo-front.jpg                   ← (gitignored at commit, kept locally)
    photo-back.jpg                    ← (gitignored at commit, kept locally)
    outcome.md                        ← explanatory narrative only
  <YYYY-MM-DD>-<short-name>/          ← one entry per physical knit
    ...
```

Each entry name is `<ISO date>-<short-kebab-name>` so the directory listing
sorts chronologically. Short-name should be descriptive enough to skim
("2-color-test", "raglan-front-rib-cuff", not "swatch7").

## Required fields

`machine.json` — what actually ran: machine/control versions, profile, compiler
coordinate range, gauge/position/frame settings, all initial machine-effective
settings, carrier-to-yarn links, and deviations. The checker compares every
compiled setting and carrier with a fresh current compile. Record deviations
honestly; a well-formed deviated run remains useful history but cannot support
an exact-artifact Knit-proven claim.

`yarn.json` — one cross-linked yarn record per loaded carrier, including brand,
line, lot, fiber, weight, ply, color, and cone source. Each tension stage is
explicitly `measured` with stitches/rows per 10 cm or `not-performed` with a
reason. All four stages must be measured for promotion.

`run.json` — the sole structured run authority. `outcome` is exactly one of
`clean`, `dropped`, `jammed`, `aborted`, or `partial`. It records the loaded
KCode hash and displayed pass count, manual program edits, physical-placement
verification, interventions, section observations, stops, dimensions, and six
photo receipts. `outcome.md` explains what happened but never supplies proof by
prose parsing.

The coordinate range in generated artifacts is always labeled
**compiler/project coordinates; physical needle labels unverified**. Before a
machine run, an operator must resolve it to physical labels using a documented
machine/vendor datum procedure and a different person must verify and record
that mapping in `run.json`. An unverified placement is a hard promotion block.

## Evidence invariants and limits

All date-times must be valid RFC 3339 with an explicit zone: for example,
`2026-08-25T14:03:00Z` or `2026-08-25T07:03:00-07:00`. A local timestamp with
no `Z` or numeric offset is invalid. Fractional seconds are allowed.
`yarn.json.tensionSwatch.measuredOn` is the one date-only field and must be a
real `YYYY-MM-DD` calendar date.

The checker enforces these cross-record chronology rules:

- `run.json.endedAt` must be at or after `startedAt`.
- `machine.json.ranAt` must fall within that inclusive run interval.
- A verified physical placement must have been verified no later than
  `startedAt`; its verifier must differ from the run operator.
- Off-machine dimensions must be measured at or after `endedAt`.
- Rested dimensions must be measured at least 24 hours after `endedAt` and
  must not precede the off-machine measurement.

Compiler and physical coordinate starts must not exceed their ends. For a
verified placement, the absolute physical needle span must equal the compiler
coordinate span; reversed physical numbering is allowed because the physical
origin and direction remain independently observed. Stop and intervention
`passIndex` values are zero-based, nonnegative, or `null` when unknown. A known
index must be below the freshly emitted pass count and, if the displayed count
differs, below that count as well. A displayed-count mismatch blocks promotion.

Within a record, yarn carriers and deviation field paths are unique. Photo
receipts must have unique view names, resolved paths, and hashes. Photo paths
must be relative to the swatch entry: absolute paths, drive-qualified paths,
empty or `.`/`..` components, and paths that escape the entry are rejected.
The six promotion views are `front`, `back`, `cast-on`, `left-edge`,
`right-edge`, and `bind-off`. Photo bytes may be absent from a clone, but when
present every path component must avoid symbolic links, the target must be a
regular file, and its bytes must match the receipt hash.

Collection limits are deliberately finite so malformed evidence cannot turn a
registry check into unbounded work:

| Collection | Maximum |
| --- | ---: |
| Registry entry directories | 256 |
| Scanned registry directory entries | 1,024 |
| Retained registry intake diagnostics | 512 |
| Machine carriers | 6 |
| Yarn records | 6 |
| Deviations from compile | 256 |
| Manual interventions | 4,096 |
| Machine stops | 4,096 |
| Photo receipts | 32 |
| Request input files | 64 |

The six unique photo-view enum values make six the practical maximum for a
valid run even though the defensive collection ceiling is 32. JSON evidence is
also capped at 64 nesting levels, 100,000 traversed values, and 2,048 properties
in any one object.

Per-file limits are checked before evidence is parsed or hashed:

| Evidence | Maximum size |
| --- | ---: |
| Each JSON file (`spec`, `request`, `machine`, `yarn`, `run`, project, or chart) | 8 MiB |
| `outcome.md` | 1 MiB |
| `out.k` | 16 MiB |
| `out.kc` | 24 MiB |
| Each locally present photo | 32 MiB |

Registry entries must be ordinary directories. Required evidence and supported
source inputs must be ordinary files; symbolic links are rejected. Local photo
paths may include subdirectories, but neither a parent component nor the photo
itself may be a symbolic link. These constraints apply equally to historical
failures and promotion candidates.

The registry root and `_template` must also be ordinary directories. The root
must remain a direct child of its resolved parent; a `swatches` symbolic link
cannot redirect validation outside that parent or authorize a manifest write.

## Creating a new entry

```sh
pnpm release:trial
pnpm release:register -- <short-name>
```

The second command copies the exact v1 trial artifacts and their hashes into
`<today>-<short-name>/`, then scaffolds the physical fields from `_template/`.
Edit `machine.json`, `yarn.json`, `run.json`, and `outcome.md` as you go through
the physical knit. A recorded re-emit status may document what an operator did
at the time, but it is never accepted as currentness proof. Commit when the
entry is complete.

## What goes in vs stays out

**In:** `spec.json`, `request.json`, `out.k`, `out.kc`, `machine.json`,
`yarn.json`, `run.json`, and `outcome.md`. Small text files; commit verbatim.

`spec.json` must record the emitter commit, artifact hashes, and compiler
fingerprint. The request's `reemitCommand` and `spec.reemitCheck.status` are
historical notes only: registry and release tools never execute the stored
command or trust the caller's status.

For the supported `kniterate-studio-project` request kind, the registry checker
loads the fixed `project.kniterate-studio.json`, compiles it through the pinned
Studio compiler in-process, re-emits KCode through the pinned backend, and
byte- and hash-compares both current outputs with `out.k` and `out.kc`. If this
does not reproduce exactly, the entry remains a structurally valid historical
record but is marked **stale** and cannot appear in the Knit-proven manifest.
Unsupported request kinds likewise cannot support a current-output claim.
Before project-contract parsing or replay, a shallow fixed budget limits each
base/checkpoint chart to 252 by 300 and 75,600 actual cells, history to 256
entries and eight checkpoints, aggregate stored chart cells to 750,000,
variable edit payloads to 200,000 items, and simulated replay work to 20,000,000
cell visits. Row IDs, palettes, yarn assignments, overrides, and every
intermediate edit dimension are also capped. This admits the 200 by 300 Studio
default while rejecting tall or history-heavy projects before compilation can
amplify a small JSON file into unbounded work.

A well-formed failed, jammed, aborted, partial, stopped, intervened, or deviated
run does not fail the registry software rail. It remains a valid historical
entry and is explicitly excluded from `registry/knit-proven.json`. Promotion
requires a clean exact artifact, exact current settings/carriers, no deviations,
stops, interventions, or manual program edits, independently verified physical
placement, complete measurements/inspections/dimensions, and all photo receipts.

The registry writer compares `compilerFingerprint` to a shared fingerprint of
the complete V1 trial compiler closure: machine-lib source, chart/project
contracts, Studio `compileProject`, the trial builder, and repository package,
lock, workspace, runtime, and TypeScript configuration files. It also verifies
the recorded SHA-256 identities against `out.k` and `out.kc`, then writes
`registry/knit-proven.json`. After an entry is complete, update that tracked
manifest explicitly:

```sh
pnpm --dir packages/machine-lib kniterate:swatches
```

Build, proof, and release paths use the read-only
`pnpm --dir packages/machine-lib kniterate:swatches:check`; it fails if the
tracked manifest is stale and never rewrites repository state. Studio matches
both the compile fingerprint and final k-code hash; a chart that merely looks
similar cannot inherit proof.

Before promoting a release, run `pnpm release:physical-check`. It recompiles and
re-emits the fixed V1 trial in memory at that moment (it does not trust an old
`out/v1-knit-trial/manifest.json`) and fails until those exact current identities
have a clean manual physical-outcome registry match. Software establishes
artifact currentness; the physical result itself always remains a human-recorded
machine-run gate.

**Out:** Photo bytes. They are useful locally but blow up the repo. Keep them
inside the entry directory locally; they are gitignored. Commit their six view,
relative-path, and SHA-256 receipts in `run.json`.

## Anti-goals

- Don't overwrite observed `machine.json` values with compiled values. The
  scaffold is a checklist; any divergence must be recorded as actual evidence.
- Don't promote a swatch entry to "validated" anything. Entries are
  records, not certifications.
- Don't delete or edit a past entry just because it's a failure. The
  failure cases are where the most learning lives.
