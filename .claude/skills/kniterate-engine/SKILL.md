---
name: kniterate-engine
description: Change, debug or verify how Kniterate Studio builds machine files (starts, cast-ons, bodies, shaping, bind-offs, frames) or investigate a physical knit failure. Use when a knit report comes back, a .kc looks wrong, or before changing anything that alters emitted passes (packages/machine-lib/src, Studio's compile pipelines).
---

# Engine work: find it, fix it against Kniterate's own files, prove it

Every file Studio writes goes to a real machine; a wrong pass costs a knit.
Work from the emitted file and Kniterate's own files, not from the design or
from settings alone. Commands print JSON; passes are numbered from 1, as on the
machine and in run records.

## 1. Before changing any output: register what was knitted

A knitted file must re-emit byte for byte to be registered, so register first:
`pnpm release:register -- <short-name> --package <handoff package dir>`, then
fill `run.json`, `outcome.md`, `machine.json`, `yarn.json` from the report
("not recorded" where unknown). The script requires no untracked files: move
`CLAUDE.md` and `docs/mockups/ui-ux-proposal.html` aside and back (never commit
or delete them). Then `pnpm --dir packages/machine-lib kniterate:swatches`.

## 2. Locate the problem in the file

```bash
pnpm --silent studio -- passes <package-or-project> 110-125          # what the machine did around the reported pass
pnpm --silent studio -- audit <package-or-project>                   # loop replay; each check states Kniterate's own figure
pnpm --silent studio -- reference                                    # Kniterate's files: ref:fairisle, ref:dbj, ref:sleeves, ...
pnpm --silent studio -- compare <package> ref:fairisle --carriers 2=4                   # section summary
pnpm --silent studio -- compare <package> ref:fairisle --carriers 2=4 --section cast-on # every differing pass
```

- Find the Kniterate file for the same construction (fairisle, birdseye/DBJ,
  2x2 rib beanie, the reversible sweater's front/back/sleeves, chain bind-off)
  and compare stitch by stitch. A difference from Kniterate is the first suspect;
  a match moves the question to yarn, settings or machine setup.
- The atlas (`packages/machine-lib/reference/atlas.json`) records each file's
  sections and notes (e.g. the reversible sweater knits its rib with C6, the
  waste carrier).

## 3. Decide the fix by evidence

Rank sources: Kniterate's own files; Kniterate's support articles, app manual
(Customist Studio) and staff answers; Kniterate's blog; experienced owners;
one-off posts. Check every claim against the files. A change away from
Kniterate's practice needs physical evidence or a clear mechanism, and is said
so in the code comment and STATUS.

## 4. Fix and pin it

- Make the smallest change in the emitter that owns the passes.
- Add a test that fails on the old code: revert the fix temporarily, run the
  test, restore. Prefer stitch-level assertions (the audit, a compare against
  the reference, exact pass rows) over pinned pass counts.
- Look for the same pattern in the other emitters (`grep` the helper names).

## 5. Prove nothing else broke

```bash
pnpm --silent studio -- matrix -o output/matrix  # every construction built and audited, about 20 s; exit 0 required
pnpm --dir packages/machine-lib kniterate:swatches
pnpm --dir packages/machine-lib verify:kcode     # proof receipt; do not interrupt (it deletes its outputs first)
pnpm verify
pnpm test:e2e --project=chromium --workers=4
git diff --check
```

Commit the change, then the refreshed `out/kcode-proof/proof-manifest.json` and
`registry/knit-proven.json` as a separate `chore(kcode-proof)` commit. Stage only
your paths.

## 6. Report

Say which files change and how (passes, needles, sections), which knitted
files are affected, what is software evidence versus knitted evidence, and what
the next knit should test. Never claim a fix works on the machine until it has
been knitted.
