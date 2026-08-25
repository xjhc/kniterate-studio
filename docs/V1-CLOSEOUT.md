# V1 closeout plan

**Status:** written 2026-08-25 against `accumulate` at `7b8b9e49` plus the
uncommitted working tree. Reconcile against `STATUS.md` and the tree before
acting; this file is a plan, not a status authority.

The compiler proof is done and both software gates are green. What remains is
one policy call, one commit, and one real machine run — in that order.

- `pnpm verify` → exit 0
- `pnpm verify:kcode` → exit 0
- 428 tests green on the working tree
- 1 open policy decision, physical trial pending

---

## Context: two formats and one lowering step

Everything in this project sits between two file formats. The gap between them
is the whole product.

### Knitout — the open, machine-independent format

A plain-text instruction format from the CMU Textiles Lab. It says *what to
knit* in neutral terms: one operation per line, each naming a direction, a
needle, and a yarn carrier. It deliberately says nothing about how a specific
machine groups those operations into carriage passes — that is the backend's
job.

```text
x-speed-number 300        ; carriage speed
x-roller-advance 200      ; fabric take-down
x-stitch-number 6         ; stitch size selector
in 6                      ; bring carrier 6 (waste yarn) into work
knit + f50 6              ; knit, rightward, front needle 50, carrier 6
tuck - b51 6              ; tuck, leftward, back needle 51
xfer f50 b50              ; move the loop across the beds
rack 2                    ; offset the back bed by two needles
```

### KCode (`.kc`) — what the Kniterate actually eats

Not a list of stitches: a sequence of **carriage passes**, each drawn as a
fixed-width character raster — one column per needle slot, one block per sweep
of the carriage. This is the machine-facing truth, and it is where Studio does
its proving.

```text
HOME                                     <- carriage returns to datum
RACK:0                                   <- bed offset, stateful across passes
FRNT:..../....6.......______--------______....
STIF:4444444444444444444444444444444444444444
REAR:..../....6.......______________________....
STIR:4444444444444444444444444444444444444444
>> Kn-Kn 6 100 440                       <- the pass footer
```

Excerpt from `packages/machine-lib/reference/fairisle.kc`, columns elided.

| Row | Meaning |
| --- | --- |
| `FRNT` / `REAR` | Per-slot needle selection on each bed. `-` operated, `_` idle, `.` margin. The `/`, `\` and digit glyphs embedded in the row are carriage and carrier **stop markers** — where the hardware starts, stops, and parks. |
| `STIF` / `STIR` | Per-needle stitch-size selectors, one character each (`0`–`9`, then `A`–`Z`). |
| footer | Direction (`>>` / `<<`), cam type (`Kn-Kn` knit, `Tu-Tu` tuck, `Tr-Rr` transfer…), carrier (`0` means none), speed, roller. |
| geometry | 283 columns per row: 15 padding + a 253-column needle domain + 15 padding, against 252 physical needles per bed. That one-column discrepancy is an open evidence question, not a solved mapping. |

### The gap this fills

Kniterate's own design tool compiles *to* `.kc` and cannot read it back, so a
`.kc` file is effectively write-only: once emitted, nothing tells you what it
will actually do on the bed. Studio's bet is that a local-first workbench which
parses that file exactly, replays it pass by pass, and refuses to bless what it
cannot model is worth building. (The vendor-tool claim comes from Kniterate's
published guides and has not been independently verified in this repository.)

### The pipeline

```text
project/chart -> KniteratePlan -> Knitout -> pinned CMU backend
  -> .kc bytes                      <- the deterministic seam
  -> KCodeDocumentV1                strict, lossless, byte round-trip
  -> MachineTraceV1                 exact per-pass actions and stops
  -> validator + movement scene + verdict
```

Everything downstream of the seam renders from emitted bytes, never from a
prediction. The fixed V1 target is one profile: 252 needles per bed at 7gg, six
carriers — C1 draw thread, C2–C5 pattern, C6 waste. The verdict ladder is
exactly three rungs: Blocked, Surface-proven, Knit-proven. Only a byte-exact
match against a physical registry entry earns the third.

---

## Where we are

Local software evidence only — no deployed-browser and no physical-machine
evidence.

| Gate | Result | Detail |
| --- | --- | --- |
| `pnpm verify` | exit 0 | typecheck, tests, conformance, production build |
| `pnpm verify:kcode` | exit 0 | 169 machine + 62 Studio proof tests; receipt regenerates byte-identical at `603b9536…`, 268 files fingerprinted |
| Working tree | 428 pass | 47 files modified, +2,190/−194, typecheck clean — uncommitted |
| Browser e2e | 26 / 39 | Chromium and Firefox green; 13 WebKit failures are launch-only (`libicu74` missing on this host) |
| Default canvas, 4 colours | exports | 200×300 compiles and converts to 5,038 passes; 252×300 refuses at compile with a typed capacity finding |
| Reference corpus import | 7 / 13 | six files blocked on conservative warnings — see the open decision |
| `release:physical-check` | blocked | correct: the registry holds zero entries and no machine run has happened |

```text
corpus    swatch colorsw fairisle jacquard dbj sophie2 sophie_s | 2x2rib back front sleeves sophie foxbaby
verdict     -       -       -        -      -     -       -     |   _     _     _      _       _      _
          <------- Surface-proven (7) ------->                  | <---- Blocked on warnings (6) ---->
```

All thirteen have zero validation **errors**; the six blocked files carry only
warnings.

Three review rounds closed fourteen findings between them, including a false
error that blocked every racked double-bed pass, a crash on the two largest
reference files, a dialect selector that turned out to have no computational
effect, and a scale ceiling that made the default canvas unexportable in four
colours. None of those remain open.

---

## The one open decision (blocks phase 2)

**What a warning should mean on someone else's file.** The shared loop-stack
policy warns when a needle is modeled at three loops and errors at four.
Imports block on *any* unresolved warning, because a foreign file carries no
project context in which a warning could be reviewed and accepted. Those two
rules combine to block six of the thirteen reference files — files produced by
the vendor's own tools that presumably knit fine.

That is either a correct conservative refusal or a threshold that does not
match reality. It is a product-contract call.

- **Option A — leave it.** Honest and conservative: Studio refuses to bless
  what it cannot model safely. Cost: most of the corpus, and most real vendor
  files, cannot reach Surface-proven.
- **Option B — reclassify depth-three observations as informational
  (recommended).** Keep the error at four loops. Five vendor-validated
  references trip depth three, which is evidence that a brief three-stack is
  ordinary in shipped patterns. Smallest change, no new verdict concepts, and
  the corpus opens.
- **Option C — let imports carry reviewed warnings.** Show warnings without
  blocking. Closest to a waiver, which V1 explicitly cut in SYSTEM-DESIGN R6;
  it needs a real review affordance and a persistence story, so it is the
  largest change of the three.

Whichever way it goes, record the reasoning in `KCODE-SOFTWARE-PROOF.md`
alongside the existing non-claims — the thresholds are a software policy and
have never been an established physical machine limit.

---

## Six phases to 1.0.0

These are genuinely sequential: each one gates the next, and phase 5 cannot be
faked, retried on a different artifact, or argued past in prose.

### 1. Land the work already in the tree

Forty-seven modified files, 2,190 added lines, typecheck clean and all 428
tests passing. It raises the authored capacity envelope so the default canvas
exports, adds proper diagnostic text for the loop-stack and empty-drop rules,
and begins third-party attribution for the vendored backend. It is valuable and
it is unstaged.

Whoever owns that session should commit it — stage owned paths only, never
`git add -A`. Finish the licensing thread in the same commit or the next one:
`LICENSE.knitout-backend-kniterate` and `check-third-party-notices.mjs` are both
new and not yet wired to any gate.

**Gate:** `pnpm verify` and `pnpm verify:kcode` both green on the committed
tree, and the proof receipt regenerates byte-identical.

### 2. Settle the import warning policy

Pick A, B, or C above. If B, the change is narrow: give the depth-three
loop-stack observation an informational severity on the foreign path, keep the
error at four, and update the reference-corpus line in `ROADMAP.md` and the
corpus paragraph in `KCODE-SOFTWARE-PROOF.md`, both of which currently record
the 7/6 split as expected behaviour.

**Gate:** all thirteen reference files open with the verdict the docs claim
they open with — no drift between the ledger and the product.

### 3. Freeze the release candidate

Run the full battery once on the committed tree and record exactly what ran:
`pnpm verify`, `pnpm verify:kcode`, `pnpm test:e2e`. WebKit cannot launch on
the current host for want of `libicu74`; either install it or state plainly
that WebKit coverage came from CI rather than locally. Confirm `git status` is
clean afterwards — no generated file should dirty the tree.

**Gate:** a single named commit with all three results attached to it, and a
clean working tree.

### 4. Generate the immutable trial package

`pnpm release:trial` writes `out/v1-knit-trial/`: the project and chart, a
validated `blanket.k` and `blanket.kc`, a manifest carrying the compile hash
and SHA-256 identities, and the operator checklist. The candidate is a 120×160
four-colour birdseye rectangle — roughly 152,000 Knitout operations, 2,662
emitted passes, about four and a quarter hours of machine time.

Do not hand-edit the generated files. The manifest's needle range is in
compiler coordinates and is **not** a physical needle-label claim; resolve it
against a documented machine datum procedure and record that placement
verification in `run.json` before sending the job.

**Gate:** the package regenerates byte-identically from a clean tree, and its
hashes are written down before anything reaches the machine.

### 5. Knit it

This is the step no amount of software can stand in for. Run the operator
checklist in `V1-PHYSICAL-TRIAL.md` on an actual Kniterate and record what it
demands: machine identity and software revision, yarn brand, line, lot and
fibre, gauge and tension, rested dimensions, photographs of both faces and all
four boundaries, and every stop or manual intervention.

Then `pnpm release:register -- v1-four-color-blanket`, complete `machine.json`,
`yarn.json`, structured `run.json` and the narrative `outcome.md`, and run
`pnpm release:physical-check`. It recompiles and re-emits the trial in process
and demands one clean, complete, non-deviated entry whose Knitout and KCode
identities match exactly — stored commands and caller-marked statuses are never
trusted.

If the run fails, the candidate stays capped. Record the failure, add it to the
refusal corpus, fix the engine, regenerate, and repeat. A failed candidate
cannot be rehabilitated by prose or by testing a different artifact.

**Gate:** `pnpm release:physical-check` exits 0 and names the exact registry
entry.

### 6. Tag and release

Bump the workspace from `1.0.0-rc.1` to `1.0.0`, tag it, and open the single
deliberate `accumulate` → `main` pull request. Merging is a production action: a
push to `main` runs verification and deploys GitHub Pages. Close out by naming
the exact commit, the verification result, the workflow result, and a check of
the deployed URL.

**Gate:** deployed build reachable, and the release note distinguishes what
software proved from what the machine proved.

---

## After 1.0.0 — the honest backlog

`KCODE-SOFTWARE-PROOF.md` already names seven things software has not
established. They are the real roadmap, in rough order of how much they
constrain the product.

1. **Physical needle labels.** The 253-column serialized frame against 252
   physical needles needs authoritative mapping evidence before any column is
   labelled with a needle number.
2. **Operational safety envelopes.** Safe speed, signed roller, and real
   loop-stack limits are unestablished; today's thresholds are a conservative
   software policy wearing an honest label.
3. **Carrier lifecycle on foreign files.** KCode does not encode Knitout `in`
   and `out`, so a foreign file cannot prove carrier threading from its bytes
   alone.
4. **Programmed motion is not dynamics.** The validator proves programmed
   stops, ordering, reach and loop topology — never momentum, friction, or
   collision tolerance.
5. **Lowering is pinned, not clean-room.** A native scheduler behind the same
   scheduled-pass contract, differentially tested against both the pin and the
   captured references, would remove the last borrowed component.
6. **Source mutation scoring.** The current mutation rail perturbs inputs, not
   implementation source. A real mutation score for the parser, projector, and
   validator would quantify whether the tests kill injected faults.
7. **M4's wider Knit-proven gate.** Four exact registry entries — tension,
   fairisle, birdseye, complement — not the single blanket that closes V1.

---

## Evidence classes

Everything marked verified above is local software evidence: commands run on
this checkout. Nothing in this document is deployed-browser evidence, and
nothing is physical-machine evidence — that category is still empty by design,
and phase 5 is the only thing that can fill it.

Reading order for anyone picking this up: `STATUS.md` first, then
`KCODE-SOFTWARE-PROOF.md` for what the software gate does and does not
establish, then `V1-PHYSICAL-TRIAL.md` for the procedure in phase 5.
