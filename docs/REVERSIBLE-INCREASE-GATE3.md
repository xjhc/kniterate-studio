# Gate 3: reversible increase design for review — 2026-11-13

## Reviewer decisions — approved by the user, 2026-11-13

The user approved these four changes after the reviewer walked schedule O
at both edges. This section governs the first implementation; the earlier
O/I comparison and eight-case schedule below remain design history.

1. **Outward-first only, including its mirror.** Exclude schedule I from
   the first build and swatch. Wait for the correct carrier side rather
   than add I's extra fragment, long first receiving-loop hold and front-only
   out-and-back yarn route. A future piece using candidate increases at both
   edges will need their growth cycles staggered and separately checked.
2. **Four cases, each knitted twice:** left/right candidate, old front A/B,
   with the opposite borrowed-loop control. Verify the actual phase and
   carrier state; waiting also flips the edge colour. The old eight-case
   event table and 208-slot total do not specify this new comparison.
3. **Main physical unknown: a split at a pass boundary.** O3 splits on its
   last working needle and O8 on its first. The reviewed Customist captures
   and Gate 2 swatch have knitting on both sides of their inset splits.
   Those files do not qualify this first/last-needle use. Gate 2 must knit
   successfully before any reversible split file goes to the operator;
   the subsequent reversible trial must establish this additional behavior.
4. **Fix split-first roller prediction in the simulator first**, with a
   regression against the actual converter and a separate commit. The
   pinned converter stays unchanged. The reviewer accepts the proposed
   450 on each main yarn pass and 0 on extra fragments for this trial;
   this is acceptance of the plan, not physical qualification.

Implementation may now proceed locally and must stop with the generated
comparison package for review. No operator handoff, push or issue post is
authorized. Do not add more experiment-specific registry tooling. The
reviewer did not review the separate diamond repair or baseline tooling
beyond its promotion guard; this approval does not extend that evidence.

**Implementation scheduling finding:** after O, the candidate's outer front
is B and A is opposite it. Every normal cycle flips both colour and carrier
side; returning to outward-first takes an even number of normal cycles and
therefore returns to B. Changing candidate sides also reaches B after the
required odd number of normal cycles. Waiting alone cannot repeat the P
case in the old continuous-strip plan. **The user approved two short files,
one per candidate side, each starting with P then Q, with each exact file
intended to be knitted twice.** No new phase-reset construction is part of
this implementation. The generated [comparison package](development-trials/2026-11-13/reversible-split/README.md)
is now the implementation-review artifact; the physical handoff gate above
still applies.

## Earlier paper and review evidence

**Paper proposal only. No emitter, simulator, test, safety rule or machine file
was changed or generated for this design.** The loop states below were worked
through by hand against the existing files and split semantics; they are not
a new automated replay or a physical result.

Keep the reviewer's **two splits and one transfer, over two yarn cycles** as
the candidate for review, with an explicit alternating edge join.
It replaces the baseline's two empty rear starts with supported loops. It
does not promise an invisible increase: the rear receives a front-colour
parent, and the edge keeps its alternating-colour border.

**Revision 3 review:** the inward-first selections still give four supported
loops without double knitting; their order is retained. This revision
distinguishes a transferred old loop from the working yarn's running end,
and traces the outer-edge join separately from the inboard split. The 450/0 commands
remain a trial proposal: inward-first holds the first split's rear loop
through substantially more work before B knits it, and split-first roller
encoding still needs simulator/converter parity. Neither direction is
physically qualified or approved for implementation by this note.

The full-row schedules cover the control edge, both first-split directions,
both old edge colours, carrier preparation and per-pass take-down. The paper
comparison remains 20 → 36 columns over 43 body cycles, with eight cases.

Review the [full-row tables](#full-row-schedules),
[phase and lead-in ledger](#both-old-edge-colours-and-the-entry-ledger),
[take-down contract](#take-down-and-settings-plan-for-review), and
[eight-case event table](#one-comparison-piece-with-explicit-phase-coverage).

The user requested a stop for review before code. Approval of this note would
allow implementation and software checking of the selected candidate, not an
operator handoff. The unchanged [single-bed swatch](SPLIT-INCREASE-GATE2.md)
still needs a successful physical split trial before a reversible split file
is sent to the operator. No push or issue post is included.

## Evidence and scope

The preserved comparison is the [522-pass mixed-paisley baseline](../packages/machine-lib/registry/swatches/2026-11-13-mixed-paisley-baseline/outcome.md),
SHA-256 `0be718de93c415b51ccb859d013a5578f4ff8c2e8cfffc0ce4bd380ee495acd3`.
Its issuance is recorded; the specimen's association with this exact file
remains inferred. The [repaired 530-pass production diamond](REVERSIBLE-DIAMOND-REVIEW.md)
is a separate construction using the same borrowed-loop increase family.

Kniterate describes a split as moving the old loop to the other bed while
forming a new loop through it on the delivering needle. Its explanation
specifically discusses increasing away from the edge; it does not qualify
this outer-edge application. [Kniterate split stitch](https://support.kniterate.com/hc/en-us/articles/360012868178-Split-stitch).
Its current command manual still lists reversible increases as unimplemented.
[Increase Transfers](https://support.kniterate.com/hc/en-us/articles/39032141113757-Global-Local-commands).

The local captures establish the encoding of front-to-rear splits at rack 0
in either direction. They do not establish a knitted two-bed recipe.
This proposal uses those split forms and carrierless transfers at rack ±1.
It uses no rear-bed split, racked split, or adjacent splits in one pass.
The two receiving needles are adjacent, but receive in different passes.

## Coordinates, yarns and entry state

For a right-edge increase, let the old edge be column `e`:

| Symbol | Needle | Initially |
| --- | --- | --- |
| F0 | front e | old loop a |
| R0 | rear e | old loop b |
| F1 | front e+1 | empty |
| R1 | rear e+1 | empty |

These are logical needle coordinates, not printed KCode columns. In the
pinned converter, front = rear + rack for a transfer; R0 → F1 uses rack +1.
Customist's carrier and carrierless print columns have different offsets.

Use yarn **A for the front ground**, **B for the rear ground**. For the first
baseline event, A is C4 grey and B is C3 orange; a is grey and b is orange.
The lettering is not tied to feeder numbers. On later events the alternating
border can reverse a/b's colours. The loop moves remain the same; the emitter
must inspect that phase, not assume every old front edge loop is A.

A *cycle* means one planned knitting visit by each yarn. It is not necessarily
two machine passes. A *yarn anchor* below means the last formed stitch from
which the running yarn leads to its feeder; it is not the feeder's stop or
merely any loop of that colour. Empty moves do not form a new anchor. The
backend's `carrier.last` is a scheduling field also updated by `miss`; it
must not stand in for this physical yarn ledger after an empty return.
A split pass can also knit selected front needles, but
cannot include ordinary rear knitting in the current command contract/backend.

For the right-edge candidate, outward-first means A starts on the left and
B on the right; inward-first means A starts on the right and B on the left.
Establish clearance with the preparation below **before** moving any attached
edge loop. No threaded carrier crosses the fabric empty to change colour phase.
The common waste/draw must cover the planned maximum width, with idle C1/C6
parked outside that outline. The repaired two-bed start is software-reviewed,
not physically qualified by the separate single-bed orange trial. Exact stops
and clearances require a later emitted-file check; they are not numerical
machine instructions here.

For the first candidate, reserve the two shaping columns as a plain border.
Arbitrary paisley cells in this area cannot be preserved unchanged while
also prescribing these yarn assignments. The rest of the chart is unaffected
by the local loop design, but its bed selections can add pass fragments.

## Preferred candidate: complete the second split on the next cycle

The important refinement to the starting sketch is in cycle 2: A knits the
**new rear edge**, and B knits the **new front edge**. Simply continuing A
on the front and B on the rear would omit the usual cross-bed edge return.

Other needles knit their assigned yarn once per cycle; they must not knit
again merely because a cycle is split into multiple passes. Rear knitting
and the front split need separate yarn-working passes. The backend's `merge_types` in
`packages/machine-lib/src/knitout/vendor/knitout-to-kcode.browser.js` merges
front knitting with a front split, but not rear knitting with that split.
The otherwise unsuitable Customist capture
`fixtures/customist-debug/2026-11-13-followup/raw/jacquard-simple.kc`
shows the separation directly: pass 48 rear knit, 49 empty return, 50 front
split, 51 empty return, 52 remaining knitting. This is scheduling evidence
only; that file's increase empties extra rear needles and is not our recipe.

### Complete local loop ledger

`A(x)` means a new A loop knitted through existing loop x; `—` means empty.
The same symbol in two rows is the same loop being held or transferred.

| After | F0 | R0 | F1 | R1 | Live loops |
| --- | --- | --- | --- | --- | ---: |
| Entry | a | b | — | — | 2 |
| Candidate transfer | a | — | b | — | 2 |
| Cycle 1, A | a1 = A(a) | — | c1 = A(b) | b | 3 |
| Cycle 1, B | a1 | — | c1 | d1 = B(b) | 3 |
| Cycle 2, A rear visit, outward-first | a1 | — | c1 | d2 = A(d1) | 3 |
| Cycle 2, A split, outward-first | a2 = A(a1) | a1 | c1 | d2 | 4 |
| Cycle 2, A split, inward-first (from cycle 1 end) | a2 = A(a1) | a1 | c1 | d1 | 4 |
| Cycle 2, A rear visit, inward-first | a2 | a1 | c1 | d2 = A(d1) | 4 |
| Cycle 2, B, either direction | a2 | b2 = B(a1) | c2 = B(c1) | d2 | 4 |

The O and I rows are alternative routes from the cycle-1 end state, not
successive operations. Inward-first splits F0 before visiting R1. Its final
occupancy and parentage match outward-first; the order, yarn route and time
under take-down do not. Schedule I below accounts for those differences.

Every knit/split has an existing parent, every transfer/split destination
is empty, and no needle holds a stack. The two splits add exactly two live
loops. No temporary column beyond e+1 is used for loops; carrier clearance
can still need more space.

R0 misses B's first-cycle knit, but **that does not prove a one-course height
deficit**. Its replacement parent a1 was made on the front in cycle 1.
At completion both F0 and R0 descend two generations from a, and both F1 and
R1 descend two generations from b. Physical take-down and loop length can
still differ. The certain cost is the substituted A parent on the rear,
not a measured loss of height.

### Face colours, joins and resumption

| Stage | Front, old / new column | Rear, old / new column |
| --- | --- | --- |
| End cycle 1 | A / A | empty / B |
| End cycle 2 | A / B | B / A |
| Next normal cycle | A / A | B / B |

The new outer column continues the one-column alternating border. After
outward-first, the next normal cycle starts B leftward at R1 after its
previous last stitch at F1; A returns rightward to F1. After inward-first,
A's next visit starts leftward at F1 after its last stitch at R1. Both are
cross-bed returns. The full-row section specifies the other edge as well.

At growth, the split connects new front c1 to rear b; B then makes d1 through
that same b. **This is the proposed outer-edge connection.** At closure,
a2 and b2 share a1 **one column inboard**. That second fork supports R0; it
cannot substitute for joining the outer edge at e+1. The outer return is
explicit: O6 takes A from c1 on F1 to d2 on R1; I11 takes B from its d1
attachment at R1 to c2 on F1. Knitting through d1 in I10 does not move B's
attachment to the front. The following normal cycle retains the cross-bed
return described above.

These are yarn/parent connections on paper, not proof of loop orientation,
a closed-looking edge or freedom from holes. In particular, O4 and I4 carry
B between R(e−1) and R(e+1), spanning two column intervals over the skipped
R0. Filling R0 in cycle 2 does not retroactively knit that B course. Both
faces and this rear yarn span need inspection even if every loop has a
parent. In phase P a grey parent may show on the orange rear face at R0;
the new front edge can show its orange parent b. The border alternation is
intentional.

The operation is **pending after cycle 1**. Current completed-row assertions
expect both beds occupied, so an implementation must represent and test this
specific two-cycle state, not silently weaken that invariant for all shapes.
Do not start another increase, a decrease, finish, or arbitrary motif work
on these two columns until cycle 2 completes. The event table specifies
every recovery cycle; none starts while an increase is pending.

## Full-row schedules

These are complete **paper selections and carrier moves** for the plain
comparison body. They are not generated KCode. Numeric carrier/carriage
stops still require lowering and independent checks for catch distance,
stop overrun, feeder spacing and attached yarn. A transfer near one edge
must not be assumed to leave the carriage at the other edge: its travel
must cover the next required start, or an explicit empty fetch is needed.
The backend can extend a preceding carriage stop; every such extension or
additional move must appear in the eventual emitted schedule.

For the right-hand candidate, the old bounds are `l..e`. Use:

| Column | Role |
| --- | --- |
| l−1 | new baseline/control edge |
| l | old control edge, becoming interior |
| I = l+1..e−1 | unchanged plain interior |
| e | old candidate edge, becoming interior |
| e+1 | new candidate edge |

`F(x)` and `R(x)` select front and rear; a range selects every column in it.
Work the listed selections in travel order. All unlisted needles hold.
All body passes use rack 0. A is C4 grey and B is C3 orange throughout;
their assignment is not swapped to manufacture phase coverage.

### Preparation for both schedules

Let `Y_L` be the carrier already at the left and `Y_R` the one at the right.
They are A/B for schedule O and B/A for schedule I. Start with the carriage
at the candidate/right side; if it is at the left, add an empty carrierless
rightward fetch first. Its roller is 0 and neither yarn moves.

| Prep | Direction / yarn | Rack | Selection or clearance move |
| --- | --- | ---: | --- |
| Q1 | ←, none | 0 | Fetch the left carrier. No needles work. |
| Q2 | →, Y_L | 0 | Short empty inward leg at the left edge; no needle selection. |
| Q3 | ←, Y_L | 0 | Empty outward leg; park clear of new column l−1. |
| Q4 | →, none | 0 | Fetch the right carrier. |
| Q5 | ←, Y_R | 0 | Short empty inward leg at the right edge. |
| Q6 | →, Y_R | 0 | Empty outward leg; park clear of new column e+1. |
| Q7 | ←, none | −1 | Control: transfer R(l) → F(l−1). |
| Q8 | →, none | +1 | Candidate: transfer R(e) → F(e+1). |
| Q9, O only | ←, none | 0 | Fetch A on the left before O1. |

Reset rack to 0 after Q8 in both schedules. All preparation rollers are 0.
Q2/Q3 and Q5/Q6 are local re-parking pairs, not empty yarn trips across the
piece. The physical yarn anchors do not change during those moves. Q7/Q8
move the old rear loops. Update a feeder's anchor only if that particular
moved loop is its current attachment; owning the loop's colour is not enough.
The other feeder can be attached at the far edge. Check the resulting bed
and column before the next operation.
Both carriers must clear the enlarged outline before Q7. C1/C6 remain idle.

### O: first A visit goes outward to the candidate

Entry after Q9: A left, B right, carriage ready to travel right. For each
row, the endpoint column is the last knitted needle, **not** the carrier's
numeric parking stop. An empty return changes the stop but not this anchor.

| Slot | Cycle / direction / yarn | Complete needle selection | Last new stitch | Roller |
| --- | --- | --- | --- | ---: |
| O1 | 1 / → A | Knit R(l−1), the control's first empty start | A at R(l−1) | 0 |
| O2 | ← A | Empty local return to the left | unchanged | 0 |
| O3 | 1 / → A | Knit F(l..e); split F(e+1) → R(e+1) | A at F(e+1) | 450 |
| O4 | 1 / ← B | Knit R(e+1); **skip R(e)**; knit R(e−1..l), then F(l−1) | B at F(l−1) | 450 |
| O5 | → none | Fetch A on the right | unchanged | 0 |
| O6 | 2 / ← A | Knit R(e+1); hold F(e+1) | A at R(e+1) | 0 |
| O7 | → A | Empty local return to the right | unchanged | 0 |
| O8 | 2 / ← A | Split F(e) → R(e); knit F(e−1..l−1) | A at F(l−1) | 450 |
| O9 | 2 / → B | Knit R(l−1..e), then F(e+1); hold R(e+1) | B at F(e+1) | 450 |

The control's second empty start is B at R(l) in O4. All other knits have
parents. At cycle 1's end the front colours are `B, A, A..., A, A` from
l−1 to e+1; only R(e) is empty. At cycle 2's end the front colours are
`A, A, A..., A, B`, with inverse rear colours and no empty active needle.

### I: first A visit goes inward from the candidate

Entry after Q8 and rack reset: A right, B left, carriage ready to travel
left. A's second cycle needs **three** fragments because the two rear edge
stitches sit on either side of its front split/ground work.

| Slot | Cycle / direction / yarn | Complete needle selection | Last new stitch | Roller |
| --- | --- | --- | --- | ---: |
| I1 | 1 / ← A | Split F(e+1) → R(e+1); knit F(e..l+1) | A at F(l+1) | 450 |
| I2 | → A | Empty local return at the control end | unchanged | 0 |
| I3 | 1 / ← A | Knit R(l), the control's first empty start, then F(l−1) | A at F(l−1) | 0 |
| I4 | 1 / → B | Knit R(l−1), the control's second empty start; F(l); R(l+1..e−1); **skip R(e)**; R(e+1) | B at R(e+1) | 450 |
| I5 | ← none | Fetch A on the left | unchanged | 0 |
| I6 | 2 / → A | Knit R(l−1) | A at R(l−1) | 0 |
| I7 | ← A | Empty local return to the left | unchanged | 0 |
| I8 | 2 / → A | Knit F(l..e−1); split F(e) → R(e) | A at F(e) | 450 |
| I9 | ← A | Empty local return at the candidate end | unchanged | 0 |
| I10 | 2 / → A | Knit R(e+1); hold F(e+1) | A at R(e+1) | 0 |
| I11 | 2 / ← B | Knit F(e+1); R(e..l); F(l−1) | B at F(l−1) | 450 |

At cycle 1's end the front colours are `A, B, A..., A, A`; only R(e) is
empty. At cycle 2's end they are `B, A, A..., A, B`, with inverse rear
colours and complete occupation. Control colours differ from O because B,
rather than A, started at the control end. In both schedules the carrier
starting there first knits its new **rear** edge; its previous attachment
was either an old front stitch or a rear stitch moved to the new front.
That makes the control's growth return cross beds in either initial phase.

In I1 the local order is **c1 at F1, then a1 at F0**. In I8–I10 it is
**a2 at F0, then d2 at R1**, with the empty I9 return between them. I9
does not knit F0 a second time or replace a split by a miss. I10 holds c1
on F1; I11 then makes c2 at F1 before b2 at R0. This is the actual inward
route, not a reversal of the O row labels. The I2/I7/I9 stops must later
provide a feasible pickup and clearance for the next fragment without
catching the held stitches or adding a new yarn anchor.

### Stitch counts, normal rows and left mirror

For old width W, each cycle has W+2 active columns. In cycle 1, A forms W+2
loops and B forms W+1; B deliberately omits R(e). In cycle 2, each yarn
forms W+2. The split counts as the A loop on its source. Do not also knit
that source in its fragment. There are exactly two empty starts, both at
the baseline edge; none at the candidate edge. Live loops go from 2W to
2W+3 after cycle 1 and to 2W+4 after cycle 2, with maximum local stack one.

For a normal cycle, flip the front colour at **both outer columns**, keep
interior A-front/B-rear, and select the complementary bed for the other
yarn. Each carrier reverses its last full-row direction. Start with the
carrier on the carriage's current side, then knit the other yarn back;
there is one ordinary mixed-bed pass per yarn, roller 450 on each. Its
first edge stitch is on the opposite bed from that carrier's previous
last stitch. After O, B makes the first normal visit; after I, B does too.
Subsequent normal-row order follows the resulting carrier positions.

For a left candidate, mirror **the entire preparation and body schedule**:
exchange physical left/right, reverse every arrow and rack sign, put the
control at the right, and replace every column by its reflected column.
Keep A/B and front/rear unchanged. The starting carriage side is now left.
This specifies both edges and every interior selection for the mirror;
numeric stops still need an independent emitted-file check on that side.

The paper counts are 18 slots for Q1–Q9 + O1–O9 and 19 for Q1–Q8 + I1–I11,
plus an entry fetch when needed. They include two shaping transfers and,
respectively, six or seven yarn-working passes. These are prescribed paper
slots, not a claim about the final machine pass count: lowering can extend
stops or insert clearance moves. Any additional loop-forming fragment must
be reconciled with the selections and take-down contract before handoff.

## Both old edge colours and the entry ledger

Phase **P** means the candidate's old front loop is A and its old rear loop
is B. Phase **Q** means old front B / old rear A. These names refer to the
actual loops before Q7/Q8, not to row-number parity or a palette label.

| Quantity | Phase P | Phase Q |
| --- | --- | --- |
| Original a / b | A / B | B / A |
| New front parent in cycle 1 | b of B | b of A |
| a1 formed at the old front in cycle 1 | A through A | A through B |
| Parent moved into old rear in cycle 2 | a1 of A | a1 of A |
| Final F0 / R0 / F1 / R1 colours | A / B / B / A | A / B / B / A |

### Attachment and join audit for both phases

The same occupancy ledger works for both phases; their running-yarn paths
differ. Follow the feeder already on the candidate/right side at entry:

| Schedule / phase | Entry attachment | After Q8 | First candidate-side return |
| --- | --- | --- | --- |
| O / P | B at b, R0 | b at F1 | O3 moves b to R1 while B is idle. O4 knits d1 at R1: B's return stays rear-to-rear after the split. The shared parent b supplies the proposed join. |
| O / Q | B at a, F0 | Unchanged | O3 knits a1 through a, leaving B's attachment in that front-column fabric. O4 makes d1 at R1: a front-to-rear diagonal. |
| I / P | A at a, F0 | Unchanged | I1 makes c1 at F1, then a1 at F0: A's local path is a(F0) → c1(F1) → a1(F0). This front-only outward-and-back yarn path relies on the b split for the proposed join. |
| I / Q | A at b, R0 | b at F1 | I1 moves b to R1 **and makes A's new running anchor c1 at F1**, then knits a1 at F0. The old parent ends at the rear; A's running end does not stay there. |

For a split, a non-working yarn attached to the old loop follows that loop;
the working yarn's new anchor is the newly formed **source/front** loop.
The converter's split handler distinguishes these by moving matching old
`last` locations, then setting the active yarn to the source. This does not
make its `last` field a physical-yarn proof across subsequent misses.

At the control/left edge the starting yarn is A in O and B in I. An old
front attachment at l connects diagonally to its new rear stitch at l−1.
An old rear attachment moves with Q7 to front l−1 and then connects to
rear l−1. The other yarn may already have knitted through that parent;
that does not move the attachment to the rear. Thus the control's growth
return crosses beds in either phase, despite its unsupported rear starts.
Its next returns are also explicit:

| Schedule | Control return in cycle 2 | Control return on the next normal cycle |
| --- | --- | --- |
| O | B: O4 F(l−1) → O9 R(l−1) | A: O8 F(l−1) → R(l−1) |
| I | A: I3 F(l−1) → I6 R(l−1) | B: I11 F(l−1) → R(l−1) |

Keep ordinary cross-bed-turn checks. The current diamond test compares
successive knitted endpoints without tracing a transferred attachment or
split parent; that predicate alone cannot certify this growth event.
Any later event-specific check must account for the b connection at the
outer edge, these phase-specific yarn routes, the completion return and
normal resumption at **both** edges. An occupied pair or the inboard a1
fork alone is insufficient. The paper does not prove loop orientation or
whether the front-only I/P route leaves a visible bar.

### Lead-in from the common cast-on

Use the retained two-bed frame with primary C3: its last cast-on pass is
C3 leftward on the rear bed, leaving B=C3 on the left and A=C4 on the right.
This direction order is also visible in the historical file's first body
passes 115 (C3 rightward) and 116 (C4 leftward). The common widened waste
and idle-feeder handling remain the repaired frame's responsibility.
Before the lead-in, verify that its handoff has those carrier sides, the
carriage on the left and one live loop on both beds of all 20 active columns.

| Lead-in cycle | Complete selections, in order | Ending front edge colours | Ending carriers / carriage |
| --- | --- | --- | --- |
| 1, first body cycle | B →: F(l), R(l+1..e−1), F(e). A ←: R(e), F(e−1..l+1), R(l). | B / B, both Q | A left, B right; carriage left |
| 2, 4, 6, 8 | A →: F(l..e). B ←: R(e..l). | A / A, both P | A right, B left; carriage left |
| 3, 5, 7 | B →: F(l), R(l+1..e−1), F(e). A ←: R(e), F(e−1..l+1), R(l). | B / B, both Q | A left, B right; carriage left |

All passes use rack 0 and each active needle knits once per cycle. B's
first body stitch on F(l) crosses from its cast-on rear attachment at l.
This uses the production border's initial B-front phase on both edges;
it deliberately differs from the historical mixed-paisley's first right
edge colour. It does not swap the yarn assignments. Cycle 1 retains the
historical first-body settings (speed 100, roller 100, stitch 7 on both
yarn passes); cycles 2–8 use the normal 200/450/7 policy.

The first event therefore enters with **both edges P, A right/B left and
the carriage left**: inward-first at the right, preceded by a carrierless
rightward fetch. This replaces the earlier assumed A-left entry. The
actual widened frame's serialized handoff, initial C4 attachment and first
body transition still require review before a swatch file is approved.
If the handoff differs, revise the lead-in/table; do not force the phase
by moving threaded yarn across the width or omitting an edge join.

## Take-down and settings plan for review

The numeric values here are a **trial proposal**, not physical validation.
Retain the reversible baseline's stitch 7 and knitting speed 200, with A=C4
grey and B=C3 orange. The single-bed orange trial's stitch 9 is not a
qualification for this two-bed fabric. Retain the common frame's own start
and finish settings, and record its transition into the settled lead-in.

| Pass role | Proposed roller | Speed / stitch | Reason |
| --- | ---: | --- | --- |
| Carrierless shaping transfers Q7/Q8 | 0 | 100 / transfer stitch 5, as the baseline | Move existing loops; keep the pinned converter's transfer policy |
| Carrierless fetches, including inserted fetches | 0 | 600 / no stitch selection | Do not add pull while only the carriage moves |
| Empty carrier returns/re-parking | 0 | 200 / no stitch selection | Keep returns from adding another pull |
| Main A front/split fragment: O3, O8, I1, I8 | 450 | 200 / stitch 7 | One main A roller command per cycle |
| Additional A edge fragments: O1, O6, I3, I6, I10 | 0 | 200 / stitch 7 | Work the missing edge selections without another positive roller command |
| Full B visit: O4, O9, I4, I11 | 450 | 200 / stitch 7 | One second positive roller command per cycle |
| First lead-in body cycle | 100 on each yarn's full pass | 100 / stitch 7 | Retain the historical first-body ramp |
| Other normal body cycles | 450 on each yarn's full pass | 200 / stitch 7 | Same two positive-roller commands per cycle as the baseline |

Thus every candidate cycle retains two commands at 450; fragmentation adds
only zero-roller passes. The normal cycle before Q7/Q8 also stays at 450
on each yarn pass: no unlisted pre-transfer adjustment or post-transfer tug
is assumed. A zero roller command does not establish zero existing fabric
or yarn tension. This matches a **command pattern**, not a measured
force, distance or total take-down. Pass duration, knit coverage, yarn
friction and held stitches can change the physical result even with the
same numbers. In these tables at most one zero-roller loop-forming fragment
occurs between positive-roller passes; the current safety envelope allows
at most four. That coarse count does not measure the load on any held loop.
Extra compiler fragments must be counted from the final file.

### Held loops and timing

The following are paper order comparisons, not measured take-down doses.
An operation near a pass's start and one near its end do not have the same
remaining work around them. Empty moves and stop extensions add time too.

| Held loop / interval | Outward-first | Inward-first |
| --- | --- | --- |
| b on R1, from first split to B knitting d1 | Split at the end of O3; B reaches it first in O4 | Split at the start of I1; the remaining I1 front work (450), I3 (0), and nearly all I4 (450) precede its knit |
| a1 on R0, from second split to B knitting b2 | Split at the start of O8; the remaining O8 front work (450) and most of O9 (450) precede its knit | Split at the end of I8; I10 (0) intervenes, then I11 reaches it just after F1 |
| c1 on F1, until B knits c2 | O3 end → O9 end, including O4 and O8 at 450 | I1 start → I11 start, including the remaining I1 work, I4 and I8 at 450 |

Inward-first is therefore not mechanically equivalent to outward-first,
and it is not uniformly worse: the long receiving-loop wait moves from
the second split to the first. Record the four candidate needles through
both cycles, including a1's front hold before the second split. A passing
zero-roller-run counter cannot settle any of these holds or whether the
sparse I3/I6/I10 stitches clear correctly.

For later physical evaluation, keep the proposed numbers identified as one
recipe. Record the exact pass/needle of a drop, break, slack bar or failed
clearance, distinguishing transfer, split, hold and next knit. A tuning
revision should change one named pass role/setting and repeat the same
side/phase/direction at the same width, with its control; comparing E1 to
E8 would change several factors. The current paper supplies no measured
basis for choosing a different numeric value.

### Encoding checks still required after design approval

O8 and I1 start with a split. The vendor split operation defaults to roller
0, while merged passes retain their first operation's roller. Merely setting
the ordinary body roller to 450 does not set these merged passes to 450.
Moreover, `CarriageSimulator.split` starts from its ordinary roller setting;
`pushLogical` adds a pending one-shot increment to the next logical pass.
The vendor instead uses only the increment on the split. A static reading,
assuming no preceding kick consumes the increment, gives:

| Split-first input settings | Vendor split roller | Simulator split roller |
| --- | ---: | ---: |
| Ordinary roller 450, no increment | 0 | 450 |
| Ordinary roller 450, one-shot increment 450 | 450 | 900 |

This is a source-level warning, **not a newly executed parity test**. The
mere existence of one-shot support does not establish an implementation of
the table. A later implementation must demonstrate 450 in both paths,
including merging and any self/other-feeder clearance moves, while those
empty moves retain 0. Do not mask a mismatch or change the pinned converter
as an incidental fix. Explicit carrierless parks and automatic fetches also
need their own verified 600/0 settings; ordinary body settings are not proof
of movement settings.

Mixed front-knit/split passes at roller 450 already appear in unchanged
Gate 2, for example pass 128. That knit-first pass does not exercise these
split-first cases. Do not confuse a yarn-working split setting with the
carrierless transfer setting. Numeric stops and roller parity remain
implementation gates after paper approval, not results supplied here.

Kniterate's roller guidance describes yarn/technique-dependent take-down
and distinguishes dropping during transfers from breaking during transfers;
it does not prescribe a value for this new sequence.
[Adjusting the rollers](https://support.kniterate.com/hc/en-us/articles/360019405297-Adjusting-the-rollers).
Keep both cones, feeder paths, brake/lateral-tension settings and finish
consistent across the control and candidate; record them for repeatability.
[Tensioning](https://support.kniterate.com/hc/en-us/articles/360005947717-Tensioning).

Review the sparse zero-roller fragments and the initial outer-edge split
explicitly. If the knitted single-bed trial or later two-bed evidence shows
that a different pull is needed, issue a separately identified revision
with one changed factor and its control. Do not quietly add 450 to every
fragment, borrow the sleeve's 500/0 policy midway, reverse the rollers, or
change the pinned converter to make this paper plan appear to pass.

## Baseline: what changes, needle by needle

For the actual first right increase, e is trace coordinate 125. The baseline
has a = A on F0 and b = B on R0 before pass 123:

| Actual baseline pass | Move | Result at the two columns |
| --- | --- | --- |
| 123, →, no yarn, rack +1 | R0 → F1 | F0=a, F1=b; both rear needles empty |
| 124 ← B; 125 → B | Empty carrier repositioning at rack 0 | No loop changes |
| 126, ←, B | Knit F0 through a; knit R1 empty | F0=B(a); R1 is a new B loop with no parent |
| 127, →, A | Knit F1 through b; knit R0 empty | F1=A(b); R0 is a new A loop with no parent |

The baseline therefore adds two unsupported rear starts. Assigning them to
different yarns avoids knitting adjacent empty needles with one carrier, but
does not supply their parents. The supported new front loop A(b) already
exists in the baseline; the proposed change supplies support to both rear
needles as well.

`packages/machine-lib/reference/sleeves.kc` uses the same local sequence at
169–173: transfer, two empty C3 repositioning passes, C3, C4. The baseline
uses speed 200 and roller 450 on both yarn passes; the sleeve uses speed 300
and rollers 500 then 0. Seven of the baseline's 13 increases have that
two-yarn-pass arrangement; six isolate the new rear B stitch in an extra
pass. The production diamond repair uses one full pass per yarn per row;
its support problem is unchanged.

Moving b across the beds changes its yarn attachment too. The baseline is
not necessarily unjoined merely because a rear needle starts empty. The
comparison concerns support, slack and colour at an already joined edge.

### Cost over the same two yarn cycles

| Property | Borrowed-loop baseline | Preferred two-cycle candidate |
| --- | --- | --- |
| Carrierless shaping transfers | 1 | 1 |
| Front splits | 0 | 2, in separate passes |
| New loops started empty | 2 | 0 in the paper ledger |
| Loop-working passes for a paired-edge event over two cycles | 6: two transfers + four yarn passes in the repaired production schedule | O: 8, two transfers + six yarn passes; I: 9, two transfers + seven yarn passes |
| Completed first-cycle occupation | Four needles | Three; R0 deliberately empty |
| Completed second-cycle occupation | Four needles | Four needles |
| Old-column rear ancestry | Empty-start A loop, then B | A parent transferred from front, then B |
| Physical edge quality | Poor widening reported; exact photo/file link inferred | Unknown |

The loop-working-pass row compares two edges widened together: two baseline
edges versus one baseline edge plus one candidate edge. Other rows describe
the local increase at the candidate/control edge. It excludes empty moves.
The historical right-only baseline's passes 123–130 are eight actual passes
for one increase plus the next cycle; that is a different comparison unit.
The full-row O/I tables replace the earlier eight-slot local estimate. No
final machine-pass count or numeric stops are claimed before lowering and
checking an approved design. The take-down table fixes the intended roller
commands, including the additional fragments; it does not alter the pinned
converter or its carrierless transfer roller.

## Alternatives considered

### Same-cycle fill with a short return

This can remove the pending empty needle, using the same permitted split
forms. It is a real alternative, not ruled out by loop counts:

| Step | Yarn move | F0 / R0 / F1 / R1 afterward |
| --- | --- | --- |
| 1 | Transfer b, R0 → F1, rack +1; reset 0 | a / — / b / — |
| 2 | A → knits the front ground but **holds F0**; split F1 → R1 | a / — / A(b) / b |
| 3 | A ← on a short return, split F0 → R0; hold F1 and the rest | A(a) / a / A(b) / b |
| 4 | Empty carriage fetch →, then B ← knits R1 and R0 | A(a) / B(a) / A(b) / B(b) |

It fills all four needles in one cycle with no empty knit and no duplicate
front course. It needs one transfer plus three yarn-working passes in that
cycle. A then needs outward repositioning before its next normal leftward
visit to the new rear edge. An occupied F0 is deliberately skipped on A's
first outward trip: the yarn goes from the preceding front column to F1,
then backtracks to F0 on the short return.

The split parent connects the faces at the growth, but this short return
itself goes front-to-front. It does not satisfy the normal full-row
cross-bed-turnaround description. Loop orientation, the backtracking yarn
bar, local stop clearance and how to verify that join need separate review.
**Do not substitute it for the preferred candidate without that review.**
The two-cycle candidate avoids that extra working short return, but its
I/P growth path also goes from the old front anchor to the new front column
and back inward. Neither schedule earns a yarn-path or quality guarantee
from the loop counts alone.

### Other starting points

- Keeping both cycles strictly A-front/B-rear omits the alternating outer
  edge return. The cycle-2 outer edge swap is the deliberate correction.
- Simple on jacquard is a negative control, not a solution: the capture puts
  a wrong-colour front stitch in and then starts three rear needles empty.
- The [11 November derivation](REVERSIBLE-INCREASE-RESEARCH.md) uses a rear
  split, racked splits and a second temporary outside column. Its earlier
  synthetic results do not validate this proposal. Those split forms remain
  refused; this note does not seek a safety exception.

## One comparison piece with explicit phase coverage

Revise the proposed piece to **20 → 36 columns, 43 body cycles**. There are
eight paired widening events: one occurrence of each candidate side × old
colour phase × first-split direction. This is diagnostic coverage, not
repeated physical qualification of every case. Both edges gain one column
per event; the opposite edge uses the baseline control in the full-row table.

| Event | Growth / completion cycles | Width afterward | Candidate | Old candidate phase | Old control phase | Schedule | A starts | First / second split direction |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| E1 | 9 / 10 | 22 | Right | P: front A | P | I | Right | ← / → |
| E2 | 13 / 14 | 24 | Right | Q: front B | Q | I | Right | ← / → |
| E3 | 18 / 19 | 26 | Right | P: front A | P | O | Left | → / ← |
| E4 | 22 / 23 | 28 | Right | Q: front B | P | O | Left | → / ← |
| E5 | 26 / 27 | 30 | Left | P: front A | Q | mirrored I | Left | → / ← |
| E6 | 30 / 31 | 32 | Left | Q: front B | Q | mirrored I | Left | → / ← |
| E7 | 35 / 36 | 34 | Left | P: front A | P | mirrored O | Right | ← / → |
| E8 | 39 / 40 | 36 | Left | Q: front B | P | mirrored O | Right | ← / → |

Cycles 1–8 settle the piece and establish the entry target. The remaining
ordinary cycles are **11–12, 15–17, 20–21, 24–25, 28–29, 32–34, 37–38 and
41–43**. Cycles 24–25 separate the bands; the three final cycles observe
normal resumption before top waste. Every cycle is accounted for. No event starts
with a pending increase.

After cycle 43, width is 36 with 72 live loops, no pending split, front
left edge A/right edge B, and inverse rear edge colours. A is left, B right,
and the carriage is left. Check the eventual common finish against that
exit state, including its first waste pickup and support for both layers;
"same finish" does not excuse an incompatible entry state.

For a manual cross-check of phase, after a right O event the front edge
colours are left A/right B and A is on the left. After a right I event both
front edge colours are B and A is on the right. Mirror these endpoints for
the left events. Every ordinary cycle flips both edge colours and swaps
the carriers' sides. Applying those transitions gives the event table;
the unequal recovery intervals are intentional. A uniform four-cycle repeat
would keep returning to the same phase after the first event.

At E1, E2, E3, E5, E6 and E7 the carriage needs the initial carrierless fetch
to the candidate side before Q1. It is already there for the other events, given
the specified lead-in and normal-row order. This changes no yarn attachment.
All preparation and body slots then follow Q/O/I or their complete mirror.

Use a blank centre, the same two cones, shared start/finish and the take-down
policy above. Leave the two shaping columns clear of paisley. All new front
loops have parents; only the control's designated rear starts are empty.
Capture the final actual settings and every inserted movement or fragment
in the later review packet. This revision adds two events and four columns
to the original 20 → 32 proposal to cover the missing phase/direction cases.

Manual accounting gives **208 planned body pass slots**: four O events at
18, four I events at 19, six entry fetches, and two passes for each of the
27 other cycles. They comprise 106 yarn-working passes, 16 shaping transfers
and 86 empty moves. Of the yarn-working passes, 20 additional fragments have
roller 0, the first two have 100, and the other 84 have 450. These counts
exclude the frame/finish and any additional moves introduced by lowering;
they are review expectations, not a generated file's pass count. The eight
events add 32 live loops: 16 through candidate splits and 16 empty starts
at the control, taking 40 initial loops to 72 at width 36.

The control reproduces the baseline **loop construction** under this common
schedule; it is not a byte replay of the 522-pass paisley file. In particular,
the candidate requires its front-ground yarn first, while that historical
first increase used the rear-ground yarn first. O/I assign the control's
new rear edge to the yarn starting at that end, so its colours can also
differ from the historical phase. These are declared comparison limits.
Both edges share the extra passes and global pull: this tests their loop
constructions under a common schedule, not the old file's original feeding
conditions. The preserved historical file remains a separate reference.

The candidate and control also start with different colour phases in E4,
E5 and E8. Treat colour-speck comparisons there as descriptive, not a
matched colour test. The swapped bands occur at different widths and later
in the same fabric; they help expose a side effect but are not independent
repeats. A claimed improvement should name side, phase, direction and width,
and any follow-up comparison should repeat that case before changing yarn
or settings. The eight-case table intentionally starts with inward-first
E1; it is coverage, not evidence that this is a qualified first machine run.

Before knitting, require the successful single-bed split observation and
independent software review of both mirrored candidates, both old edge
colour phases, occupied targets, parentage, carrier clearance, completion
of the pending state, and full start/finish. Keep rear/racked/adjacent split
refusals and the canonical machine checks. A new export-blocking finding is
not permission to bypass a check.

For the eventual operator record, map every event to exact machine passes
and ask for both faces and the edge in the same orientation, relaxed and
under the same light stretch. At each event record: supported/loose/dropped
loop; opening or yarn bar; colour speck; local course alignment/puckering;
whether the layers separate; and any pause or intervention with its pass.
Judge each edge against the control and against its swapped-band result.
A cleaner photograph alone is insufficient if loops drop, the join opens,
or extra passes cause feeding trouble.

## Review decision

The paper review finds no empty candidate knit, duplicate working stitch
or occupied transfer target in O/I, including both phases and the mirror.
It retains the inward-first needle order. This is a manual result about
the proposed selections, not Gate 3 approval or an executable-file verdict.

Approve, revise or reject the **two-cycle candidate with its cycle-2 edge
swap** together with the phase-specific outer-edge connections, temporary
empty R0 and front-colour rear parent. Accepting both directions also accepts
different held-loop timing for evaluation, not equivalent physical behavior.
Review the explicit 0/450 proposal and the unresolved split-first encoding
parity, and accept or revise the eight-case comparison's common-schedule
and unmatched-phase limits. The short-return alternative remains separate.
The next implementation, if approved, must demonstrate the numeric stops,
both yarn attachments, whole-row and start/finish coverage, and serialized
settings without weakening the existing checks. No code or operator file
is included with this note.

Checks performed for this document: read the existing baseline passes
119–147, sleeve passes 167–175 and jacquard Simple passes 40–57 with the
existing `studio passes` decoder; inspect the backend merge rules and current
safety envelope; manually trace the tables above. Revision 2 also reads the
existing Gate 2 passes 120–137 and historical startup passes 105–117,
inspects first-operation roller retention and one-shot roller support,
and manually accounts for both edges, all
interior stitches, the eight phase transitions and the 43 body cycles.
No new tests, proof run, matrix rebuild, controller acceptance or physical
knit is claimed. The user's requested review stop still applies before code.

Revision 3 independently re-reads the full O/I and event tables, the diamond
endpoint assertions, vendor split/miss attachment handling and first-operation
roller retention, simulator split/one-shot handling, and the canonical
take-down counter. It also reads existing Gate 2 pass 128 and its knit-first
source order, and rechecks Kniterate's split, roller and tensioning articles
linked above. The paper fixes attachment bookkeeping, separates
outer from inboard joins, adds both-phase/control return traces and held-loop
timing, and records the roller parity requirement without executing a new
schedule. The eight event phases, 43 cycles and 208 paper slots are unchanged.
