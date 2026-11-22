# Registry

Two records of what has happened on a real Kniterate.

| Record | What it holds | What it is for |
|---|---|---|
| `knit-log.json` | Every knit whose exact machine file is in the repository: what the operator reported, and the passes a fault or a note belongs to. One short entry per knit. | `studio knitted`: which passes of a new file have knitted before, which have a fault on record, and which are new on the machine. |
| `swatches/` and `knit-proven.json` | A full record of one run: machine, yarn, tension, dimensions, photos. See `swatches/README.md`. | Knit-proven. Only an exact, clean, fully recorded file earns it. |

A knit goes in the log whatever its result and however thin the report. A swatch
entry is extra, for a run recorded well enough to promote. The log never grants
Knit-proven.

The log can only hold a knit whose bytes are in the repository. Put the file in
first, under `docs/physical-trials/<date>/<name>/`, including a file the operator
edited or made themselves.

## Add a knit to the log

Add an entry to `knits` in `knit-log.json`. Knits are listed oldest first, and
same-day knits in the order they were knitted: the order decides which knits come
after a fault. The loader refuses a log that is out of order, a misspelt field, a
file that is not the bytes recorded, and a pass or section that is not in the file.

```json
{
  "id": "2026-11-14-split-paisley",
  "date": "2026-11-14",
  "what": "Reversible paisley 8 to 21 to 8 columns with split increases (514 passes)",
  "file": "docs/physical-trials/2026-11-14/paisley-supported-split-candidate/program.kc",
  "sha256": "2868d508…aa1d",
  "yarns": { "1": "draw-thin", "3": "acrylic-2-14", "4": "acrylic-2-14", "6": "acrylic-2-30-x2" },
  "operatorSaidHowItRan": true,
  "report": "definitely better but not perfect",
  "source": "https://github.com/…#issuecomment-…",
  "events": [
    { "kind": "fault", "passes": [81, 104], "approximate": true, "what": "Waste stitches dropped twice while orange and grey were first brought in." },
    { "kind": "note", "passes": [[141, 141], [146, 146]], "approximate": true, "what": "Orange shows on the grey face at this increase." }
  ]
}
```

- **`file` and `sha256`** point at the exact bytes that were knitted, kept in the
  repository. A file edited at the machine is a different file: log that one.
- **`yarns`** maps each carrier to a key of the log's `yarns`. Add a yarn there
  when a new one is used; use `not-recorded` when the report does not say.
- **`knittedThrough`** is the exact last pass knitted when the run stopped early.
  Use `{ "section": "body" }` when the stop is only known to be somewhere in that
  section: only the prefix before the section is confirmed. Stopping during waste
  confirms no prefix. The log summary keeps the possible stop range in `stopWithin`;
  neither that range nor an estimated last pass is execution evidence. Faults in
  the uncertain section still warn on matching passes, marked `executionConfirmed:
  false`; they grant no clean credit or width observations. An event after the
  latest possible stop is refused.
- **`stoppedDuringPass`** records an operator-observed terminal stop during a
  numbered pass. For example, 104 confirms completion through 103 and permits
  a fault at 104. The interrupted pass contributes no completed execution or
  width credit. A stop during the first pass confirms zero completed passes.
  For a repair followed by a restart and completion, record the event at its
  pass and leave the terminal stop fields out.
- **`operatorSaidHowItRan`** is `true` when the operator said how the run went:
  what went wrong, or that it went well. Leave it `false` for a piece known only
  from a photo or a remark about how it looks. Such a knit still shows its passes
  have been on the machine, but it does not clear an earlier fault.
- **`report`** is the operator's words, and only theirs. **`caveat`** says what
  the record cannot establish (which file was loaded, whether stops were noted).

## Events

A **fault** is mechanical: a dropped or missed stitch, a yarn break, a stop, a
tangle. A **note** is about how the fabric looks. Say where it happened in one of
three ways:

| The report gives | Write | It counts against |
|---|---|---|
| A pass number from the machine | `"passes": [124, 124]` | every pass in the range |
| A stretch, a row or a part of the piece | `"passes": [81, 104], "approximate": true`, or `"section": "cast-on"` | the passes of that stretch that had not knitted before; failing that, the ones that knit runs nowhere else; failing that, all of them |
| That it happened while a feeder was being moved | `"carrierMoves": ["1", "6"]` | every pass after the cast-on that only moves one of those carriers, narrowed the same way |
| Nothing about where | no `passes` and no `section` | a fault makes the whole knit unclear: none of its passes counts as knitted. A note stays with the knit |

Several stretches go in one event: `"passes": [[132, 143], [160, 171]]`.
Sections are the ones `studio passes <file>` prints (waste, draw, cast-on, body,
bind-off, top).

Give a stretch exactly as wide as the report says, no narrower. "While the yarns
were brought in, before the release" is every pass from the first yarn brought in
to the release. Where the stretch is cut changes which passes carry the fault, so
a guess at the likeliest pass hides the others. When a piece changed two things at
once and the report cannot tell them apart, place the fault on the whole body: it
then counts against whatever was new in that piece.

Narrowing ranks suspects; it does not exonerate the other passes in the reported
range. Excluded passes remain uncertain for that knit: they add no clean credit,
no observed widths, and cannot help clear an earlier fault. For an unknown stop,
the fault keeps its location in the possible stop section. It does not move onto
the known prefix. A pass can therefore be both `new` (execution unconfirmed) and
in `faulted` (a fault warning): those counts overlap and the report says so.
Only confirmed executions can be offered as a closest knitted pass. A fault
beyond even the latest possible stop remains unplaced and makes the known prefix
unclear.

A pass number is worth more than any description. Ask for one for every stop,
drop and repair.

## How a pass is matched

`packages/machine-lib/src/knitout/kcode/knit-evidence.ts` describes each pass by
what it does at the fabric's edges: the yarn's role (waste, draw, first body yarn,
second, …), direction, cams, racking, speed, roller and stitch sizes; where the
carrier comes from and stops (inside the fabric, near it or far from it); and each
action with where it lands (edge needle, inside, beyond the edge), how many loops
the needle held and whether they had waited long. Two passes with the same
description have the same recorded edge actions. Each stitch selector stays with
its action and edge location; swapping the selectors at two edges is a new pass.
Transfers and splits retain the selectors at both the delivering and receiving needles.

`studio knitted` also shows `matchingRunRecords`. Each entry gives the run's
file hash, the last identical executable pass starting from home, and the last
pass in that shared prefix confirmed complete. This comparison checks both
needle beds, stitch fields, carriage and carrier stops, footer and ordered rack
commands. A full-file hash match is identified independently. Events keep the
operator's entire source range alongside the overlap with the shared start.
`possibleFaultHistory` retains weaker candidates and unlocated observations
even when another run supplied clean evidence for the same description.

Left out on purpose: the artwork between the edges, the width, and the place on
the bed. Width is kept beside the description, so a pass that has only knitted on
68 columns is reported as such on 20. An exact match needs an observed width.
Observations at 20 and 60 put 40 **between knitted widths**: this is informational,
not an exact match or an attention flag. Widths below 20 or above 60 are **narrower
or wider than any knit** and deserve attention. The report preserves the actual
observations in both cases. The first cast-on uses its selected-needle span,
even though no loops existed before it. On about eight columns or fewer every needle
is near an edge, and passes there read differently from the same pass on a wider
fabric.

What this cannot see: the yarn itself, anything the machine does that the file
does not say, and what happened more than one pass ago beyond the loops it left.
A match means the machine has run this pass with no fault reported. It does not
mean the pass will knit.

## When a fault stops counting

A pass with a fault on record is flagged until two later runs with an operator
report have completed the same pass description cleanly at any width. Each run
counts once, even when it repeats the pass or works it at several widths. A new
fault on that description restarts the two-run count.

For both active and cleared faults, `studio knitted` also lists each width
where the fault was reported and the number of later clean runs there since
the most recent fault at that width. A warning can clear with this count still
at zero. Its fault reports remain in the history.
An approximate fault that includes the pass cannot count as a clean knit, even
when another pass is ranked as its likelier cause.

## Known limits

- A fault warning travels with its pass description across widths. The width
  breakdown identifies where it was reported and where later runs supplied evidence.
- **A vague report is placed by rule, not by knowledge.** The rule for a stretch
  can rank the wrong suspect; all other passes in that range still remain uncertain.
- **Unknown execution is not coverage.** `new` means there is no confirmed
  execution for the pass; an aborted run may have reached it without recording how far.
- **One pass at a time.** A pass is not told apart by what came several passes
  before it, beyond the loops and the carrier position that were left.
- **Same-day order is by hand.** Two knits on one day count in the order the log
  lists them.
- **Not every knit is here.** The log holds knits whose files are in the
  repository. A piece knitted from a file nobody kept is not evidence.

## Checks

The knit log is deliberately outside the compiler proof fingerprint. Recording
a knit remains a one-file edit; it does not require a full proof run or a receipt
commit. The log loader still validates file hashes and records, and the proof
runs the evidence, log and matrix regression tests. The receipt attests to those
software checks, not to the current contents of the operator ledger.
Use `pnpm --silent studio -- knitted` to validate and inspect a log edit.

`apps/studio/src/knitLog.test.ts` loads the log against its files (a wrong hash, a
pass outside the file or an unknown section fails) and pins how reports are joined
to passes. `apps/studio/src/engineMatrix.test.ts` holds the reversible chart from
Studio's normal export to the log: a compiler change that gives it a pass the
machine has not run fails there.
