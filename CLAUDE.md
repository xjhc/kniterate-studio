# CLAUDE.md

Kniterate Studio is a static React/TypeScript workspace for importing or
authoring colorwork, mapping it to Kniterate machine strategy, validating the
result, and exporting reproducible `.kc` files. It is local-first: there is no
backend, login, or telemetry.

## Start Here

Read `docs/STATUS.md` before planning documents. It is the current shipped vs.
proposed authority; older planning and design prose may describe work that is
already built or decisions that were later superseded. Verify important claims
against the working tree and tests.

Before changing code, inspect the closest comparable module and follow existing
components, contracts, data flow, and layout patterns. Do not build a parallel
abstraction when the repository already has a canonical one.

## Collaboration Defaults

- Ask before editing when ambiguity would change product behavior,
  architecture, machine safety, durable data, release scope, or an irreversible
  action. For routine low-risk gaps, use the simplest reasonable interpretation
  and state the assumption.
- Keep scope tight. Surface adjacent issues separately instead of folding them
  into the requested patch.
- Do not implement speculative flexibility or refactors. Machine-safety and
  evidence risks should still be reported when found.
- Preserve unrelated and concurrent work. Do not overwrite, revert, format, or
  stage another session's changes.
- State what was verified, what was not, and whether a claim is local software
  evidence, deployed-browser evidence, or physical-machine evidence.
- No placeholder UI, empty callbacks, fake integrations, or "coming soon"
  controls. If a feature is not ready, do not expose it.

## Git and Shared Checkout

The integration branch is **`accumulate`**. All implementation sessions work
and commit their completed requested changes directly there. Never work directly
on `main`.

- Do not create side branches or worktrees. They fragment the shared integration
  state and leave finished work easy to forget.
- At task start, verify the branch. If the checkout is not on `accumulate`,
  switch before editing. If concurrent or uncommitted work makes switching
  unsafe, stop and report the conflict; do not create a fallback branch or
  worktree.
- Commit completed requested work by default. Stage only owned paths or hunks;
  never use `git add -A` or otherwise sweep in concurrent changes.
- Never push, open or merge a pull request, tag, publish, or deploy unless the
  user explicitly asks. Task-completion authority is not release authority.
- Releases use one deliberate `accumulate` to `main` pull request. A push to
  `main` builds, smoke-tests and deploys GitHub Pages, so merging is a production
  action.
- Do not amend, rebase, force-push, or rewrite shared history for neatness.
  Preserve work over tidy history.
- Never run destructive Git cleanup such as `git reset --hard`, `git clean`, or
  forced checkout over modified files without explicit approval and a precise
  data-loss warning.
- Never run repository-wide write formatters. Format only files owned by the
  current task.
- Do not delete ignored files or directories. They can contain generated trial
  packages, browser evidence, caches, or machine-local state.

## Product and Architecture Invariants

- The four product nouns remain **project, chart, machine view, verdict**.
- The project document is durable intent. Compiler output and UI projections
  are derived state.
- `compileToRunArtifact()` is the deterministic compilation seam. Views render
  from `RunArtifact`; do not add UI-side machine math or reconstruct provenance
  heuristically.
- `apps/studio/src/engine.ts::resolveAuthoredVerdict` is the sole authored
  verdict-policy chokepoint. The V1 ladder is exactly Blocked, Surface-proven,
  and Knit-proven; there is no waiver or Experimental path.
- Knit-proven requires an exact clean physical-registry match. It is never
  granted from validators, simulation, screenshots, or user assertion alone.
- The Node and browser `KCodeConverter` adapters use the same vendored converter
  source. Converter or simulator changes must retain source equivalence,
  predicted-vs-vendor parity, reference-corpus coverage, refusal coverage, and
  topology checks.
- Simulation is a preview and provenance surface, not an independent verdict
  authority. Known frame/finish prediction differences must remain explicit.
- Studio owns yarn/carrier mapping, strategy, validation, verdicts, run
  artifacts, and machine files. KnitLab Chart owns its independent chart-product
  shell, reusable blocks, image intake, and `.knitlab` persistence. Their stable
  interchange boundary is `ColorworkChartV1` plus PNG.
- Preserve the fixed V1 machine profile unless the task explicitly changes the
  product contract: 252 needles at 7gg worsted; C1 draw, C2-C5 pattern, and C6
  waste.

## Commands and Verification

```bash
pnpm install
pnpm dev                 # http://127.0.0.1:5173
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm kniterate:conform
pnpm verify              # typecheck + tests + conformance + build + KCode receipt check
pnpm --silent studio -- help   # headless CLI: author, compile, export, inspect machine files
```

Two project skills live in `.claude/skills/`: `knit-design` (design a piece
with the CLI) and `kniterate-engine` (change or debug how machine files are
built, or investigate a knit failure). Use them for that work.

Use focused package or test commands while iterating. Run `pnpm verify` for
cross-package, compiler, converter, machine-output, or release-candidate work.
Run relevant browser coverage for user-visible flows. Always run
`git diff --check` on the final owned diff.

Do not describe a focused test as full verification, a local build as deployed
proof, or software conformance as physical-knit proof.

## Physical Trial and Release Safety

The software is `1.0.0-rc.1`. Do not tag or claim `1.0.0` until the exact
hash-pinned trial package has completed the real Kniterate procedure in
`docs/V1-PHYSICAL-TRIAL.md` and `pnpm release:physical-check` passes.

- Generate the immutable candidate with `pnpm release:trial`.
- Do not hand-edit the generated `.k` or `.kc` used for the physical claim.
- Record machine, software, yarn, gauge, tension, dimensions, photographs,
  stops, and interventions as required by the operator checklist.
- Register success with `pnpm release:register -- <short-name>` only from the
  actual machine run, and require byte-identical re-emission.
- If the run fails, keep the RC capped, record the failure, correct the engine,
  generate a new hash-bound candidate, and repeat. A failed candidate cannot be
  rehabilitated by prose or by testing a different artifact.

## Deployment

The application is static. `.github/workflows/pages.yml` builds, runs a
Chromium smoke test and deploys `apps/studio/dist` on every push to `main`;
the full `pnpm verify` and three-browser run happen on the pull request. Repository settings and deployment
credentials stay outside this file.

Do not push or merge merely to test deployment. Release closeout must identify
the exact commit, verification result, workflow result, deployed URL check, and
any still-pending physical gate.

## Documentation Map

- `docs/STATUS.md` — current shipped vs. proposed authority and docs map.
- `docs/HANDOFF.md` — short present-truth orientation.
- `docs/FOUNDING.md` — product boundary and durable principles.
- `docs/SYSTEM-DESIGN.md` — architecture and risk register; reconcile older
  proposal language against `STATUS.md` and code.
- `docs/ROADMAP.md` — milestone ledger.
- `docs/V1-PHYSICAL-TRIAL.md` — exact `1.0.0` physical promotion gate.
- `docs/mockups/workspace-target.md` — the binding workspace contract. The
  `.html` beside it is a retired mockup, kept for history.
- `CHANGELOG.md` — released user-facing changes; do not treat it as current
  implementation status.

Machine-specific or secret-bearing local facts belong in ignored local files,
never in this checked-in guidance.
