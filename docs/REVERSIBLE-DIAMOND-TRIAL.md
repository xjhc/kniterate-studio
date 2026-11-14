# Reversible diamond trial — 2026-11-11

The operator reported the joined-edge paisley successful and asked to prepare the next trial. This follows issue #18: increases/decreases for scarf shaping. Reusable trim remains a separate task in #19. There is no new bind-off experiment.

## Preserved result

The paisley candidate remains byte-identical after this change: SHA-256 `8de9d5e3a9bbd0c1eaaf40bce21a28f434682c21ed8bbcce887c1305f33f1c36`, 426 passes. It was registered as an incomplete development-trial scaffold before changing the compiler, then archived under `physical-trials/2026-11-11/paisley-joined-edges/`. The report and two photographs are preserved locally; the new photos were not published.

Success report: https://github.com/xjhc/kniterate-studio/issues/9#issuecomment-6802996293
Measurement follow-up: https://github.com/xjhc/kniterate-studio/issues/9#issuecomment-6803133343

Operator dimensions: 18.5 cm wide, 21 cm high including top waste and excluding bottom waste. Width implies approximately 36.76 stitches/10 cm across 68 stitches. This does not establish body row gauge. Do not mark 95/21 as measured body gauge. The diamond preview uses 36.76 stitches/10 cm and the previous assumed 34 rows/10 cm; the combined gauge remains assumed.

## Next candidate

- Reproducible project: `fixtures/colorwork-project-v1/reversible-diamond-trial.json`; working project: `../diamond-swatch.json`; handoff: `../diamond-swatch/package/`.
- 48 maximum stitches × 67 design rows; 16-stitch flat tips. Increase one stitch at each side every two rows, then decrease symmetrically. The widest section is three rows. These are engineering trial counts, not a sized scarf recipe or pointed-tip closure.
- Two contrasting centre columns make face inversion and distortion easy to inspect; one-stitch alternating-colour edges follow the active silhouette. This isolates shaping before adding paisley.
- C1: existing thin draw thread. C3: one strand orange 2/14 acrylic. C4: one strand grey 2/14 acrylic. C6: previous two strands 2/30 waste.
- Same reversible start/settings as successful paisley, now only 16 active needles at cast-on. Both beds retained through the finish; eight waste rows per bed, then drop. Secure both faces before removing waste.
- Current candidate: 1802 emitted passes; SHA-256 `42e784f88be622d47dc18f868aec2238107f6984d9b1e7dc3b3c941b8215f365`. The many carriage-only moves are included. Do not substitute the lower predicted pass count as machine pass count or a reliable duration estimate.
- Software verdict Surface-proven. Readiness remains false: shape+jacquard is a physical trial, not a validated scarf construction.

## Implementation

`strategy.diamond` persists tip width and rows per shaping step in the normal project edit history. Geometry is checked against chart dimensions. The colourwork projection uses canonical empty, M1L/M1R and SSK/K2TOG tiles and the existing shaped walker. The paired two-bed shaping units are unchanged: increases borrow a rear edge loop outward to a new front needle; decreases merge each disappearing bed's loop diagonally onto the opposite bed inward. These follow the existing reversible sweater reference construction (`reference/sleeves.kc`), not a new hand-written KCode recipe. The rear empty needles at increases are intentional and must be assessed in the physical trial.

The shaped walker receives the reversible frame's retain-both-beds flag. It keeps both beds at the top and knits alternating-colour active boundaries even where shape tiles replace ordinary colour keys. Uniform rows retain the inverse backing. Source-row provenance now tags shaped body operations, so audit/UI do not misclassify the body as cast-on. Studio's chart and CLI image mask inactive corners. The shaped-construction warning remains visible and now explains the physical check instead of claiming all backing is floats.

## Physical acceptance

Observe the narrower waste/cast-on, the first increases, the widest section, both decrease slopes and the final narrow top. Record every stop and its pass number. Check for dropped edge loops, holes/elongation at the rear borrowed-loop increases, unknitted doubled loops at decreases, separated sides, and distortion. Compare both faces and gently inspect the joined edges. Measure maximum width and **body-only** height separately from waste. Preserve the exact file and photos with the report before the next compiler change.

## Agent/user experience

The project → compile → audit → package path stays reproducible; no machine file was edited by hand. Row provenance was essential to avoid a false start-hold alarm. The UI now shows the silhouette, but shape parameters currently enter through a typed strategy edit rather than a dedicated shaping control. The existing size panel shows the maximum bounding box, not flat-tip width. Fit chart initially clipped the bottom in the current window; one Zoom out showed the full shape. Preview dimensions must not be mistaken for measured height. Those UI refinements and a reusable trim algorithm are follow-up work, not evidence that the physical shape is proven.

Additional UI limitation: the run schematic labels the top as “16 rows”; these are 16 separate bed-knitting passes, eight rows on each face. Its top-waste centimetre estimate must not be used as measured fabric height. The emitted program and trial instructions distinguish the two beds.

## Validation evidence

`verify:quick` passes: type checks, 898 unit tests, reference conformance checks and production build. Five diamond export tests cover small/wide silhouettes, solid and striped rows, invalid geometry/backing, exact inverse stitches, moving-edge bed changes, narrow cast-on, retained two-bed finish, source-row provenance, and transfer/rack signatures present in the sleeve reference. Temporarily restoring either old finish collapse or old shape-tile edge colour made four of those tests fail; both fixes were restored. The construction matrix builds/audits all 47 files successfully. Chromium: 51/54 initially passed while code was changing; the three failures all passed with one worker after changes stopped (54/54 across those runs).

The package manifest matches every file and its loop audit passes. The broad release proof is separate from these checks and physical promotion remains incomplete. Do not claim a clean release receipt from the trial checks.

Release-proof result: `verify:kcode` completed with a **blocked** receipt. Its early deterministic proof-test stage recorded 13 failures (one then-unupdated public API allowlist, subsequently fixed; the other failures were timeouts under concurrent load). Final `verify:quick` passed afterward, and the proof's later Studio integration, type checks, build and mutation stages passed; mutation evidence is 3213/3213 killed, no survivors. The receipt is preserved as blocked, not manually promoted. This is not a clean full release proof.

## Paisley artwork revision — 2026-11-11

The operator approved the test silhouette and requested paisley instead of the grey stripe. The current next-knit candidate is `../diamond-paisley-swatch/package/program.kc`, reproducible from `fixtures/colorwork-project-v1/reversible-diamond-paisley-trial.json`. Two large alternating paisleys and two small side motifs adapt the successful rectangular swatch artwork, with small tip accents and clear space beside the moving selvedges.

SHA-256 `7217462cfe9297bbffbbe82f78d683f6bde09292f0d979e007039beb5d9c9540`, still **1802 passes**. Only the pattern-yarn bed assignments change: pass-by-pass comparison confirms identical active columns, movement, racking, transfer actions, speeds and rollers; the start and finish pass payloads are byte-identical to the stripe trial. Loop audit passes and all package manifest hashes match. Export is Surface-proven; the physical shaping warning remains. No compiler change or full release-proof rerun was needed for this artwork edit. Both the original stripe trial and the successful rectangle remain preserved. The new project is open in Studio.
