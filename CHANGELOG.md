# Changelog

## Unreleased

- Added a strict, lossless KCode parser with exact byte round trips, a versioned
  7gg machine contract, canonical V1 raster semantics, and fail-closed
  foreign-file intake, including bounded record and diagnostic materialization
  for adversarial inputs.
- Added exact emitted `MachineTraceV1`, KCode-native carriage/carrier/loop-state
  validation, full-raster trace diffing, and a synchronized movement instrument
  for carriage, carrier guide, front/rear beds, transfers, and splits.
- Replaced approximate authored pass joins with pinned-backend scheduled-pass
  provenance and exact Knitout source-line-to-design-row links.
- Added deterministic lowering checks, independent parser/replay oracles,
  property and grammar/input-mutation rails, seeded backend differential
  coverage, and `pnpm verify:kcode` with a reproducible software-proof manifest.
- Made foreign Knitout intake run the pinned lowering, strict emitted-KCode
  parser, MachineTrace replay, and scheduled-pass differential used for authored
  output; added conservative shared loop-stack policy and fail-closed source,
  record, pass, selection, diagnostic, and UI-materialization budgets with
  adversarial regressions across browser and Node entry points.
- Made the physical registry manifest a read-only build/proof input. Updating it
  is now an explicit registry-authoring action rather than a build side effect;
  promotion now requires structured machine, yarn, run, placement, measurement,
  inspection, and photo-receipt evidence plus a fresh in-process byte-identical
  recompile and re-emission.
- Added a blocking machine-safety envelope for every authored and imported
  machine file. It refuses facing needles at a whole-number rack, work off the
  bed edge, idle feeders near the needles, short carriage and carrier
  overruns, transfers with a carrier (split stitches, until their encoding is
  verified), carrierless tucks, and carriers that don't start and end at
  home. It also refuses speed, roller, takedown, stitch
  and transfer settings outside Kniterate's documented and observed range.
  It also refuses neighbouring transfers in one pass, more than four loops in
  a central short row, more than two tucked loops on a needle, and work under
  a yarn that a carrier dragged away without knitting, such as one taken out
  on the right partway through. Studio's chain bind-off now starts on the
  side its yarn ended instead of dragging the yarn across first. Project
  settings outside Studio's limits, or fewer than 70 waste rows, no longer
  compile, and every knittable project lists the start-of-job operator
  checks.
- Kept physical knitting outside the software oracle; the existing hash-bound
  real-machine trial remains the final release gate.

## 1.0.0-rc.1 - 2026-07-12

- Added local `.kc` and Knitout intake, virtualized pass inspection, diagnostics,
  verdicts, pass diff, and printable run sheets.
- Added embedded rectangular colorwork authoring with project-wide undo/redo,
  exact palette identity, selection tools, clipboard, resizing, and dark/mobile
  layouts.
- Added fixed 7gg blanket setup with C1 draw thread, C2-C5 pattern yarns, C6
  waste yarn, five backing comparisons, engine-derived back faces, and frame
  controls.
- Added debounced Worker compilation, design-row provenance, synchronized
  predicted passes, anchored findings, and generated k-code source spans.
- Added browser-side vendored `.kc` conversion, reconstruction validation,
  gated export, deterministic project reopen, and byte-identical re-export.
- Added machine-only rectangle topology fixtures, refusal cases, reference
  parity rails, and a reproducible physical blanket trial package.
- Added hash-checked physical registry scaffolding, fail-closed release
  promotion, and exact-artifact Knit-proven verdicts for authored k-code.
  Reopened foreign k-code remains Surface-proven until a trusted verifier binds
  the supplied bytes to a registry entry; import callers cannot supply proof IDs.

The RC remains capped at Surface-proven. Promotion to `1.0.0` requires the
representative blanket trial documented in `docs/V1-PHYSICAL-TRIAL.md`.
