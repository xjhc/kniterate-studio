# ColorworkProjectV1

`@kniterate-studio/project-contract` is the durable Studio project boundary.

## Authority model

- `base` is the initial project intent.
- `history.entries` is the canonical ordered edit log.
- `history.cursor` selects the applied prefix and implements undo/redo.
- `history.checkpoints` are acceleration caches only. File parsing replays the
  authoritative log and rejects a checkpoint that disagrees.
- `materializeColorworkProject` derives the current chart, machine intent, and
  override status. Views never mutate the materialized state.

Every mutation uses the same `ProjectEdit` union regardless of whether it came
from the canvas, a strategy control, or the future assistant. A new edit after
undo truncates the redo branch. Every 50 committed edits stores a checkpoint.

## Anchors

Rows have stable IDs independent of their array position. Stitch overrides use
`(rowId, needleIndex)`; pass overrides use `(rowId, purpose, ordinal)`. Inserting
a row preserves anchors. Deleting an anchored row or shrinking past a stitch
anchor quarantines the override with an explicit reason; it is never discarded.

The v1 machine profile is fixed to `kniterate-7gg-worsted-v1`. Pattern yarns
may bind only to C2-C5, at most once per palette color and carrier.

## File versions

Files are written as `version: 2`. Version 1 files are accepted and upgraded
on read; v2 adds only optional state (`gauge`, `target`) and their edits
(`set-gauge`, `set-target`), so every v1 edit, row ID, cursor, and override
status is preserved unchanged. Gauge and target never change the compiled
program: the chart's stitch and row counts remain its only source of truth,
and Studio's plan checks them against the target at the recorded gauge.
