# V1 physical trial

**Status:** software package ready; machine run pending.

The founding contract requires a representative multicolor rectangle on a real
Kniterate before `1.0.0`. Build the immutable trial package with:

```bash
pnpm release:trial
```

The command writes `out/v1-knit-trial/`:

- `project.kniterate-studio.json` and `chart.colorwork.json`
- validated `blanket.k` and `blanket.kc`
- `manifest.json` with the compile hash, SHA-256 identities, carrier map,
  dimensions, frame, pass counts, and estimated time
- `OPERATOR-CHECKLIST.md` for the actual machine session

The release trial is a 120x160 four-color birdseye rectangle on the fixed 7gg
profile: C1 draw, C2-C5 pattern yarns, C6 waste, 20 waste rows, and machine
bind-off. The current generated package has 152,488 Knitout operations, 2,656
predicted passes, 2,662 vendor-emitted passes, and an estimated 15,102 seconds.
The six-pass preview delta is confined to the known-approximate frame/finish
tail; body parity and generated-file revalidation gate export.

## Promotion gate

1. Complete the operator checklist and record exact yarn brand, line, lot,
   fiber, machine identity, software revision, gauge, and tension settings.
2. Confirm waste, draw thread, carrier bring-in, body, backing, edges, and
   bind-off complete without manual source edits.
3. Photograph front/back and all four boundaries; record rested dimensions and
   every machine stop or intervention.
4. If the run fails, keep the RC capped, add the failure to the refusal corpus,
   fix the engine, regenerate, and repeat.
5. If it succeeds, register the exact artifact under
   `packages/machine-lib/registry/swatches/`, verify the fingerprint match, bump
   workspace versions from `1.0.0-rc.1` to `1.0.0`, and tag the release.

This single blanket run closes the v1 release ruling. M4's broader Knit-proven
gate remains four exact registry entries: tension, fairisle, birdseye, and
complement.
