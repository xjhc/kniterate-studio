# Machine extraction provenance

Source: `/home/xjhc/pro/knitlab2` at commit
`12a0ecb36ff729b117b3bbf3d8a76fd3b9768668` (runtime source clean; local
documentation changes excluded) as used on 2026-07-09.
Destination: `packages/machine-lib`.

## Included

- chart-to-knitout compiler and plan lowering
- Kniterate extension headers and vendored `.kc` conversion
- `.kc` parser, decompiler, diff, pass sections, and carriage simulator
- fairisle, DBJ, stockinette, bind-off, waste, cable, and shaping passes used
  by the chart compiler
- chart-core operations needed by the compiler
- machine-facing colorwork adapters and chart contract
- bed-state, carriage, chart, knitout, and tile-conservation validators
- reference `.kc` files and the two small vendored topology-oracle scripts
- refusal corpus and physical swatch registry schema/templates

## Excluded

- chart editor and React host
- hand-knit symbol editor, instructions, publishing, and Explore surfaces
- measurement-first garment engine and schedule/render validators
- `compile-package*`, tech-pack notes, garment surface package, and its mixed
  hand-knit corpus
- stitch maps, calculator, MCP, sessions API, and app/server code

## Intentional extraction edit

`machine-settings-consumption.ts` previously imported
`CompilePackageToPlanInput` only to read its optional `kniterate` property.
The extracted copy replaces that type-only garment bridge with the local
structural `PackageMachineSettingsInput`. Runtime behavior is unchanged and
the focused compiler/parity rails remain green.

`kniterate-swatch-registry-check.ts` also suppresses `git rev-parse` stderr in
an unborn repository; it still returns `null` until the first commit and does
not raise any artifact to Knit-proven.

## Public API audit - 2026-07-12

- `src/index.ts` is the full Node/compiler entry and is the only public surface
  exposing the subprocess converter.
- `src/browser.ts` is an explicit browser-safe allowlist. Its runtime exports
  are pinned by `test/public-api.test.ts`; Node adapters cannot leak into the
  Studio bundle unnoticed.
- `./browser-converter` is isolated so the vendored source enters only the
  conversion Worker, not the main application or compile Worker.
- The extraction currently contains 115 source files and 26 test/support files.
  Garment, hand-knit, server, publication, and session surfaces remain absent.
- `kniterate:conform` now generates six machine-only rectangular programs
  (stockinette plus all v1 backing routes) and runs the vendored topology oracle
  across their emitted `.k` files. No hand-knit surface corpus is used.
