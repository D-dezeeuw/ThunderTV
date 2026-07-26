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

Owner: Phase 08 — Channel List & Virtual Scrolling (and onward — Phase 09's
search, Phase 10's playback dock plug into `virtual-list.ts`'s `setRows()`
choke point and `src/state/list-rows.ts`'s `setDisplayedRows()` wrapper,
respectively).
