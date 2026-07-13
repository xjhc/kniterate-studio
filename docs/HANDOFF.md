# Handoff — present truth (reconciled 2026-07-12)

> **Read [`STATUS.md`](./STATUS.md) first.** It is the front door: what is shipped
> vs. proposed, the 3-rung verdict model, and the remaining slices. This file is
> the short orientation; STATUS carries the detail.

## Where things actually stand

- Repo at `1.0.0-rc.1`; `pnpm typecheck` + `pnpm test` green.
- **Both product stories ship** in `apps/studio`: the foreign-`.kc` workspace
  ("S1") and the authored chart→compile→k-code loop ("S2" core). Neither is a
  slice waiting to start — see STATUS for the file map.
- **Verdict is three rungs** (Blocked / Surface-proven / Knit-proven). Experimental
  and waivers were cut from V1 on 2026-07-12 (SYSTEM-DESIGN R6). Docs, the
  canonical mockup, and the dead UI rung were reconciled to match.
- The only `1.0.0` promotion gate is the physical Kniterate run
  (`V1-PHYSICAL-TRIAL.md`). Do not tag `1.0.0` before it succeeds.

## Next work

The reconcile-first follow-ons are complete: authored verdict policy lives in
`engine.ts::resolveAuthoredVerdict`, and typed op→row provenance replaces the
old `row N` comment scan (SYSTEM-DESIGN R11). Next, audit and polish the running
Studio against the canonical workspace mockup, then execute the release trial
and hand the generated artifact to the physical Kniterate trial.

Beyond these: the assistant (S3), swatch-registry UI (S4), and the L3–L5 upper
editability ladder remain forward design (STATUS "Not yet built").

## Durable guardrails — do not re-litigate

- **Verdict honesty:** never auto-Knit-proven; validator `error` ⇒ Blocked;
  Knit-proven only on a physical swatch-registry fingerprint match (registry empty
  today). Three rungs — no waiver/Experimental path in V1.
- **Four nouns hold:** project, chart, machine view, verdict.
- **Views render only from `RunArtifact`** — no UI-side machine math (SYSTEM-DESIGN R13).
- **R1 = B (embedded shared canvas) is decided and shipped** (FOUNDING §80 / ROADMAP M3B).
- **Machine facts:** 252 needles @ 7gg worsted; carriers C1 draw / C2–C5 pattern /
  C6 waste (5th/6th pattern carrier hard-gated ⇒ Blocked); racking integer or ±0.5,
  max ±4; birdseye backing at +0.5 rack; fairisle floats past budget get tuck
  anchors (non-gating warning); `lined` falls back to ladder; the full-back DBJ
  walker retired 2026-05 (reviving + verifying against official full-needle output
  is the standing engine parity task).

## Historical material

The 2026-07-12 doc/mockup review, its 7-gap list (G1–G7, all resolved), the
three-mockup reconciliation (resolved: `workspace-v2.html` canonical; the older
two in `docs/mockups/archive/`), and the `BUILD-S1.md` brief are **historical** —
they described a greenfield plan for code that already exists. `BUILD-S1.md` is
archived under `docs/archive/` and marked as such. Provenance lives in git history;
nothing in that material is current task status.
