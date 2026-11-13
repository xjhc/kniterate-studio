# Reversible paisley development swatch

The user requested a first reversible paisley swatch inspired by Guest in
Residence's Wild Rag, using the previous orange/grey 2/14 acrylic pair. This
is a simplified authored chart, not an exact reconstruction of the photographed
cashmere scarf. The supplied Midnight/Butter URL currently shows Burnt Cocoa/Dune;
the design preview intentionally keeps midnight and butter.

## Side-edge correction (2026-11-11)

The earlier handoff explicitly required an explanation of layer connections and
side finishing: https://github.com/xjhc/kniterate-studio/issues/9#issuecomment-6800976769.
The first paisley export omitted the side join. That file, SHA-256
`6373e2c66fcb12a5325ea406c0f71c5f2965d6d05375023c0c0e0f92a5e09f3f`,
is superseded and retained under `paisley-swatch/superseded-open-sides/`.

Studio now blocks a reversible chart with non-alternating outer columns and
provides **Close side edges** in Backing and the plan's typed fix. This is one
undoable paint edit, visible in the chart and retained by save/reopen. Editing
or resizing away the joining stripes blocks export again. The supported recipe
needs at least three needles and three design rows. It reserves the outermost
column on each side, replacing any artwork there; it adds no width or passes.

Mechanism: the same yarn ends one row on an edge needle, turns, then knits
that edge on the opposite bed on its next pass. Tests follow that actual
emitted yarn path at both sides, not merely the reversed colours. Widths 19,
32, 33 and 68 retain exact complementary faces and both-bed top support.
This is our development selvedge, not an exact copy of a vendor border preset.

Sources distinguish inverse body from border closure:
[Kniterate's Borders/Close controls](https://support.kniterate.com/hc/en-us/articles/39032141113757-Global-Local-commands)
and [STOLL's cross-tubular jacquard description](https://nfc.stoll.com/faq/ckc_userguide/en/9303416331.html).
Their descriptions support the construction rationale; the exact stripe recipe
and its physical edge quality remain to be knitted.

For this paisley, 94 chart cells change, all in the two outermost columns.
The decoded comparison finds 94 changed body passes; all waste, draw, cast-on,
top and carrier-out passes remain identical, as do 190 of 284 body passes.
The total remains 426 passes. The motif interior, needle span, gauge assumption,
carriers, speeds, stitch sizes and roller settings are unchanged.

Acceptance for the physical trial: neither side peels into independent flaps;
edge stitches form without gaps/drops or excessive tightness; both faces show
the inverse motif; the bottom remains closed; both faces have supporting top
waste. Continue recording the earlier waste-start and persistent-left-stitch
issues separately. No further bind-off-only trial is requested.

## Candidate

- 68 needles × 95 design rows; one-based needles 93–160, centered.
- Predicted 26.2 × 27.9 cm at **assumed** 26 stitches / 34 rows per 10 cm.
  Readiness remains false until reversible-fabric gauge is measured.
- C3 orange, C4 grey: one strand of the previous 2/14 acrylic each.
  C1 draw thread; C6 waste. Preview palette colours are not yarn identities.
- 426 passes. SHA-256:
  `8de9d5e3a9bbd0c1eaaf40bce21a28f434682c21ed8bbcce887c1305f33f1c36`.
- Main body stitch 7, speed 200, roller 450; cast-on stitch 3, speed 100,
  roller 450, tubular roller 200. These are development settings, not
  experimentally established settings for this fabric.
- Eight top waste rows **per bed**, then drop both beds. Keep waste attached
  during measurement. Secure both faces on lifelines/needles before removing
  waste; finish by hand. This is a fabric trial, not another bind-off trial.

The cast-on joins the layers in the cast-on colour. **Both side edges now
use a one-stitch alternating-colour stripe**, linking the faces at each yarn
turnaround. Large plain interior areas may still separate; that is tubular
jacquard, not an open side. The top still requires hand finishing after
securing both faces. This is not yet a finished scarf. Watch the previously reported
early waste bunching and persistent left-edge failure from the beginning;
record the first affected pass rather than assuming the new construction
fixes that physical problem.

## Implementation and evidence

Normal Studio chart compilation now accepts the existing `complement` strategy.
It uses the repaired waste/carrier introduction, a full-bed zigzag and two
tubular rows at half rack (pinned to `reference/jacquard.kc`), complementary
body selections, no rear-to-front collapse, and tubular top waste. The body
mechanism uses the existing inverse-colour emitter; whole-program parity with
Kniterate's reference programs is not claimed.

`reversibleChart.test.ts` checks every body selection on both beds at widths
19, 32, 33 and 68, the full-bed cast-on, reference cast-on rack, absence of
transfers, eight waste loops per needle on each bed, and grouped drop passes.
It rejects one-colour and machine-bind-off requests. Restoring the old rear-bed
collapse made the regression tests fail. The 46-file construction matrix and
the final candidate's loop audit pass. Physical validation is pending.

The editable project and normal CLI package are in the workspace's
`paisley-swatch/` directory, beside this repository. The source chart is
`fixtures/colorwork-chart-v1/paisley-border.json`. Re-export the editable project:

```sh
pnpm studio package ../paisley-swatch/project.json -o ../paisley-swatch/package
pnpm studio audit ../paisley-swatch/package
```

## Agent and user experience

1. The typed edit/plan/render/export workflow works well: one project supplies
   the browser and CLI, preserving carrier assignments and assumed gauge.
   The new construction is exposed as **Invert colours** with its limits.
2. The strategy schema previously accepted complement while authored exports
   rejected it. Implementing the full construction closes that gap for
   two-colour rectangular charts; it does not add reversible beanies.
3. There is no useful photograph-to-paisley tracing workflow. The motif needed
   a deterministic authored redraw and visual review. Small paisleys lose
   detail at this resolution; judge the physical sample before scaling up.
4. The status still tells a swatch project to “Knit a swatch”, and generated
   sizing guidance says “hat” for a rectangle. A dedicated trial-project flow
   and object-specific wording would make the next action clearer.
5. The chart's first-needle field can disagree with centered KCode lowering
   after resizing. This candidate was aligned explicitly to 93–160; the
   general coordinate consistency issue still needs a separate fix.
6. The back design rendering needs an explicit viewing convention: an actual
   turned-over fabric is mirrored as well as colour-inverted. An authored
   side-by-side preview is included, but it is not a fabric simulation.
7. Machine-time estimates are heuristics, not measured duration. Studio shows
   about 53 minutes for this candidate; do not treat that as a promise.
8. Prior-run registration requires yarn/measurement facts that were not
   recorded. Preserve incomplete evidence without inventing values; a partial
   trial intake would improve the agent and operator workflow.

The complete release proof also depends on the repository's mutation and
physical-registry gates. Candidate Surface-proven status is software evidence,
not a claim that the full repository release gate or physical gate has passed.

## SD handoff and next steps (2026-11-11)

The joined-edge candidate was copied to the connected SD as `command.kc`
(516,348 bytes, 426 passes), read back and SHA-256 verified, then safely
ejected. The previous strip-2 command was backed up locally. `PAISLEY-NOTES/`
on the card contains setup, finishing and measurement records. No diamond
program was issued in this round.

Next work requested by the operator:
- [#18: reversible diamond increase/decrease trial](https://github.com/xjhc/kniterate-studio/issues/18).
- [#19: reusable tasteful trim for straight and shaped edges](https://github.com/xjhc/kniterate-studio/issues/19).

Carry forward joined sides, closed bottom, both-bed top support, the unresolved
waste/left-stitch observations, and no further bind-off-only trial by default.

## Physical result and next trial — 2026-11-11

Operator reports this joined-edge paisley successful. Both supplied photographs and exact issued file are preserved in `physical-trials/2026-11-11/paisley-joined-edges/`. Width 18.5 cm; height 21 cm includes top waste and excludes bottom waste, so body row gauge remains unknown. The success and measurements are in issue #9. See [the diamond handoff](REVERSIBLE-DIAMOND-TRIAL.md) for the next increase/decrease trial and validation limits.
