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
