# Workspace target contract

Status: accepted implementation contract and canonical V1 workspace, 2026-07-13.

Interactive mockup: [`workspace-target.html`](workspace-target.html)

## Point of view

Kniterate Studio is an instrument for lowering a rectangular colorwork design into inspectable machine work. The workspace keeps three forms of truth visible at once:

1. **Chart** - the design rows the knitter authored.
2. **Strategy** - the compiler choices and their consequences.
3. **Machine** - the physical passes and diagnostics generated for the selected design row.

The row gutter is the visual hinge. Its `xN` count explains how one design row expands into physical passes, and selection stays synchronized across the chart, pass list, diagnostic, and generated source.

## Binding first pass

- The first desktop viewport is the working application, not an import screen or dashboard.
- The desktop composition is Chart / Strategy / Machine, with Chart dominant and generated source docked across the bottom.
- Project identity, lowering progress, verdict, run sheet, and export remain in the top bar.
- The chart includes the shipped authoring tools, palette, undo/redo, zoom, row numbers, pass multipliers, and compiler annotations.
- The palette rail stays visually subordinate to the chart: compact swatches, medium-weight labels, and the terracotta selection signal rather than heavy black emphasis.
- Strategy choices show their pass-cost or blocked consequence before selection. Compiler parameters stay compact and visible beside the chart.
- The Machine column shows carrier-labelled passes for the selected design row and an attributional diagnostic below them.
- The Machine column begins with a persistent full-program timeline: Waste yarn / Draw thread / Blanket body / Finish. Each generated frame region is selectable and exposes its passes, reserved carrier, diagnostic, and source without polluting the authored chart.
- The source dock switches between Knitout and K-code without leaving the cause-and-effect workspace.
- Blocked is a real refusal state: it changes the verdict, explains the cause, and disables export.
- Surface-proven warnings persist into the run sheet but do not masquerade as blocking errors.
- Light and dark themes use the same information hierarchy.
- The chart uses a roving-focus grid: one tab stop enters the cells, arrow keys move, and Enter or Space paints. Design-row labels use the same one-stop arrow-key pattern.
- Selected-row machine truth is pinned by click or keyboard navigation; pointer hover never replaces it.
- Run-sheet focus is trapped while open and returns to its invoking control on close.
- Technique, source format, machine-program region, mobile panel, theme, and dock state are reflected in the URL for reloadable workspace views.
- Cantarell and IBM Plex Mono subsets are self-hosted with font-display swap so the review typography is portable.

## Responsive behavior

- At wide desktop widths, all three columns remain visible.
- At intermediate widths, Chart and Strategy share the upper workspace and Machine spans the row below.
- On narrow screens, Chart / Strategy / Machine become explicit tabs. The chart scrolls internally; the page itself does not scroll sideways.
- The source dock remains available on every viewport and collapses to its 36px header, returning the reclaimed height to the workspace. Choosing a source tab reopens it.
- Full-bleed chrome respects device safe-area insets.

## Implementation mapping

- Chart surface: `ChartWorkspace`, `ChartToolbar`, `PaletteRail`, and `ColorworkCanvas`.
- Strategy surface: evolve `BlanketSetupRail`; do not create a second project-settings model.
- Machine surface: reuse `PassGrid` and `Diagnostics` with authored provenance.
- Generated source: reuse `SourceDock` and the existing Knitout/K-code artifact adapters.
- Verdict and run sheet: restyle the existing `VerdictPanel` and `RunSheet`; preserve the three-rung policy.

The implementation may refactor component boundaries, but the first visual pass should not change this composition or substitute a different design system.

## Explicit non-goals

- No waiver or Experimental verdict.
- No assistant rail.
- No per-stitch machine overrides or manual pass editing.
- No invented Kniterate settings that the compiler does not own.
- No attempt to reproduce compiler output in mockup JavaScript. The representative data exists to demonstrate the interface contract; production must use real artifacts and provenance.

## Acceptance views

Review at `1440x900`, `1024x768`, and `390x844`. At each size:

- controls and text do not overlap;
- the root has no horizontal overflow;
- Chart, Strategy, and Machine remain reachable;
- row selection visibly connects design rows to physical passes;
- the verdict and export state agree;
- source and run sheet remain accessible;
- browser console has no errors.
