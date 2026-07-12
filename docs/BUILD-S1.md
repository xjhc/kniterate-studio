# BUILD-S1 — machine truth (implementation brief)

**Audience:** the implementing agent for slice S1. This brief is self-contained;
`UX-PROPOSAL.md` / `SYSTEM-DESIGN.md` / `FOUNDING.md` are the authorities if
anything here seems to conflict — flag the conflict, don't silently pick.

**Mission (UX-PROPOSAL §10, S1 = M2):** open any `.kc`/`.k` → pass grid +
verdict + anchored diagnostics + `kc-diff` + printable run sheet. This builds
the Machine column once; every later slice reuses it.

**User story:** a knitter has a `command.kc` — from the official app, from us,
from a friend — and wants to know *what the machine will do and whether it's
safe* before burning yarn and an afternoon. Field evidence (UX-PROPOSAL §9b,
E3): today their only option is eyeballing a visualizer and guessing whether a
failure was "the file or the machine being temperamental." S1 ends that.

---

## Components

Visual reference: **`docs/mockups/workspace-v2.html`** (canonical; light+dark
token system in its `<style>` block — extract the tokens, don't invent a look).

1. **Intake.** Drag-drop / file-open for `.kc` and `.k`. Parse errors are shown
   with line numbers and knitter-facing copy — never a dead-end toast (E3).
   The file never leaves the browser (E6: local-first, no login, no upload).
2. **Machine column (pass grid).** Virtualized list of *all* passes:
   direction, carrier chip (colored), bed, cam action, rack/speed/roller,
   kick/auto-move rows rendered as ghosts. Waste / body / bind-off shown as
   collapsible section headers (E5) via `kc-section` boundaries.
3. **Verdict.** Badge + rung panel per SYSTEM-DESIGN R6, including the
   **foreign-file rule**: reconstruction errors ⇒ Blocked; clean ⇒
   "Surface-proven (imported)" with the mandatory reconstruction annotation;
   preview-grade regions marked in the grid and never able to flip the badge.
   The verdict is a pure function of validator output — no component ever sets it.
4. **Diagnostics.** `ValidationMessage[]` rendered with `validators/messages.ts`
   copy verbatim; every diagnostic is anchored (click → scroll the pass grid to
   the pass/needle). Attributional copy: name the physical failure mode (E3).
5. **Source dock.** The raw file text, scroll-synced with the pass grid
   selection (line spans from the parser — never recomputed in the UI, R11).
6. **kc-diff.** Two files → `diffKc` + `renderKcPassWindow`; navigate between
   changed passes. This is the "did the official app change my file" answer.
7. **Run sheet.** Printable (`@media print` stylesheet): carrier/yarn map,
   settings summary, verdict stamp + annotations (including unresolved-warning
   lines — the sheet never goes silent about known risks), pre-knit checklist.

## Engine surface (do not reimplement — R13)

All exported from `@kniterate-studio/machine-lib`: `parseKcPasses`,
`kcToKnitout`, `validateKnitoutProgram` (+ bed-state validator), `diffKc`,
`renderKcPassWindow`, kc-section utilities. Wrap them in a single
`apps/studio/src/engine.ts` import surface. Anything a view needs that the
engine lacks gets **added to machine-lib**, not computed in the app.

## Binding rules

- **R13:** views render only from engine outputs. No UI-side machine math.
- **R11:** every anchor (pass ↔ line span ↔ diagnostic) comes from parser/
  validator output.
- **E4:** carrier-convention violations (C1 draw / C6 waste) surface as
  validator findings, not UI-side checks.
- **E6:** fully static; works offline; no session/login anywhere in the loop.
- **E9:** the dock is readable-first — explain, never edit. Raw `.kc` editing
  is out of scope for v1 (FOUNDING §2).
- Dark + light themes via the token system (FOUNDING §2 as revised 2026-07-12).

## Acceptance gates

1. All 13 files in `packages/machine-lib/reference/*.kc` open cleanly; pass
   counts match `parseKcPasses`; zero console errors.
2. All 6 refusal-corpus programs show **Blocked** with anchored diagnostics.
3. A clean corpus file shows **Surface-proven (imported)** with the
   reconstruction annotation visible in badge panel and run sheet.
4. Diff of two corpus variants (e.g. `sophie` vs `sophie_stripe`) renders
   changed-pass windows and navigates between them.
5. Run sheet prints correctly (print stylesheet), verdict stamp included.
6. Keyboard: open file, navigate passes (↑/↓), Esc closes panels; visible
   focus states throughout.

## Out of scope — do not build, do not touch

- Chart editor / painting (**R1 is frozen**; do not amend FOUNDING/ROADMAP).
- Compile-from-chart, strategy rail, back-face preview (S2).
- Assistant (S3). Swatch-registry UI (S4 — the verdict reads the registry as
  empty; keep the read behind an interface).
- Any backend, service, telemetry, or login.
- New verdict rungs or verdict semantics beyond R6.

## Suggested layout

```
apps/studio/src/
  engine.ts            ← sole import surface over machine-lib
  tokens.css           ← extracted from workspace-v2.html
  intake/  machine/  verdict/  diagnostics/  dock/  diff/  runsheet/
```
