# Handoff — present truth (reconciled 2026-08-25)

> **Read [`STATUS.md`](./STATUS.md) first.** It is the front door: what is shipped
> vs. proposed, the 3-rung verdict model, and the remaining slices. This file is
> the short orientation; STATUS carries the detail.

## Where things actually stand

- Repo at `1.0.0-rc.1`; `pnpm verify:kcode` is the deterministic KCode software
  proof and `pnpm verify` is the full local gate.
- **Both product stories ship** in `apps/studio`: the foreign-`.kc` workspace
  ("S1") and the authored chart→compile→k-code loop ("S2" core). Neither is a
  slice waiting to start — see STATUS for the file map.
- **Verdict is three rungs** (Blocked / Surface-proven / Knit-proven). Experimental
  and waivers were cut from V1 on 2026-07-12 (SYSTEM-DESIGN R6). Docs, the
  canonical mockup, and the dead UI rung were reconciled to match.
- **Machine truth now starts at emitted KCode.** Strict byte-preserving parsing,
  canonical V1 raster semantics, exact `MachineTraceV1`, loop/kinematic replay,
  scheduled backend differential checks, and synchronized movement rendering
  replace the former reconstruction/preview authority. `predictedPasses`
  remains planning telemetry only.
- **V1 scope widened 2026-09-28** to Customist parity plus AI-driven
  rectangles, flat seamed beanies and sweaters (FOUNDING §1; proposed, not
  built). `1.0.0` now needs exact-artifact physical qualification of a
  rectangle, a beanie and a complete sweater at the frozen final fingerprint
  (`V1-PHYSICAL-TRIAL.md`). Do not tag `1.0.0` before that; a rectangle-only run
  is development evidence.
- **Built since (software only, nothing knitted):**
  - M5 design language on rectangles.
  - M6 flat seamed beanies, whose acrylic dev trial (candidate `79670c31`) waits
    for an operator.
  - An M7 slice (2026-10-10): flat-panel sweaters (set-in, J-sleeve, drop
    shoulder; crew or boat neck; any knit/purl/tuck/slip texture; rib trims).
    They are designed in their own browser workspace or with
    `studio sweater …`; see STATUS.

## Next work

The KCode software slice meets the boundary documented in
`KCODE-SOFTWARE-PROOF.md`; it deliberately does not claim physical acceptance.
Next, review the remaining evidence gaps there, then execute the hash-bound
release trial and hand that exact generated artifact to the physical Kniterate
trial.

Beyond these: the assistant (S3), swatch-registry UI (S4), and the L3–L5 upper
editability ladder remain forward design (STATUS "Not yet built").

The widened V1 starts with ROADMAP M5, the design language on rectangles
(`DESIGN-LANGUAGE.md`), and `CUSTOMIST-PARITY.md`.

## Durable guardrails — do not re-litigate

- **Verdict honesty:** never auto-Knit-proven; validator `error` ⇒ Blocked;
  Knit-proven only on a physical swatch-registry fingerprint match (registry empty
  today). Three rungs — no waiver/Experimental path in V1.
- **Four nouns hold:** project, chart, machine view, verdict.
- **Views render only from engine projections** — authored intent from
  `RunArtifact`, exact movement from `MachineSceneV1`; no UI-side machine math.
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
