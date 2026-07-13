# Session handoff — 2026-07-12

> **Current handoff:** M0-M3D are complete and the repository is at
> `1.0.0-rc.1`. Studio authors/imports rectangular four-color charts, compiles
> five backing routes off the UI thread, validates browser-generated `.kc`,
> exports only the current validated revision, and reopens byte-identically.
> `pnpm verify` includes the reference, compiler, refusal, public-API, generated
> rectangle, and topology rails; seven checked-in Playwright tests cover the
> product flow. `pnpm release:trial` deterministically builds the 120x160
> four-color machine package in `out/v1-knit-trial/`. The only v1 promotion gate
> is the real-Kniterate run in `V1-PHYSICAL-TRIAL.md`; registration, compiler and
> output hash checks, Studio's exact-artifact Knit-proven state, and the
> fail-closed `release:physical-check` are implemented. Do not label or tag
> `1.0.0` before the machine run succeeds. The historical session material below
> is retained for provenance, not as current status.

> **Implementation update:** the user accepted the residual decisions: four
> simultaneous pattern colors (C2–C5), embedded shared canvas (R1=B), fixed 7gg
> worsted v1 profile, physical blanket before v1, S1-first build order, and the
> canonical mockup + BUILD-S1 brief as sufficient design gate. S1 implementation
> is now underway; see ROADMAP M2 for current live-tree status. The older gap
> list below is historical context, not current task status.

**For:** a fresh Fable session.
**Mission:** close the gaps this session found in the doc/mockup review, and land
the rebuilt pipeline mockup. This is cleanup + one new mockup, not new product
direction — the direction is settled in [`UX-PROPOSAL.md`](./UX-PROPOSAL.md).

Read order to get oriented: `FOUNDING.md` (product boundary) →
`UX-PROPOSAL.md` (source of truth for the UX) → `SYSTEM-DESIGN.md` (risk
register) → this file. Project memory also carries the direction
(`uiux-proposal-direction`) and the parity target (`kniterate-official-app-reference`).

Rendered proposal (shareable, owned by the user):
`https://claude.ai/code/artifact/3675603a-7d2e-49a5-836f-e5d3f97f1c38`

---

## What the previous session did

1. Researched the official Kniterate app (manual v1.1.0 + changelog, both Notion
   embeds), Agnes Cameron's colourwork notes, the knitout ecosystem, the `.kc`
   reference corpus, and `machine-lib` as extracted. Produced `UX-PROPOSAL.md`,
   `SYSTEM-DESIGN.md`, and the rendered artifact.
2. Sharpened the model into the **five-rung editability ladder** (L1 chart → L2
   strategy → L3 stitch ops → L4 pass overrides → L5 knitout/.kc) after the user
   challenged whether "chart" is the right abstraction. This is in the docs.
3. Reviewed the docs + the original mockup against the proposal. Found the 7 gaps
   in the next section.
4. **Rebuilt the workspace mockup from scratch** to show the full lowering chain
   including knitout and .kc (user request). New file:
   [`docs/mockups/workspace-pipeline.html`](./mockups/workspace-pipeline.html).
   Validated in a browser: no JS errors; 6-stage pipeline strip; live pass grid;
   a source dock rendering **Plan (KniteratePlan JSON) / Knitout .k / K-code .kc**
   synced to the hovered/selected chart row; waiver→Experimental works;
   complement-on-a-4-color-chart correctly shows Blocked. The old
   `docs/mockups/workspace.html` (3-column, no source dock) is left untouched.

The user stopped the session here and asked for this handoff. Nothing below has
been started.

---

## Gaps to close (priority order)

**G1 — Waiver must move the verdict to Experimental. (correctness, highest)**
The original `workspace.html` "Raise budget (waiver)" fix silently keeps the badge
at Surface-proven, contradicting `SYSTEM-DESIGN.md` R6 (accepted waiver over a real
warning ⇒ Experimental, logged and visible) and principle P3. **Already fixed in
`workspace-pipeline.html`.** Make sure the fix survives whichever mockup becomes
canonical (see the reconciliation decision below).

**G2 — The second mockup (foreign-`.kc` / Story 1) is missing. (biggest new build)**
`FOUNDING.md` §5 requires *two* mockups before M2 chrome: the blanket-flow
workspace (done) and the **foreign-`.kc` workspace** — Story 1 / slice S1: open any
`.kc`/`.k`, render the pass grid, show the verdict, run `kc-diff`, print a run
sheet. S1 is the first slice to ship, so it needs its own mockup. The Machine
column + verdict + dock from the canonical mockup are directly reusable; the
intake is a `.kc` drop instead of a chart.
*2026-07-12 update:* **`docs/BUILD-S1.md` now exists** (self-contained
implementation brief with acceptance gates, foreign-file verdict rule, and the
§9b evidence baked in). Whether a separate S1 *mockup* is still required before
implementation, or the brief + canonical mockup components satisfy FOUNDING §5's
intent, is a user call.

**G3 — The parity matrix lives only in the artifact.** `UX-PROPOSAL.md` calls
itself the source of truth but omits the 17-row official-feature → Studio-answer
matrix, which carries real decisions (DAK `.txt` import = later, template editor =
deferred, `lined` → ladder fallback, full-back DBJ retired 2026-05 = revive+verify,
border-closing = engine gap, etc.). Port it into `UX-PROPOSAL.md` (a new section
after §3 Parity target). The matrix content is in the artifact (§07) — read it via
WebFetch on the artifact URL above.

**G4 — In-browser vs subprocess ambiguity. ✅ CLOSED 2026-07-12.** Verified in
code: `nodeKCodeConverter` is the Node adapter (temp file + `spawnSync`, used by
CLI/tests/parity); the browser Worker imports a deterministic ESM projection of
the same vendored converter with its Node CLI driver removed. Source-equivalence
and byte-parity tests pin the boundary; no backend or runtime evaluation is
used. Documented as "Converter adapters" in `SYSTEM-DESIGN.md` A.1.

**G5 — "Conformance oracle" phrasing is circular. ✅ CLOSED 2026-07-12** in
`UX-PROPOSAL.md` §9 and `SYSTEM-DESIGN.md` A.5 §6: the oracle is
**predicted-vs-vendor parity** (simulator prediction diffed against actual
vendor output). The rendered proposal artifact (§09) still carries the old
wording — sync it only if the user wants the artifact updated.

**G6 — Dark mode contradiction. ✅ CLOSED 2026-07-12** with user blessing: dark
mode is promoted **into scope** (FOUNDING §2 revised in place). Rationale: the
design system is token-based and the canonical mockup ships both themes, so the
cost is near zero.

**G7 — Minor mockup nits (mostly already fixed in the pipeline rebuild).**
Per-row carrier-side edge markers now render (were legend-only); "close edges" no
longer increments the override count (it was mislabeled as an override — it's a
borders/strategy change); `select` and `tile` tools were added to the toolstrip.
Verify these hold in whichever mockup is canonical.

---

## Mockup reconciliation decision (needs a quick call)

There are now three mockups in `docs/mockups/`:
- `workspace.html` — original 3-column (Chart / Strategy / Machine), no source dock.
  Referenced by `UX-PROPOSAL.md` §5.
- `workspace-pipeline.html` — first rebuild; superset (adds the pipeline
  stage strip + Plan/Knitout/.kc dock + G1/G7 fixes).
- `workspace-v2.html` — **2026-07-12 from-scratch redesign** (indigo-dye visual
  system, pipeline-as-thread header with verdict gate lamp, L1–L5 labels, honest
  run-sheet warnings). Browser-validated (all verdict paths driven via
  Playwright) and published as an Artifact:
  `https://claude.ai/code/artifact/09e9cecb-67d9-411e-914a-59fb8d7f350d`.
  Body-only file (Artifact format — no doctype); wrap before opening locally.
  **Recommended canonical candidate**, pending the user's visual review.

**✅ RESOLVED 2026-07-12** with user blessing: `workspace-v2.html` is canonical;
`workspace.html` and `workspace-pipeline.html` moved to `docs/mockups/archive/`;
the `UX-PROPOSAL.md` companion-artifacts pointer now names v2 and its published
artifact URL.

Notes for whoever lands it:
- The pipeline mockup's scratchpad source is gone with the previous session — the
  **repo copy is now canonical**. It was authored body-only and wrapped with
  `<!doctype>` + charset/viewport for standalone opening.
- It is **not yet published as an Artifact**. If the user wants a shareable link,
  publish the file — but the Artifact tool wants body-only input, so strip the
  leading `<!doctype html>` / `<meta>` lines (or re-publish from a body-only copy).

---

## Guardrails — do not re-litigate these

- **R1 (where painting lives) is still OPEN and BLOCKING.** Do not amend
  `FOUNDING.md`/`ROADMAP.md`'s "Studio does not host the chart editor" line until
  the user decides A / B / C (`UX-PROPOSAL.md` §8; recommendation is B, marked "not
  yet adopted"). Every S2/S3 shape depends on this answer.
- **Verdict honesty is non-negotiable:** never auto-Knit-proven; validator `error`
  ⇒ Blocked; accepted waiver over a real warning ⇒ Experimental; Knit-proven only
  on a physical swatch-registry fingerprint match (registry is empty today).
- **Four nouns hold:** project, chart, machine view, verdict.
- **Machine facts** (already reflected in the docs/mockup — keep them right): 252
  needles @ 7gg worsted; carriers **C1 draw / C2–C5 pattern / C6 waste** (5th/6th
  pattern carrier gated); racking integer or ±0.5, max ±4; birdseye backing at
  +0.5 rack; fairisle floats past budget get tuck anchors; `lined` falls back to
  ladder; the full-back DBJ walker was retired 2026-05 (reviving + verifying it
  against official full-needle output is the standing engine parity task).

---

## Suggested order for the next session

1. **Docs wording (fast):** confirm G4 in code, then fix G3 (port parity matrix),
   G4 (clarify compile path), G5 (oracle phrasing) in `UX-PROPOSAL.md` /
   `SYSTEM-DESIGN.md`. Keep the artifact in sync if the user wants it.
2. **Reconcile the mockup** (G1/G6/G7): pick the canonical file, delete/rename the
   other, fix the `UX-PROPOSAL.md` §5 reference, and put the G6 dark-mode call to
   the user.
3. **Build the S1 foreign-`.kc` mockup** (G2) — the biggest missing piece; reuse
   the Machine column + verdict + dock from the pipeline mockup.
4. Optionally publish the mockup(s) as Artifact(s) if the user wants links.

Do steps 1–2 before 3 so the S1 mockup starts from corrected docs.
