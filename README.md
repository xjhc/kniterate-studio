# Kniterate Studio

Kniterate Studio is the machine-native companion to
[`areumjo/knitlab`](https://github.com/areumjo/knitlab). KnitLab Chart authors
exact colorwork; Studio imports the versioned chart artifact, maps it to yarns
and machine strategy, validates the result, and exports `.kc`.

This repository is intentionally separate from the static chart product. The
browser workspace imports `ColorworkChartV1` and embeds the shared neutral
pixel-authoring core for paint-to-machine iteration, while
`packages/machine-lib` contains the mechanically extracted compiler, codecs,
simulator, validators, conformance rails, and reference `.kc` corpus from
`knitlab2`. The shared four-color fixture now compiles through that library in
an automated test after carrier assignment.

```bash
pnpm install
pnpm verify
pnpm dev
```

Open `http://127.0.0.1:5173` and import a chart JSON exported by KnitLab Chart.
`pnpm kniterate:conform` runs the extracted machine confidence ladder.

For an authored blanket, Studio keeps design rows intact, compares five backing
choices, compiles off the UI thread, validates the vendored `.kc`, and enables
export only for the current validated project revision. Project JSON and the
printed run sheet retain the carrier, frame, strategy, and artifact identities
needed to reproduce a run.

The software is currently `1.0.0-rc.1`. Run `pnpm release:trial` to generate the
hash-pinned four-color physical-knit package. Promotion to `1.0.0` is reserved
for a successful run of that exact package on a real Kniterate; see
[`docs/V1-PHYSICAL-TRIAL.md`](./docs/V1-PHYSICAL-TRIAL.md).

After the machine run, `pnpm release:register -- <short-name>` scaffolds the
hash-linked physical record and `pnpm release:physical-check` enforces the
promotion gate. Studio grants Knit-proven only when the current compiler and
the exact exported or reopened `.kc` match a clean registry entry.

## Product boundary

- Studio owns yarn/carrier mapping, colorwork strategy, validation, verdicts,
  run artifacts, and machine files.
- KnitLab Chart owns pixel editing, palette and reusable block authoring,
  editable `.knitlab` state, and exact JSON/PNG export.
- Studio embeds the dependency-free pixel/tool core, not KnitLab Chart's product
  shell, block system, image intake, or persistence model.
