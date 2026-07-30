# Spatial navigation (`src/ui/spatial/`)

Arrow keys and TV-remote D-pads as a real input model — Vision 3.0's
stone 8, landed in Phase 35.

| File           | Responsibility | Pure? |
| -------------- | -------------- | ----- |
| `geometry.ts`  | Given a source rect, a direction and candidate rects: which one is actually that way. | Yes |
| `keys.ts`      | Turning a `KeyboardEvent` into a direction / activate / back, across desktop and TV webviews. | Yes |
| `navigator.ts` | Collecting focusable elements, deciding whether a press is ours, moving focus. | No — DOM |

## Why geometry rather than Tab order

Tab order is one ordered ring authored into the markup. On a 10-foot layout
it routinely sends the cursor somewhere unrelated to where the user pointed
the remote, and keeping it sensible means hand-maintaining a focus map per
screen. Spatial navigation asks *which element is actually to the right of
this one* — so the answer stays correct however the layout reflows, across
every view, with no per-screen authoring at all.

Two details in `geometry.ts` carry most of the quality:

- **Leading edges, not centres.** A full-height sidebar next to a short
  button has a centre far below it but is plainly "to the left". Centre-only
  tests refuse to move into large elements, which is the most common way
  naive spatial navigation feels broken.
- **Off-axis penalty.** A candidate directly ahead usually beats a nearer
  one off to the side, or pressing "down" beside a dense grid drifts into
  the grid. The weight is tuned so an off-axis candidate must be roughly
  three times nearer to win.

## Two rules that keep it from fighting the app

1. **Never take a press a control already handles.** `<select>`, text
   inputs, `contenteditable`, and the two containers that run their own
   up/down cursor — the channel list (`src/state/list.actions.ts`) and the
   group/category rail beside it (`src/state/groups.actions.ts`) — all use
   arrow keys meaningfully. The handler defers on those, so desktop
   behaviour is completely unchanged — which is why this ships enabled on
   every platform rather than behind a TV-only flag. Horizontal presses
   inside them are still handled, because that is the only way *out* —
   with one narrow exception: in the list's grid layout, a Left/Right press
   that has another tile on the same line to move to belongs to the grid
   cursor. The `listHandlesHorizontal` option is how the list says so, and
   it deliberately answers `false` at a line edge so the way out never
   closes. That exception is the *list's* alone; the rail never claims a
   horizontal press.

   **A container with its own arrow handling MUST be added to
   `SELF_CURSOR_SELECTOR`.** Forgetting is not a no-op: because this
   handler runs in the capture phase and the container's runs on bubble,
   *both* fire on one press. The rail was missing for a release — one
   ArrowDown moved the cursor two rows, so every other category was
   unreachable by remote, and nothing failed because jsdom reports every
   element as 0x0 and this handler goes inert without hand-supplied layout
   (see `navigator.spec.ts`'s `layout()`).
2. **Never wrap around.** A press with nothing in that direction does
   nothing. Focus silently teleporting from the top of a TV screen to the
   bottom is far more disorienting than a press that no-ops.

The handler binds on `document` in the **capture** phase, so it sees a press
before per-container handlers and can decide to defer — rather than having
to undo something already done.

## Don't put a `<select>` on a D-pad path

Rule 1 defers to a `<select>` because a `<select>` handles arrows itself —
on desktop. On webOS it doesn't handle *anything* the remote sends: the
dropdown a `<select>` opens is a browser-level widget outside the page, and
the LG simulator injects remote keys into the page. The popup opens and
then cannot be navigated or dismissed, while every further OK press
re-triggers the still-focused `<select>` underneath it — a dropdown that
reactivates itself forever, with no way out.

So a picker a viewer reaches with a remote is built from ordinary focusable
DOM. Radio's visualizer picker (`index.html`'s `radio-visualizer-btn`) was
converted to the `.track-menu` pattern for exactly this reason: a button, a
`role="dialog"` popup, and `<button role="option">` rows, which this module
and `state/back-navigation.ts` already understand. The `<select>`s that
remain are all inside Settings; they carry the same defect and should get
the same treatment before Settings is called TV-ready.

## Remotes lie about being keyboards

`KeyboardEvent.key` is well-behaved on desktop and inconsistent on TV
webviews, so `keys.ts` consults `key` first and falls back to `keyCode`.
The Back button is the sharp edge: webOS sends `461`, Tizen `10009`,
neither with a useful `key`. `src/state/back-navigation.ts` unwinds one
overlay at a time (debug → settings → wizard → catalog detail) and reports
`false` when nothing was open, so the platform can do its own thing.
Swallowing Back unconditionally would trap the user in the app with no way
out — a webOS certification failure as well as bad manners.

## Not built here

- **A focus memory per view** (returning to a view restoring the element
  you left from). The list already restores its own row cursor via
  `ui.listState`; generalising that to every view is a larger change than
  stone 8 needs.
- **Explicit focus overrides** (`data-spatial-up="…"`-style escape hatches
  for a layout the geometry gets wrong). Deliberately deferred until a real
  screen actually needs one — adding the mechanism first invites
  hand-authored focus maps, which is exactly what this replaces.
