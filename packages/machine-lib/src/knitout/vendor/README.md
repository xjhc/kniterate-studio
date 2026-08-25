# Vendored dependencies

## `knitout-to-kcode.cjs`

This is a locally maintained fork of the Carnegie Mellon Textiles Lab
Knitout-to-KCode compiler. It is not behaviorally identical to upstream.

### Immutable upstream baseline

- Repository: <https://github.com/textiles-lab/knitout-backend-kniterate>
- Revision: [`b19ae3d25fe7b977513362731ed1ff9220dacf69`](https://github.com/textiles-lab/knitout-backend-kniterate/blob/b19ae3d25fe7b977513362731ed1ff9220dacf69/knitout-to-kcode.js)
- Upstream `knitout-to-kcode.js` SHA-256:
  `a20b24b2c2198d9eb6c3114e0b0bc02a1ba3e97acad7dac8e20b335111bad2e7`
- License: MIT, preserved verbatim in
  [`LICENSE.knitout-backend-kniterate`](./LICENSE.knitout-backend-kniterate)
- Authors: McCann et al., Carnegie Mellon Textiles Lab, with contributions from
  Gabrielle Ohlson and others

The fork entered this repository from `/home/xjhc/pro/knitlab2` revision
`12a0ecb36ff729b117b3bbf3d8a76fd3b9768668`. The extracted CJS baseline has
SHA-256
`5d26b31138dd71e7f055b8b3e3f0c57d322b2fc24c6d91f50a6fe5c7a94e6fc3`.
That extraction already contained local changes; the old description of it as
an extension-only rename was incorrect.

### Local patch ledger

The fork intentionally adds behavior that upstream revision `b19ae3d2` does
not provide:

- `knitlab2` machine extensions for presser speed/roller and explicit carriage
  parking;
- App-compatible output naming, row labels, separators, and carriage-move
  settings;
- conversion-scoped mutable settings so repeated and interleaved conversions
  remain deterministic;
- exact Knitout source-line propagation and post-lowering scheduled-pass trace
  capture for Studio provenance and KCode differential checks;
- fail-closed limits on scheduled passes, emitted passes, emitted selected
  cells, and emitted KCode records, selected through fixed named resource
  profiles (`foreign-v1`: 4,096 passes / 200,000 cells / 50,000 KCode records;
  `authored-v1`: 8,192 / 200,000 / 100,000); and
- CommonJS exports plus a generated browser ESM module with the Node driver
  removed.

`knitout-to-kcode.cjs` is the canonical local fork. The browser module is
generated from that file by `scripts/generate-browser-converter.ts`.
"Source equivalence" in this repository means that the Node and browser
adapters execute this same local fork; it does not mean upstream equivalence.
The KCode proof receipt fingerprints the exact fork bytes.

### Updating the fork

An upstream update must name a new immutable revision and source hash, rebase
and update the patch ledger deliberately, preserve the upstream license, run
`pnpm generate:browser-converter`, and pass both `pnpm verify:kcode` and the full
`pnpm verify` gate. Do not copy mutable `master` and call it equivalent.
