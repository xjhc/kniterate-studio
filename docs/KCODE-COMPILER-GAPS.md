# KCODE-COMPILER-GAPS — verified baseline and gap register

**Evidence class: local software only.** Measured 2026-08-29 against the working
tree at `accumulate` / `cff1d6e`, using `packages/machine-lib`'s public API, with
the tree left unmodified. No deployed-browser evidence and no physical-machine
evidence is claimed anywhere in this document.

Written against two external reference points: Agnes Cameron's knitout-js
cheatsheet and Local First workshop notes
(`soup.agnescameron.info/2026/04/09/cheatsheet.html`,
`.../2026/07/09/local-first.html`), and the Customist Studio 2.5 release notes
and changelog (`kniterate.com`, `editor.kniterate.design/changelog`).

---

## Finding

**The compiler exists. The gaps are at its edges, not its centre.**

`packages/machine-lib` already contains a strict lossless KCode parser, an exact
machine-movement projection, a 43-rule kinematic and loop-state validator, a
renderer contract, and a knitout front end that lowers through the pinned vendor
backend. The full reference corpus and a set of deliberately malformed files were
run through it; nothing slipped past.

What is missing is everything *around* that core: no way to run it without a
browser, no motion model, no picture of the fabric, and no bridge from a KCode
column to a physical needle.

---

## 1. Verified baseline

| Metric | Result |
| --- | --- |
| Reference `.kc` files that parse, trace, validate and project a scene | 13 / 13 |
| Validation errors across the corpus | 0 |
| Full chain on the largest file (`sophie.kc`, 4.4 MB, 3,766 passes) | ~0.63 s |
| Hostile mutations caught | 14 / 14 |
| Distinct rules | 87 (30 parser + 43 machine + 14 knitout) |

### 1.1 Corpus timings

Parse → `projectKCodeMachineTrace` → `validateKCodeMachineTrace` →
`projectMachineScene`, `resourceProfile: 'foreign-v1'`, `dialect: 'app'`.

| File | Passes | Parse | Trace | Validate | Scene | Errors | Warnings |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `fairisle.kc` | 286 | 27 ms | 31 ms | 26 ms | 6 ms | 0 | 0 |
| `fox-baby-beanie.kc` | 220 | 22 ms | 30 ms | 36 ms | 10 ms | 0 | 183 |
| `jacquard.kc` | 350 | 28 ms | 33 ms | 37 ms | 11 ms | 0 | 0 |
| `swatch.kc` | 364 | 31 ms | 38 ms | 48 ms | 11 ms | 0 | 0 |
| `color-swatch-bindoff.kc` | 458 | 44 ms | 37 ms | 28 ms | 8 ms | 0 | 0 |
| `dbj.kc` | 498 | 46 ms | 42 ms | 58 ms | 17 ms | 0 | 0 |
| `2x2-rib-beanie.kc` | 530 | 49 ms | 41 ms | 89 ms | 28 ms | 0 | 1 |
| `sleeves.kc` | 1,994 | 139 ms | 99 ms | 146 ms | 41 ms | 0 | 68 |
| `back.kc` | 2,108 | 153 ms | 125 ms | 278 ms | 66 ms | 0 | 82 |
| `front.kc` | 2,544 | 167 ms | 155 ms | 226 ms | 70 ms | 0 | 64 |
| `sophie2.kc` | 3,716 | 252 ms | 153 ms | 175 ms | 44 ms | 0 | 0 |
| `sophie_stripe.kc` | 3,734 | 246 ms | 144 ms | 163 ms | 32 ms | 0 | 0 |
| `sophie.kc` | 3,766 | 273 ms | 156 ms | 118 ms | 86 ms | 0 | 5 |

This matches the split recorded in `STATUS.md` (12 Surface-proven, 1 Blocked on
`fox-baby-beanie.kc`'s 183 empty-drop warnings).

### 1.2 Hostile probe

Each mutation applied to a known-good `fairisle.kc` so only the field under test
changes.

| Mutation | Caught at | Rule that fired | Rule source |
| --- | --- | --- | --- |
| `RACK:5` (beyond ±4) | parse | `kcode.invalid-rack` | documented envelope |
| `RACK:0.25` (breaks 0.5 step) | parse | `kcode.invalid-rack` | cheatsheet rule |
| carrier `7` in footer | parse | `kcode.footer-carrier` | cheatsheet rule |
| stitch selector `G` (above `F`) | parse | `kcode.field-charset` | KCode 1.0 alphabet |
| `Zz-Zz` operation token | parse | `kcode.footer-operation` | 8-operation contract |
| remove `HOME` | parse | `kcode.rack-order` | document grammar |
| remove initial `RACK:0` | parse | `kcode.missing-initial-rack` | document grammar |
| flip pass 1 direction | validate | `carriage-discontinuity` + `carrier-discontinuity` | kinematic |
| `Kn-Kn` → `Tr-Rl` on a `>>` pass | validate | `transfer-operation-direction` (+65 more) | operation contract |
| 4 stacked tucks | validate | `loop-stack-policy` × 32 warnings | cheatsheet: max 2 tucks |
| 10 stacked tucks | validate | `loop-stack-policy` × 128 errors + 126 warnings | cheatsheet: max 2 tucks |
| speed `5000` | validate | `setting-documented-range` × 1 warning | advisory only — see gap 06 |
| roller `-9999` | validate | `setting-documented-range` × 1 warning | advisory only — see gap 06 |

The loop-stack ladder escalates exactly as
`KNITERATE_LOOP_STACK_SOFTWARE_POLICY_V1` specifies (`warningAbove: 2`,
`errorAbove: 3`), which is the software expression of the cheatsheet's "don't put
more than two tuck stitches on top of each other".

### 1.3 Hand-written knitout, end to end

A 688-op knitout program was written by hand in exactly the idiom the cheatsheet
teaches — `in 3`, an alternating tuck cast-on, ten stockinette rows, racked rib
transfers at `rack 0.5`, drops, `out 3`, needles 50–89.

| Stage | Result |
| --- | --- |
| `parseKnitoutProgram` | 688 ops, 0 issues |
| `validateKnitoutProgram` | clean |
| `knitoutToKCodeWithTrace` (pinned backend) | ok, 40 scheduled passes, 3 informational warnings |
| Emitted KCode strict parse | ok, 40 passes |
| `validateKCodeMachineTrace` | 0 errors, 0 warnings |

**The route the articles describe — write it in JS or knitout, then check it
before it touches the machine — already works end to end in this repo.**

---

## 2. Coverage against both toolchains

The knitout-js chain is JavaScript → Knitout → KCode. Studio's chain is Chart →
Knitout → KCode. They converge from the knitout stage onward and share every
downstream guarantee, which is why the gaps cluster at the two ends.

| Stage | knitout-js (the articles) | Studio (this repo) |
| --- | --- | --- |
| Author | JavaScript | Chart only — **no JS surface (gap 05)** |
| Knitout | `.k` emit | parse · IR · emit, 14 validator rules |
| KCode | `.kc` emit | strict parse, 30 rules, byte-exact round trip |
| Trace | — | `MachineTraceV1`, exact |
| Validate | author's own concern | 43 rules in 4 classes |
| Render | CMU visualiser (fabric) | movement yes, **fabric no (gap 03)** |
| Run | unchecked bytes | physical trial pending |

---

## 3. Gap register

Ranked by what each one unblocks per unit of work, not by size.

### 01 — No headless check command

**Size: small · Class: software**

The entire compiler is reachable only by dropping a file into the browser
workspace or by running a workspace-wide `pnpm` script. No workspace
`package.json` declares a `bin`, and none of `packages/machine-lib`'s 22 scripts
accept a single file path — `verify:kcode` and `kniterate:conform` operate on the
fixed corpus, not on an arbitrary file.

So the exact motion the articles describe — a model writes a `.k` or `.kc`, and
you check it before it goes near the machine — has no one-line form.

Every part already exists and is already public API. This is a wrapper around
`parseKCodeDocument` → `projectKCodeMachineTrace` → `validateKCodeMachineTrace`
that takes a path, prints the diagnostics, exits non-zero on error, and offers
`--json`. The probe scripts written for this document are effectively that
wrapper, written three times.

**Unblocks:** CI, pre-flight checks, model-generated files, other people's tools.

### 02 — No motion model, though the trace already carries every input

**Size: small–medium · Class: software, calibrated by one physical run**

Each `MachineTracePassV1` holds `carriageStops.left`/`right` in needle units and
`speed` in mm/s. Nothing multiplies them.

The only estimate in the product is `compile-chart.ts:989`:

```ts
const estimatedKnitTimeSeconds = Math.round(passesForTime * 10 * speedFactor / 50)
```

Its own comment calls it a "crude wall-clock estimate". It is authored-path only,
blind to carriage travel, and blind to the per-pass speed the file actually
encodes. Imported KCode gets no estimate at all.

The kinematic version, computed over the corpus from fields that already exist,
runs 5–6× the current heuristic:

| File | Passes | Carriage travel | Kinematic | Current heuristic |
| --- | ---: | ---: | ---: | ---: |
| `fairisle.kc` | 286 | 77.3 m | **6 min** | 0.9 min |
| `dbj.kc` | 498 | 149.6 m | **7 min** | 1.7 min |
| `2x2-rib-beanie.kc` | 530 | 235.1 m | **16 min** | 1.8 min |
| `sleeves.kc` | 1,994 | 492.3 m | **28 min** | 6.7 min |
| `back.kc` | 2,108 | 918.7 m | **47 min** | 7.0 min |
| `front.kc` | 2,544 | 972.6 m | **49 min** | 8.5 min |
| `sophie.kc` | 3,766 | 333.0 m | **25 min** | 12.6 min |

The model needs one constant Studio does not yet assert: needle pitch. At 7gg
that is 25.4 / 7 = 3.63 mm, which puts the 252-needle bed at 914 mm — a single
tape measure on the machine confirms or refutes it.

Report it as a floor, not a duration: it excludes acceleration,
direction-reversal dwell, roller time and transfer settling, so the real run is
longer. Calibrating it against the physical trial turns a guess into a measured
constant, and gives the yarn-length estimate for free from the same traversal.

**Unblocks:** run sheet, strategy comparison, yarn estimate.

### 03 — Studio shows how the carriage moves, never what it knits

**Size: medium · Class: software**

The decompiler that would close this is already written. `kcToKnitout`
(`src/knitout/kc-to-knitout.ts`) recovers knit / tuck / xfer / split / drop /
rack and carrier lifecycle from raw KCode — its own header states the goal is
"visualization fidelity" — and it is exported from both `src/index.ts` and
`src/browser.ts` and covered by tests.

**It has zero call sites in `apps/studio`.** The back-face projection that does
exist is wired only to authored artifacts, never to imported files.

This is the one capability the articles hold up as the reason the CMU visualiser
matters: you look at the fabric, not the choreography. Closing it makes no new
machine claim — a stitch mesh is a projection of a trace that has already
validated, so it inherits the existing evidence boundary rather than extending
it.

Path: `kcToKnitout` → loop-stack replay → stitch mesh, as a third side-rail view
beside Pass grid and Pass diff.

**Unblocks:** reviewing foreign files, catching structural mistakes by eye.

### 04 — A KCode column is not yet a needle

**Size: small software · Class: needs one physical observation**

The profile is explicit: `physicalNeedleNumbering.status: 'unverified'`. The
workspace says *K-code 94–157*, not *needle 94–157*, and the validator's
`operationalAssurance` block leads with the limitation.

Two consequences follow:

- A machine movement cannot be stated in the machine's own units.
- The cheatsheet's most basic placement rule — *don't start at needle zero,
  centre your design, try 50* — is unenforceable on the `.kc` path, because
  Studio cannot map a column to a needle to check it. The equivalent rule already
  exists on the knitout side as `no-needle-zero`.

This is cheap to close and it is the last coordinate gap between "exact trace"
and "exact machine movement". One marker pass at a known column during the
physical trial, measured once, fixes the offset for every file thereafter.

**Unblocks:** needle labels, placement rules, operator instructions.

### 05 — Carrier lifecycle is invisible on the `.kc` path

**Size: small (surface the asymmetry) · Class: format limit — not closable**

KCode does not encode `in` or `out`. So `carrier-active`, `carrier-in-twice`,
`carrier-out-without-in` and `carriers-trailing-at-end` — the rules that enforce
the cheatsheet's warning that taking a carrier out mid-program "can cause issues"
— only fire when a `.k` file is imported. The profile declares this correctly as
a boundary rather than pretending otherwise.

The underlying limit cannot be closed; the format simply lacks the information.
But it means **importing knitout is strictly safer than importing KCode**, and
nothing in the product currently says so. For model-generated files that
asymmetry is the single most useful thing to tell the user: hand Studio the `.k`,
not the `.kc`.

### 06 — Speed and roller have no proven envelope

**Size: measurement, not code · Class: physical**

The profile records the conflict honestly rather than papering over it: the
specification says 800 mm/s, the manufacturer's own FAQ says the current maximum
is 0.4 m/s, and no signed roller bound is documented at all. Both settings
therefore carry `operationalBounds` of `null` and only advisory range checks
fire. In the probe, speed `5000` and roller `-9999` each produced exactly one
warning and no error.

That is the correct behaviour for software that refuses to invent limits — but it
does mean a generated file can encode a physically implausible setting and still
reach Surface-proven. It belongs on the trial checklist as an observation to
make, not as a rule to guess at.

### 07 — Passes are counted; rows are not

**Size: small · Class: software · Parity: Customist 2.5**

Studio reports "286 passes". A knitter thinks in rows, and a transfer pass is not
a row. Customist Studio 2.5 shipped a fix for precisely this — its changelog
entry reads *"Stitch and Row Counter: counts only knitting rows, ignoring
transfer rows."*

The authored path already carries typed design-row provenance; foreign files
carry none, but transfer passes are trivially separable, since the operation
contract already tags `Tr-Rl`, `Tr-Rr`, `Rl-Tr` and `Rr-Tr` with
`family: 'transfer'`.

---

## 4. What was not counted as a gap

Most of Customist Studio 2.5 is a garment-design release, not a compiler release:
the template wizard, multi-panel editing, body measurements and ease, rib fills,
DXF/SVG shape import, per-panel undo. Those are chart-product features, and this
repo deliberately puts chart product on the other side of a boundary — Studio
owns strategy, validation, verdicts and machine files; KnitLab Chart owns
authoring, with `ColorworkChartV1` plus PNG as the interchange. Chasing them
would be scope drift, not parity.

Two items from that release *are* compiler-adjacent and are worth logging as
vendor intelligence rather than gaps:

- **Knittability checks.** Customist validates garment measurements against
  machine limits before shaping — the same instinct as this validator, applied
  one layer up.
- **Revised transfer defaults.** Increase transfers moved to speed 120, roller 0,
  stitch 0 (from 300 / 30 / 3). That is concrete vendor knowledge about safe
  transfer settings that `src/knitout/recipes/` does not currently encode.

### One caution about the direction itself

The Local First notes record that workshop participants generated KCode directly
with a model, and that the authors preferred the JavaScript route because "errors
risk damaging machines". Everything in gaps 01 and 05 points the same way: the
value here is not a better generator, it is a checker sitting between a generator
and a machine. Studio already is that checker. It mostly needs a door that is not
a browser.

---

## 5. Suggested sequence

1. **Gap 01 — the check command.** Smallest change, largest reach. It turns a
   browser tool into something CI, a script, or a model-driven loop can call.
   Nothing else on this list changes what the compiler knows; this changes who
   can ask it.
2. **Gap 02 — the motion model.** Pure derivation from fields the trace already
   has. Ship it labelled as a floor, then calibrate the pitch constant and the
   overhead factor on the trial run.
3. **Gaps 04 and 06 — the two physical observations.** Add a needle-marker pass
   and a speed/roller note to the operator checklist in `V1-PHYSICAL-TRIAL.md`
   before the run, so one machine session closes both. Neither is worth a second
   trial on its own.
4. **Gap 03 — the fabric view.** The largest piece of work, and the one that most
   changes how the tool feels. Worth doing properly rather than early.
5. **Gaps 05 and 07 — the honesty and legibility fixes.** Say that `.k` import is
   safer than `.kc` import; count rows as well as passes.

---

## Scope note

This document is analysis only. No engine, validator, profile or UI code was
changed to produce it, and none of the gaps above are implemented. The kinematic
figures in gap 02 are a derived prediction, not a measurement, and the needle
pitch they rest on is an unverified assumption until the physical trial confirms
it.
