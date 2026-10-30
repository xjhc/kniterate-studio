# Close the remaining small gaps

Revised 2026-10-30 after reviewing the proposed rules against emitted programs.
[STATUS.md](./STATUS.md) records implemented behavior; [ROADMAP.md](./ROADMAP.md)
keeps A's waiting beanie development run and usability work first. Keep the
pinned converter, fixed 7gg profile and existing export gates. The Fairisle frame
is generated choreography reproducing the reference's first 112 passes.

## 1. Check final-use parking, preserve colourwork floats

Implemented in `machine-safety.ts`: apply the existing attached-yarn span check
also after a carrier's **final loop-forming pass**. A later knit, tuck or split
means the earlier within-pass carry stays outside this blocking rule. Existing
checks after explicit empty moves still apply. Direction, rack, transfer handling,
the 7-needle distance and the 36-covering-knit threshold are unchanged.

The suggested shortcut, “next carrier use is an empty move,” cannot establish
that the yarn goes out: the references contain 490 such sequences followed by
more knitting. Final-use parking is a narrower conservative product policy;
KCode still cannot prove a cut or the physical shape of the yarn.

Before the change, four policies were compared on all 13 reference files, the
stored bird beanie and fresh Birdseye/Fairisle compiles, four other authored
cases and 36 low-level colourwork variants. The implemented policy adds no
findings to those files. Broadly checking every within-pass carry adds 90
findings to already-blocked low-level cases. Targeted tests distinguish terminal
parking from continuing knitting, including a fetch before knitting resumes,
both beds, both directions and tuck use. See the
[comparison](./benchmarks/yarn-parking-audit.json).

**Remaining:** physical qualification of the inferred clearance limits stays in
B. These comparisons establish software behavior, not physical clearance.

## 2. Check one-needle sequences; leave pickup stability evidence-led

Added converter-backed transfer → drop → recast sequences in both bed directions
at rack −1/0/+1. They compare before/after execution counts, validator final
state, topology identities and safety tuck-stack decisions. Dropped loops end;
new tucks start fresh, and knitting joins the new parents. Existing implementations
agree, so no loop-state rewrite was needed.

**Remaining:** a pickup detector needs a demonstrated unstable sequence paired
with an accepted construction and its setup. Empty-needle knitting and parentless
loops are also valid cast-ons, so neither alone defines a failure. Keep pickup
stability open until that distinction is supported; do not present count replay
as a stability check.

## 3. Close the compiler fingerprint gap now

Added the sweater compiler and runtime helpers used by authored production and
eligibility to `COMPILER_FINGERPRINT_INPUTS`. A dependency-closure regression
checks relative runtime imports from the rectangle, sweater and authored entry
points, so a newly imported helper cannot silently escape the fingerprint.
Presentation-only files remain outside that set.

This intentionally changes the fingerprint. The waiting beanie's original files
remain useful for a development run; any registration must retain the originating
source/artifact identity, and it cannot qualify the changed compiler. No physical
entry is created by this work. Freeze and requalification remain M9 work.

## 4. Answer the sweater replay-capacity question

The existing admission budgets imply at most **324,576 events**, below the
400,000-event replay limit: 200,000 selections + three events per 8,192 passes
(including a possible empty-pass action) + at most 100,000 rack records. A small
regression guards this relationship.

One synthetic maximum-plan-width, schema-maximum-body-length sweater compiles a
240-needle, 703-row front/back with 195,394 selections and **198,500 events**.
Replay ends in the validator's exact state. The whole synthetic sweater remains
blocked by two existing sleeve attached-yarn errors; this is a capacity result,
not an export-ready or physically qualified garment. Reproduce with
`node --import tsx scripts/audit-sweater-replay-capacity.ts`; the
[report](./benchmarks/sweater-replay-capacity.json) records inputs and hashes.

## Deferred

Held-fabric/increase checks and inspection filters/occupancy colors stay as
roadmap entries. Presets remain in A and inferred-limit qualification in B.
The complete rectangle/beanie/sweater manifest, fit tolerances, assembly evidence
and expanded physical-release check remain in D/M9. No native backend, automatic
0.5 rack or invented 20–232 needle margin is included.
