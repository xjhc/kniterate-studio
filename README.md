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

`pnpm verify` is the full gate used by CI; it ends with the read-only KCode
proof check, which re-runs mutation testing. While iterating on code that does
not touch the compiler, converter, or machine output, `pnpm verify:quick` runs
everything except that proof check.

Check one foreign machine file with the same conservative verdict policy as
Studio:

```bash
pnpm machine:check -- ./pattern.kc
pnpm --silent machine:check -- ./pattern.k --json
```

The checker exits `0` only for `Surface-proven (imported)`, `1` for a checked
but blocked file, and `2` for usage or read failures. JSON receipts include the
input SHA-256 and format-evidence disclosure, but never source bytes. This is a
software preflight; controller acceptance and physical knitting remain separate
gates.

Open `http://127.0.0.1:5173` and import a chart JSON exported by KnitLab Chart.
`pnpm kniterate:conform` runs the extracted machine confidence ladder.

## GitHub Pages

The application is fully static. Pushes to `main` run the release verification,
package `apps/studio/dist`, and deploy it through the `github-pages`
environment. In the repository settings, select **GitHub Actions** under
**Pages → Build and deployment → Source** before the first deployment.

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
