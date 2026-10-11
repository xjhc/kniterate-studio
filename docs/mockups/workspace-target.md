# Workspace target contract

Status: accepted implementation contract, 2026-10-11. It replaces the
2026-07-13 three-column "Chart / Strategy / Machine" contract, which the user
retired. `workspace-target.html` is that retired mockup, kept for history
only.

## Point of view

Every project, whether a scarf or blanket, a beanie or a sweater, is
designed in one workspace. It looks the same and its controls are always in
the same place. Each project is turned into machine files the Kniterate
runs, and the workspace shows exactly what those files knit.

## Layout

- **Top bar:** the project name, one menu bar (File, Edit, View) and the
  verdict badge. There are no icon ribbons; every project action is in a
  menu.
  - File: new, open, save, download the knitting package, download the
    machine file(s), print the knitting sheet, check a machine file.
  - Edit: undo, redo, name and colours.
  - View: Design, Schematic, Machine file, History, Dark mode.
- **Left panel:** what you are making, as collapsible sections.
  - Sweater: style, size, measurements, stitch, edges, yarn and gauge.
  - Beanie: fit, cuff, body, your swatch (its gauge: a new gauge resizes
    the whole hat and its motifs in one change), motifs, colours and
    backing.
  - Colorwork scarf or blanket: size, colours and backing.
- **Middle:** the pieces, when there are several, on the left of the stage
  bar. On its right, always in the same place, the three views:
  - **Design:** what you edit. That is the chart, or a piece's stitches and
    shape, or the garment as worn. It is drawn to scale, like the schematic.
    A beanie shows its whole piece: the rib cuff, the body you paint, and
    the crown the machine shapes.
  - **Schematic:** the measured flat drawing. For a charted project it is
    drawn from the machine file read back. It shows the whole run, from the
    waste yarn and draw thread through the piece to its finish.
  - **Machine file:** exactly what each `.kc` knits, read back from the
    emitted file. It shows the fabric, the sections in machine order, and
    every pass in words and as written. "Step through" holds the exact
    machine movement, the checks and the source.
  - A sweater's Whole sweater view lists every file in the order the machine
    runs them.
- **Right panel:** the same for every project. First, whether it can be
  knitted, in plain words: "Can't knit yet", "Ready to knit" (sizes not
  confirmed until a swatch is measured), or "Ready to knit". Then the steps,
  in order, each holding what belongs to it. The first step not done is
  marked as the next one.
  1. Design: what to fix or check, with buttons that show or fix it.
  2. Measure a swatch: each fabric the sizes come from, typical or
     measured, and a button to the swatch fields.
  3. Download: the machine files (open, or download each one; the open
     piece's shaping steps are shown under its file), Download knitting
     package and Print knitting sheet. Ticked once this design is
     downloaded.
  4. Knit: what to do at the machine.
  5. Measure the hat (beanie): enter what the knitted hat measures.
- **The verdict badge** uses the same plain words: Blocked is "Can't knit
  yet", Surface-proven is "Ready to knit", Knit-proven is "Proven on the
  machine". Its popover keeps the ladder's names, what each means, and what
  was checked. Files, the CLI and the docs keep the ladder's names.
- **The knitting sheet** is for after exporting, at the machine. It traps
  focus and returns it to the menu.

## Words

Plain words, little text. There is no developer jargon ("machine truth",
"compiler intent", "trials"), no "≈" and no "~". Technical detail lives only
in the Machine file view.

## Responsive behavior

- Below 1100 px the status panel moves under the workspace.
- Below 720 px everything stacks, with the stage first.
- The page never scrolls sideways.

## Invariants kept

- The verdict ladder is Blocked, Surface-proven and Knit-proven, and Blocked
  disables export.
- Views render from the compiled artifacts. The schematic and the machine
  file come from the emitted file's strict trace and the compiler's row
  links, not from UI-side machine math.
- Physical needle labels stay unverified; needles use Studio's numbering.
- No waiver or Experimental verdict, no per-stitch machine overrides, and no
  manual pass editing.
