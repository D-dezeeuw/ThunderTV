# src/ui/

The virtual-list windowing controller, group-view filtering, lazy-logo
fallback, and long-press gesture — the module-memory / DOM layer masterplan
§5.4/§6.1 describes. `src/state/list*.ts` is the Spektrum-facing half of the
same feature; see that layer's own module-ownership table in
`src/state/README.md` for the full picture of which side owns what.

- `virtual-list.ts` — scroll math, the current view's row array (module
  memory, never Spektrum state), and `publishListWindow()` calls.
- `window-math.ts` — the pure slice/pad-height math, unit-tested exhaustively
  in isolation from the DOM/Spektrum.
- `groups.ts` — group-name row filtering (memoized per row-array identity).
- `long-press.ts` — the shared pointerdown-hold gesture util (touch only —
  mouse already has native right-click).
- `logo-fallback.ts` — the delegated `error`/`load` listener pair that swaps
  a failed channel logo for the placeholder glyph.
- `list-bindings.ts` — the one-time DOM wiring (`registerListBindings()`,
  called from `bootstrap.ts` post-`bindDOM()`/`run()`): attaches the above to
  the real list container, plus the density watch and scroll-settle
  persistence debounce.
- `density.ts` — the `Density -> ROW_H` lookup (Phase 02), the single number
  every piece of scroll math in this directory shares.
- `grid-metrics.ts` — the poster-grid equivalent: how many tiles fit across a
  measured width, and how tall one line of them is. Pure, for the same reason
  `window-math.ts` is.

## The list has two layouts, not two lists

Live, Movies and TV Shows each carry a list/grid switch beside their search
box (`ui.listLayout`, owned by `src/state/list-layout.ts`). The grid is the
*same* `.rows` `data-each` and the same `.channel-row` template restacked by
CSS — not a second row surface. `virtual-list.ts` treats a line of `columns`
tiles exactly as it treats one row, and pushes the resolved
`--grid-cols`/`--grid-tile-h` back onto the container so the stylesheet lays
out precisely the grid the scroll math assumes; a column of disagreement
between the two is rows you can scroll past but never see.

Two consequences worth knowing before touching this:

- **Columns are decided in JS, not by a CSS `auto-fill` track.** The scroll
  extent is `ceil(rows / columns) * tileHeight`, so CSS cannot be the one
  who knows.
- **Left/Right inside the list belongs to the grid cursor only between tiles
  on the same line.** At a line edge the press falls through to spatial
  navigation, which is the only way out of the list — see
  `src/state/list.actions.ts`'s `listHandlesHorizontal()`.

Owner: Phase 08 — Channel List & Virtual Scrolling (and onward — Phase 09's
search, Phase 10's playback dock plug into `virtual-list.ts`'s `setRows()`
choke point and `src/state/list-rows.ts`'s `setDisplayedRows()` wrapper,
respectively).
