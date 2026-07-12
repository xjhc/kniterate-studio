# Terra-ready tasks

This is a staging list, not an assignment queue. Sol owns the v1 critical path
and should delegate only when the input contract is frozen enough that Terra can
implement a bounded surface without deciding machine truth.

## Ready now

None. M3B is closed, and the next M3C work begins with project, compiler Worker,
provenance, and verdict contracts. Writing a handoff for those would cost more
than implementing them and would move one-way-door decisions into review.

## Candidates after M3C contracts freeze

### T1 - Strategy comparison presentation

Build the strategy comparison rail from a supplied immutable
`StrategyPreviewV1` DTO and callback interface. Include loading, blocked, empty,
selected, and stale-result states plus focused component tests. Do not calculate
backing strategy, estimates, provenance, or verdicts in React.

### T2 - Carrier assignment controls

Build C2-C5 yarn assignment controls from a supplied project-edit factory and
validation result. Preserve exact palette identity and render validator messages
verbatim. Do not allocate carriers, reserve C1/C6, or invent repair behavior.

### T3 - Stable browser acceptance matrix

Expand Playwright coverage after M3C UI stabilizes: desktop/mobile, both themes,
strategy switching, stale Worker result rejection, chart-to-pass hover sync, and
screenshots. Assertions must target fixed public labels and artifact DTOs, not
compiler internals.

### T4 - Print run-sheet layout

Implement print CSS and visual regression coverage from a frozen `RunSheetV1`
artifact. Do not derive estimates, warnings, verdicts, or machine instructions in
the view layer.

## Keep with Sol

- project schema or edit-log changes
- Worker compilation orchestration, cancellation, and stale-result authority
- chart-row to pass provenance and cross-view synchronization contracts
- validator, verdict, frame, carrier-reservation, and export-gating semantics
- deterministic `.kc` conversion and byte-identical reopen/recompile proof

These areas are tightly coupled to physical safety or durable project truth; the
review loop would be slower and riskier than direct implementation.
