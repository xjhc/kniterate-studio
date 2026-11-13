# Gate 3: reversible increase design for review — 2026-11-13

**Paper proposal only. No emitter, simulator, test, safety rule or machine file
was changed or generated for this design.** The loop states below were worked
through by hand against the existing files and split semantics; they are not
a new automated replay or a physical result.

Recommend taking the reviewer's **two splits and one transfer, over two yarn
cycles** to the next engineering gate, with an explicit alternating edge join.
It replaces the baseline's two empty rear starts with supported loops. It
does not promise an invisible increase: the rear receives a front-colour
parent, and the edge keeps its alternating-colour border.

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
two machine passes. A split pass can also knit selected front needles, but
cannot include ordinary rear knitting in the current command contract/backend.

Entry to the table below requires A on the left, B clear of the future right
edge, and the carriage on the right. Establish that state with ordinary
carrier fetch/clearance moves **before** moving any attached edge loop.
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

This is a directional schedule for the local operation, including its empty
returns. Other needles knit their assigned yarn once per cycle; they must
not knit again merely because a cycle is split into multiple passes.

| Paper pass | Direction / yarn | Rack | Loop or yarn move |
| --- | --- | ---: | --- |
| P1 | ←, no yarn | +1 | Transfer b from R0 to empty F1. R0 is now empty. Reset rack to 0 before P2. |
| P2, cycle 1 | →, A | 0 | Knit F0 through a, making a1. Split F1: move b to R1 and make c1 of A through b at F1. Other selected front needles knit normally. |
| P3, cycle 1 | ←, B | 0 | Knit R1 through b, making d1. **Skip R0**, which is empty. Knit B's other assigned needles. |
| P4 | →, no yarn | 0 | Fetch the carriage to the right for A. No loop changes. |
| P5, cycle 2 | ←, A | 0 | Knit R1 through d1, making d2. This takes A from its previous last stitch on F1 across to R1, closing the outer edge return. Hold F1. |
| P6 | →, A, no knitting | 0 | Return A outside the edge so the remaining A work can also run leftward. No loop changes. |
| P7, cycle 2 | ←, A | 0 | Split F0: move a1 to empty R0 and make a2 of A through a1 at F0. Knit the remaining assigned front needles. Do not knit F1 or R1 again. |
| P8, cycle 2 | →, B | 0 | Knit R0 through a1, making b2. Knit F1 through c1, making c2. Knit B's other assigned needles; hold R1. |

P5 and P7 are separate yarn-working passes, even though both belong to A's
second cycle. The backend's `merge_types` in
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
| P1 | a | — | b | — | 2 |
| P2 | a1 = A(a) | — | c1 = A(b) | b | 3 |
| P3 | a1 | — | c1 | d1 = B(b) | 3 |
| P5 | a1 | — | c1 | d2 = A(d1) | 3 |
| P7 | a2 = A(a1) | a1 | c1 | d2 | 4 |
| P8 | a2 | b2 = B(a1) | c2 = B(c1) | d2 | 4 |

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

The new outer column continues the one-column alternating border. In the
next normal cycle, B starts leftward at R1 after its previous last stitch at
F1; A returns rightward to F1. That B turnaround crosses beds too. Continue
the existing joined-border schedule afterward, accounting for actual yarn
directions rather than only row-number parity.

At the growth itself, c1 and d1 share b as a parent on the new column. At
closure, a2 and b2 share a1. These are the proposed structural connections
between the faces; P5 and the next B return preserve the yarn-path joins.
This establishes a paper connection, not the size or appearance of an edge
opening. In the illustrated initial colour phase, a grey parent may show on
the orange rear face at R0; the new front edge can show its orange parent b.
The alternating edge loops are intentional.

The operation is **pending after cycle 1**. Current completed-row assertions
expect both beds occupied, so an implementation must represent and test this
specific two-cycle state, not silently weaken that invariant for all shapes.
Do not start another increase, a decrease, finish, or arbitrary motif work
on these two columns until P8 completes. A four-cycle comparison interval
leaves two ordinary cycles after closure.

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
| Local loop-working passes, including transfer | 5: transfer + four yarn passes, in the ordinary baseline phase | At least 6: transfer + five yarn passes |
| Completed first-cycle occupation | Four needles | Three; R0 deliberately empty |
| Completed second-cycle occupation | Four needles | Four needles |
| Old-column rear ancestry | Empty-start A loop, then B | A parent transferred from front, then B |
| Physical edge quality | Poor widening reported; exact photo/file link inferred | Unknown |

Baseline passes 123–130 cover the first increase plus the next cycle: eight
actual passes, including three empty moves. The candidate's P1–P8 are eight
local pass slots **after its entry state has been established**, including
two empty returns. These are not equal full-file costs. Candidate clearance,
fetches, rack scheduling and any rear knitting elsewhere in an A split cycle
can add passes; the opposite edge can force further fragmentation. No total
machine-pass count, stops, speed/roller choice for the extra fragments, or
runnable file is claimed before lowering and checking an approved design.
In particular, extra fragments must not accidentally apply a full extra
course's take-down. The pinned converter and its transfer roller stay fixed.

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
The two-cycle candidate avoids this extra yarn-path experiment while making
the missing B knit and substituted A parent explicit.

### Other starting points

- Keeping both cycles strictly A-front/B-rear omits the alternating outer
  edge return. P5/P8 are the deliberate correction to that simpler sketch.
- Simple on jacquard is a negative control, not a solution: the capture puts
  a wrong-colour front stitch in and then starts three rear needles empty.
- The [11 November derivation](REVERSIBLE-INCREASE-RESEARCH.md) uses a rear
  split, racked splits and a second temporary outside column. Its earlier
  synthetic results do not validate this proposal. Those split forms remain
  refused; this note does not seek a safety exception.

## Mirror and one small comparison piece

For a left-edge candidate, F1/R1 are at e−1, the initial transfer is rack −1,
and every horizontal direction in P1–P8 reverses. The loop ledger is the
same. A starts on the right and B on the left. This is a paper mirror only:
carrier stops, attached-yarn clearance and the full emitted schedule must
be checked independently on each side.

Propose one plain two-colour piece, **20 → 32 columns, about 40 body cycles**:

| Region | Cycles | Left edge | Right edge |
| --- | ---: | --- | --- |
| Settle and record normal joined border | 8 | Straight | Straight |
| Comparison band 1 | 12 | Baseline borrow | Preferred candidate |
| Straight separator and phase preparation | 4 | Straight | Straight |
| Comparison band 2 | 12 | Preferred candidate | Baseline borrow |
| Observe normal resumption before top waste | 4 | Straight | Straight |

Each comparison band has three paired widening events, four cycles apart;
both edges gain one column at each event. Each candidate completes on the
next cycle. Swap the methods between bands to expose left/right effects.
Do not put candidate increases on both edges simultaneously in this first
piece. Use a blank centre, the same two cones, shared start/finish and a
constant settings policy across both methods; capture the final actual
settings and every extra fragment in the later review packet.

The control reproduces the baseline **loop construction** under this common
schedule; it is not a byte replay of the 522-pass paisley file. In particular,
the candidate requires its front-ground yarn first, while that historical
first increase used the rear-ground yarn first. The control's two empty
starts and yarn assignments must remain explicit, and any order/parking
differences must be recorded as comparison limits. The common row planner
must preserve both edge joins and avoid double-knitting interior needles.
If it cannot, revise this paper schedule before producing a swatch.

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

Approve, revise or reject the **two-cycle candidate with the P5/P8 edge
swap**, including the temporary empty R0, front-colour rear parent and extra
pass fragmentation. The short-return alternative remains a separate option.
The review should also accept or revise the proposed crossover control and
its yarn-order limitation. No implementation or operator file is included
with this note.

Checks performed for this document: read the existing baseline passes
119–147, sleeve passes 167–175 and jacquard Simple passes 40–57 with the
existing `studio passes` decoder; inspect the backend merge rules and current
safety envelope; manually trace the tables above. No new tests, proof run,
matrix rebuild, controller acceptance or physical knit is claimed.
