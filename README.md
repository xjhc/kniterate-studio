# Kniterate Studio

Kniterate Studio is the machine-native companion to
[`areumjo/knitlab`](https://github.com/areumjo/knitlab). KnitLab Chart authors
exact colorwork; Studio imports the versioned chart artifact, maps it to yarns
and machine strategy, validates the result, and exports `.kc`.

This repository is intentionally separate from the static chart editor. The
browser workspace proves the `ColorworkChartV1` intake boundary, while
`packages/machine-lib` contains the mechanically extracted compiler, codecs,
simulator, validators, conformance rails, and reference `.kc` corpus from
`knitlab2`. The shared four-color fixture now compiles through that library in
an automated test after carrier assignment.

```bash
pnpm install
pnpm verify
pnpm dev
```

Open `http://localhost:5173` and import a chart JSON exported by KnitLab Chart.
`pnpm kniterate:conform` runs the extracted machine confidence ladder.

## Product boundary

- Studio owns yarn/carrier mapping, colorwork strategy, validation, verdicts,
  run artifacts, and machine files.
- KnitLab Chart owns pixel editing, palette and reusable block authoring,
  editable `.knitlab` state, and exact JSON/PNG export.
- Studio does not embed, fork, or route into the chart editor.
