# Vendored dependencies

## knitout-to-kcode.cjs

The Knitout-to-KCode compiler from the Carnegie Mellon Textiles Lab.

- **Source:** https://github.com/textiles-lab/knitout-backend-kniterate/blob/master/knitout-to-kcode.js
- **License:** MIT (see upstream repo)
- **Authors:** McCann et al., Carnegie Mellon Textiles Lab; contributions
  from Gabrielle Ohlson and others
- **Vendored:** 2026-05-17, unmodified except for the file extension
  (`.js` → `.cjs`) since the file is CommonJS and our project is ESM.

This file is invoked by `src/knitout/kniterate/to-kcode.ts` as a
subprocess. It accepts a `.k` (knitout) file on disk and writes a `.kc`
(k-code) file. The compiler also exposes its functions for browser use
when `typeof(window) !== 'undefined'`; the wizard UI uses that path.

If you update this file from upstream, re-run
`npx vitest run test/knitout/to-kcode.test.ts` to ensure the smoke
fixture still round-trips.
