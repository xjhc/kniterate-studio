# Machine library

This package is a mechanical extraction of the proven Kniterate compiler,
codecs, simulator, validators, conformance rails, and reference corpus from
`knitlab2`. Do not rewrite machine behavior during extraction.

The package deliberately has no React, chart-editor, hand-knit publication,
or measurement-first garment UI dependency. The focused M1 rail is:

```bash
pnpm test:reference-kc
pnpm test:compiler
pnpm test:revalidation
pnpm kniterate:refusals
pnpm kniterate:swatches
```

The root `pnpm kniterate:conform` assembles those rails and writes
`out/kniterate-conformance-report.json`. See
[`../../docs/EXTRACTION.md`](../../docs/EXTRACTION.md) for included and excluded
source boundaries.
