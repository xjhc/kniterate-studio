# Swatch Registry

Per-physical-knit ledger of what we sent to a real Kniterate, what came off,
and what we measured. Designed to be the load-bearing record between
"valid knitout" and "physically good knitting" — see plan §6.6, and the
school-gap doc's P0 #2 (swatch / settings registry before more export
formats).

The registry is the source of truth for:

- which `x-stitch-number` / `speedNumber` / `rollerAdvance` values worked
  for a given yarn + structure + gauge target
- measured gauge after rest / steam / wet-finish (the school's "Tension
  Swatch" foundation — every cast-on, shaping row, and garment dimension
  decision depends on this number)
- known-bad combinations (cone X jams at stitch number 5, takedown skips
  at speed > 200 on 4-ply, etc.)
- whether a specific compile output knit cleanly end-to-end

## Layout

```
registry/swatches/
  README.md                           ← this file
  _template/                          ← scaffolding template; do not edit
    spec.json                         ← compile provenance + the KniteratePlan
    request.json                      ← saved source request + re-emit command
    out.k                             ← knitout emitted (commit verbatim)
    out.kc                            ← kcode the machine ran (commit verbatim)
    machine.json                      ← actual settings used at the machine
    yarn.json                         ← yarn properties + measured gauge
    photo-front.jpg                   ← (gitignored at commit, kept locally)
    photo-back.jpg                    ← (gitignored at commit, kept locally)
    outcome.md                        ← narrative: clean / dropped / jammed / notes
  <YYYY-MM-DD>-<short-name>/          ← one entry per physical knit
    ...
```

Each entry name is `<ISO date>-<short-kebab-name>` so the directory listing
sorts chronologically. Short-name should be descriptive enough to skim
("2-color-test", "raglan-front-rib-cuff", not "swatch7").

## Required fields

`machine.json` — what was dialed in on the machine for this run. Mirrors
`KniteratePlanSettings` plus carrier positions. If the run deviated from
the compiled plan (e.g. you bumped stitchNumber down 1 mid-run), record
**what actually ran**, not what was compiled.

`yarn.json` — yarn properties + tension swatch measurements. Include
fiber, weight, ply, color, cone source, **and** measured gauge after
each finishing step (off-machine, rested 24h, steamed, wet-finished).
The school's introduction to tension swatches treats this as the
foundation for everything downstream — record honestly.

`outcome.md` — short narrative. The schema is loose because outcomes vary;
the question to answer is "would I do this again, and what would I
change?"

## Creating a new entry

```sh
pnpm tsx scripts/swatch-register.ts <short-name>
```

Scaffolds `<today>-<short-name>/` from `_template/`. Edit each file as you
go through the physical knit. Commit when the entry is complete — the
registry is content-addressed by date, so additions don't conflict.

## What goes in vs stays out

**In:** `spec.json`, `request.json`, `out.k`, `out.kc`, `machine.json`, `yarn.json`,
`outcome.md`. Small text files; commit verbatim.

`spec.json` must record the emitter commit and the re-emit status. If the
current compiler no longer byte-reproduces `out.k` from `request.json`, the
entry is **stale** for current-output claims. Keep the entry; just do not call
current output "knit-proven" from it.

**Out:** Photos. They're useful locally but blow up the repo. Keep them in
`photo-front.jpg` / `photo-back.jpg` inside the entry directory locally
but they're gitignored via `.gitignore` at the registry root.

## Anti-goals

- Don't try to derive `machine.json` from `spec.json`. They diverge —
  that divergence is the data we want to capture.
- Don't promote a swatch entry to "validated" anything. Entries are
  records, not certifications.
- Don't delete or edit a past entry just because it's a failure. The
  failure cases are where the most learning lives.
