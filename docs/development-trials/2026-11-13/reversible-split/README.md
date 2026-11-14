# Gate 3 outward-first comparison — implementation review

**Local software evidence only. These files are held for review, not released
to the operator.** The user approved outward-first and its mirror, then approved
two short files, each intended to be knitted twice. The single-bed Gate 2
swatch must knit successfully before any reversible split file is sent.

The implementation follows the [reviewer decisions](../../../REVERSIBLE-INCREASE-GATE3.md#reviewer-decisions--approved-by-the-user-2026-11-13).
There is no inward-first implementation, new phase-reset sequence, production
diamond change, safety relaxation, converter change or new registry entry.
The simulator roller correction is separate in `900eae8`; the experimental
builder and serialized checks are in `c1f46e9`.

## Exact files and four cases

| Candidate edge | File | Passes | Bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| Left | [left/program.kc](left/program.kc) | 222 | 268018 | `9f778ff0817456639f004c2a6b6d786c998a6350233e7dfba82e6256788ff51d` |
| Right | [right/program.kc](right/program.kc) | 226 | 272879 | `44d663f1121e272ca086c14e78d889cff561193ec1df36629a4c4e185c78dd20` |

Both widen 20 → 22 → 24 columns, with a split candidate at the named edge
and the borrowed-loop control at the other edge. A = C4 grey front ground;
B = C3 orange rear ground. These are proposed yarn identities, not confirmation
of the actual cones. Each file contains both colour phases once. Repeating
each exact file supplies two physical specimens per case, not two events of
each phase on one specimen.

| Case | Old front / rear | Growth → completion body cycles | Preparation + event passes | Outer split O3 | A outer join O6 | Inner split O8 | B completion O9 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| Left P | A / B | 9 → 10 | 127–144 | 138 | 141 | 143 | 144 |
| Left Q | B / A | 13 → 14 | 149–166 | 160 | 163 | 165 | 166 |
| Right P | A / B | 10 → 11 | 129–147 | 141 | 144 | 146 | 147 |
| Right Q | B / A | 14 → 15 | 152–169 | 163 | 166 | 168 | 169 |

All pass numbers are 1-based. P and Q mean old edge colour phases; the
separate preparation slot labels Q1…Q9 do **not** mean colour phase Q.
The left body occupies passes 111–172 (17 cycles); the right body occupies
111–175 (18 cycles). Right P needs the optional entry fetch Q0, pass 129.
There are two ordinary cycles between events and three after the last event.
Both starts use the repaired common two-bed frame at the full eventual width,
with different documented lead-in edge colours to establish P at the named
side. They do not use the single-bed swatch's cast-on.

## Loop and yarn changes to review

At the candidate, call the original front/rear loops a/b at the old edge F0/R0.
F1/R1 are the new outer column. Both P and Q use exactly these moves; only
the yarn identity of a/b changes.

| Step | Candidate action | Result / yarn connection |
| --- | --- | --- |
| Q8 | R0 b → F1 at rack ±1 | R0 is empty; F1 holds b. No stacking. |
| O3 | A knits F0 → a1; splits F1 b → R1, creating c1 on F1 | a1 has parent a; c1 has parent b. Split is the last working needle. |
| O4 | B knits R1 b → d1, skips empty R0 | d1 has parent b. B's preceding yarn loop is b in P, a in Q. |
| O6 | A knits R1 d1 → d2 | A runs from c1 on F1 to d2 on R1: outer cross-bed return. |
| O8 | A splits F0 a1 → R0, creating a2 on F0 | a2 has parent a1. Split is the first working needle; A then knits inward across the front. |
| O9 | B knits R0 a1 → b2, then F1 c1 → c2 | b2 has parent a1; c2 has parent c1. B ends by crossing rear to front. |
| Next ordinary cycle | B starts on R1; A returns at the opposite edge | Confirms continued outer-edge joins after the two-cycle event. |

Both receiving rear loops are supported by existing loops. The candidate
temporarily has three occupied needles after the growth cycle and four after
completion. No candidate needle is knitted empty or twice in a cycle, and
no body needle holds more than one loop in the serialized replay.

At the control, the old rear edge loop transfers to the new front needle;
two new rear loops start empty. This retains the baseline's structural
weakness for comparison. Its colour assignments and cross-bed returns are
checked separately. The control shares the candidate's extra carriage passes
and take-down, so it does not reproduce the historical paisley's complete
settings or schedule. The registered 522-pass baseline remains a separate,
unchanged artifact; its specimen association is inferred, not exact-file proof.

The old front at the control is A in Left P, Left Q and Right Q, but B in
Right P because the initial edge phases differ. Keep those labels when
comparing specimens; the two controls are not identical in every case.

Inspect every actual pass, including rack, speed, roller, stitch and numeric
feeder/carriage stops, in [left/body-passes.txt](left/body-passes.txt) and
[right/body-passes.txt](right/body-passes.txt). The corresponding
[left verification](left/verification.json) and [right verification](right/verification.json)
contain the parent IDs and previous-yarn-loop IDs for every named loop above.
Their trace coordinates are converter coordinates; use each `program.k` for
source needle numbers. The left schedule mirrors columns, arrows and rack
signs while retaining yarn and bed identities.

## Take-down and unresolved physical questions

Each body cycle has two main working passes at roller 450. O1 and O6 are
extra single-needle working fragments at roller 0; empty moves and transfers
also use 0. Normal body speed is 200, stitch 7. The first body cycle uses
speed 100 and roller 100; carrierless shaping uses speed 100 and transfer
stitch 5. These settings are encoded in the files and checked pass by pass.

O3 starts with knitting, so the converter retains roller 450. O8 starts with
a split: the converter defaults it to 0, so the source explicitly adds 450
with `x-add-roller-advance`. The simulator now predicts that one-shot value,
including when an automatic carrier move is needed. Its ordinary roller
setting remains unchanged for subsequent knitting. The converter is untouched.

**The main physical unknown is the first/last-working-needle split.** The
captures and single-bed Gate 2 test inset splits with knitting on both sides.
They do not establish terminal loop clearance, feeding or retention. Neither
loop parentage nor a clean validator result establishes those properties.
Also unresolved: loop orientation, the cross-colour parent at the rear,
edge bulk, joins under stretch, and whether 450/0 gives adequate local take-down.

There is one advisory in each file: C6 travels 23 needles between its last
stitch at pass 80 and its next at pass 86 during main-yarn introduction.
Pass 85 moves C6 empty at roller 0. This common-frame sequence is unchanged;
its lack of body movement does not establish that the introduction cannot snag.
No C1/C6 movement occurs during either body. Observe the frame separately.

## Reproduction and review evidence

From the repository root, generate into new temporary directories:

```sh
node --import tsx scripts/experiments/reversible-split-swatch.ts left /tmp/gate3-left-review
node --import tsx scripts/experiments/reversible-split-swatch.ts right /tmp/gate3-right-review
```

The builder refuses to write unless strict KCode parsing, canonical machine
validation/safety, the loop audit, the complete serialized schedule comparison,
the case ledger, edge yarn connections and the 450/0 schedule all pass. It
is isolated from Studio's production chart/diamond export.

The two focused suites pass 19 tests. Six roller regression cases fail on
the previous simulator; four knit-first controls still pass. Negative
comparison tests remove the outer split, change the outer A rear visit to
front, and remove the O8 roller increment; all are rejected on both sides.
Wrong-side entry is refused rather than silently using inward-first.
The test count includes both phase checks for both generated files.

[Regression evidence](regression-evidence.json) records all 47 existing
construction hashes unchanged and the unchanged Gate 2 hash
`fb2cb6adcfb4320992dcec26e8b80e0cbdcb905b4d25548780f20b04b5c24de5`.
The 522-pass baseline also re-emits byte for byte. Full proof and repository
verification results are recorded in [verification.md](verification.md);
the current proof receipt, not a static claim here, governs software status.

## Stop for review

Review the emitted schedules, both P/Q loop ledgers, mirrored feeder stops,
terminal split placements, and take-down encoding. The [observation form](observations.md)
is blank and prepared for a later authorized trial: left ×2 and right ×2.
It distinguishes the candidate and control, both faces, both colour phases,
terminal split operation, edge joining and take-down effects.

Approval of the implementation review does not by itself settle the Gate 2
physical dependency or actual yarn setup. No file has been sent to the
operator; nothing is Knit-proven. No push or issue post is part of this work.
