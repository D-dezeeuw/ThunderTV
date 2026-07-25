# Phase 25 — Accessibility & Input

> **Epic goal:** The app becomes fully usable without a pointer — a roving focus model over the windowed lists, one central keyboard map with a generated help overlay, real ARIA semantics, and verified 10-foot, screen-reader, and touch quality — which is, by design, the same work as the LG webOS remote-control story.
> **Verification:** A Playwright run completes import → browse → search → play using keyboard events only; `?` renders exactly one help row per `keymap.ts` entry and the generated README table diffs clean; axe-core scans of list, grid, player, settings, and overlay states report zero unbaselined critical/serious violations; NVDA and VoiceOver walkthroughs are recorded in `docs/a11y-checklist.md` with every deviation fixed or reasoned; coarse-pointer devices get ≥ 44 px targets and long-press toggles favorites on a real Android browser; the contrast unit test passes for every documented token pair; `npm test`, `npm run test:a11y`, `npm run build`, `npx tsc --noEmit`, and ESLint are green.

Before this phase, keyboard support is real but organic: shortcuts registered where phases needed them (`/`, ↑/↓, Enter, `f`, `m`), focus behavior mostly browser-default, ARIA thin. After it, every list rides one roving-focus controller that cooperates with the windowing slice; every shortcut lives in `src/app/keymap.ts` with a `?` overlay generated from the same table; landmark, listbox, and dialog semantics are in place with correct windowed positions; webOS remote input (arrows/OK/Back arriving as keyboard events) is normalized onto the keyboard path and every flow verified pointer-free; focus is always visible, restored, and never trapped; contrast and sizes pass a 10-foot check; NVDA and VoiceOver walk the core journey; touch gets 44 px targets with long-press favorite parity; and an axe-core scan plus a documented manual checklist guard it all per release.

## Feature 25.1 — Roving focus model for lists

Focus in a 90,000-row windowed list cannot be tab order — one roving controller owns a single tabindex per list, moves an active index held in state, and cooperates with the windowing slice so focus follows the data, not the recycled DOM.

- [ ] **25.1.1** Roving controller — implement `src/ui/roving-focus.ts`: the list container holds the single `tabindex="0"`, rows render `tabindex="-1"`, and ↑/↓ move an active index held in Spektrum state per view.
- [ ] **25.1.2** Binding-driven highlight — derive the active-row highlight from `:class` bindings on the published slice — no direct classList mutation, so recycled rows can never keep a stale highlight.
- [ ] **25.1.3** Window cooperation — moving the index beyond the rendered slice scrolls via the controller (`scrollTop = index × ROW_H`) and republishes per §5.4, with DOM focus applied to the re-rendered row on the next `requestAnimationFrame`.
- [ ] **25.1.4** Jump keys — Home/End and PageUp/PageDown move by list bounds and viewport counts through the same index math — focus can never be lost to free scrolling.
- [ ] **25.1.5** Grid roving — extend the model two-dimensionally for the Phase 21 poster grid: ←/→ within a card row, ↑/↓ across rows, mapped through the 21.2 chunking math.
- [ ] **25.1.6** Index restoration — persist the per-view active index in the Phase 05 UI-state snapshot so re-entering a view restores the user's place.
- [ ] **25.1.7** Anchor visibility — keep the active row clear of the sticky search/header area with scroll-margin math in the controller, not CSS hacks.
- [ ] **25.1.8** One model everywhere — adopt the controller in all-channels, groups, favorites, recent, sources, and the poster grid — view adapters supply only index↔item mapping.
- [ ] **25.1.9** Real-focus decision — document choosing roving `tabindex` (real DOM focus) over `aria-activedescendant` for TV-browser and screen-reader compatibility, as the module's decision note.
- [ ] **25.1.10** Controller tests — unit test slice-boundary movement, the 2D grid math, jump keys, and restore-on-reenter.

## Feature 25.2 — Complete keyboard map

Every shortcut in one declarative table with contexts and precedence — the module the dispatcher executes, the help overlay renders, and the docs generate from, so conflicts are structurally impossible.

- [ ] **25.2.1** Keymap module — create `src/app/keymap.ts`: entries of `{key, context, actionFn, descriptionKey}` with contexts `overlay | settings | player | list | global`, executed by one document-level keydown dispatcher.
- [ ] **25.2.2** Standing bindings — encode the plan §9 map: `/` focuses search, ↑/↓/←/→ navigate, Enter activates/plays, Esc closes/back, `f` toggles favorite, `m` mutes, Space toggles play/pause, ←/→ zap during live playback.
- [ ] **25.2.3** Context precedence — resolve top-down (overlay → settings → player → list → global), first match wins; editable elements (input/textarea) automatically swallow single-character keys.
- [ ] **25.2.4** Media-kind split — the player context branches on `player.active.kind`: live maps ←/→ to zap, VOD/series map them to ±10 s seek — one table entry pair, no scattered conditionals.
- [ ] **25.2.5** Conflict guard — a dev-mode startup check throws on duplicate key+context registrations, keeping the map conflict-free by construction.
- [ ] **25.2.6** Listener consolidation — remove every per-view keydown listener added in Phases 02–24, migrating each into the table; a grep audit for `addEventListener('keydown'` outside the dispatcher and roving controller is recorded here.
- [ ] **25.2.7** Allocation-free dispatch — the dispatcher resolves via a prebuilt Map lookup and calls `preventDefault()` only on handled keys, leaving browser and OS shortcuts intact.
- [ ] **25.2.8** Described entries — every entry's `descriptionKey` resolves through the strings module, ready for the overlay and docs generation.
- [ ] **25.2.9** README generation — generate the README shortcut table from `keymap.ts` via `scripts/gen-keymap-docs.mjs` so documentation cannot drift from the code.
- [ ] **25.2.10** Dispatcher tests — cover context precedence, the media-kind split, editable-element suppression, and the conflict-guard throw.

## Feature 25.3 — Keyboard help overlay

Discoverability comes free when the map is data: `?` renders an overlay generated from `keymap.ts` itself — grouped by context, described from the strings module, and impossible to let rot.

- [ ] **25.3.1** `?` binding — register `?` (Shift+/) in the keymap's global context to toggle the help overlay — the overlay's own entry lives in the same table it renders.
- [ ] **25.3.2** Generated content — build the overlay's rows at open time by iterating the keymap table grouped by context — no hand-maintained shortcut list exists anywhere.
- [ ] **25.3.3** Overlay shell — render via `data-if` with the 25.4 dialog semantics; it appears and disappears instantly, and while open the overlay context suspends all other shortcuts.
- [ ] **25.3.4** Close and restore — Esc or `?` again closes; focus returns to the previously focused element through the 25.6 restoration helper.
- [ ] **25.3.5** Remote legend — include a fixed legend line mapping remote inputs (OK = Enter, Back = Esc) so the same overlay teaches TV users.
- [ ] **25.3.6** Discoverable entry — add a "Keyboard shortcuts" row in Settings → About opening the same overlay, for users who never guess `?`.
- [ ] **25.3.7** Readable at distance — lay the overlay out on `tokens.css` sizes that hold up at the 25.7 10-foot profile, two columns collapsing to one at narrow widths.
- [ ] **25.3.8** Scrollable and navigable — the overlay scrolls with the keyboard (↑/↓/PageDown) when the map outgrows the viewport, without ever trapping Esc.
- [ ] **25.3.9** Parity test — assert the rendered overlay contains exactly one row per keymap entry, so a new shortcut without a description fails loudly.
- [ ] **25.3.10** Strings coverage — a test iterates the table against the strings module verifying every description key resolves — no raw key names leaking as labels.

## Feature 25.4 — ARIA semantics

The minimal DOM gets honest semantics: navigation landmarks, listbox/option lists with correct windowed positions, a labeled player region, and real dialog behavior for panels — the difference between "renders" and "announces".

- [ ] **25.4.1** Rail landmark — mark the icon rail as `<nav aria-label>` with `aria-current` on the active view's button.
- [ ] **25.4.2** Listbox lists — give list containers `role="listbox"` and rows `role="option"` with `aria-selected`, plus `aria-setsize`/`aria-posinset` reflecting true catalog positions so a windowed slice announces "item 4 512 of 90 000".
- [ ] **25.4.3** Grid semantics — map the poster grid onto `role="grid"`/`row`/`gridcell` aligned with the 25.1.5 two-dimensional roving.
- [ ] **25.4.4** Player region — wrap dock and theater in `role="region"` with a strings-keyed label; play/pause exposes state by accessible-name swap (Play ↔ Pause) rather than `aria-pressed` (decision note).
- [ ] **25.4.5** Dialog panels — give the settings panel and help overlay `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` wired to their headings.
- [ ] **25.4.6** Live status region — add one `aria-live="polite"` status region fed by the notice slot (offline banner, update-ready, demotion notice) so one-line notices are announced exactly once.
- [ ] **25.4.7** Progress semantics — expose EPG progress as `role="progressbar"` with `aria-valuenow` updated only on the global 30 s tick — never chatty, never per-row timers.
- [ ] **25.4.8** Expandable panels — wire inline detail (EPG expansion, VOD/series panel) with `aria-expanded` on the trigger and `aria-controls` plus labels on the revealed region.
- [ ] **25.4.9** Icon-button audit — sweep every icon-only control for a strings-keyed `aria-label` and mark decorative icons `aria-hidden="true"`.
- [ ] **25.4.10** Axe integration — add an initial axe-core scan over the list, grid, player, and settings views asserting zero critical violations, seeding the 25.10 regression suite.

## Feature 25.5 — TV-remote mapping

The webOS remote sends arrows, OK, and Back as keyboard events — so the remote story is the keyboard story, plus normalization of TV-specific codes and the discipline of verifying every flow pointer-free.

- [ ] **25.5.1** Back normalization — normalize webOS Back (`keyCode 461`) onto the Escape path in the keymap dispatcher, alongside standard `Escape`/`GoBack` values, so Back behaves identically everywhere Esc does.
- [ ] **25.5.2** Back-stack policy — define and implement the back hierarchy (overlay → panel → theater → dock → list → rail) so Back on the remote never exits the app unexpectedly; document the order as a decision note.
- [ ] **25.5.3** Reachable search — make the search input part of the roving/arrow navigation order, since `/` does not exist on a remote — focusing it summons the TV's on-screen keyboard naturally.
- [ ] **25.5.4** Row-action affordance — give favorite toggling a remote path: ArrowRight on a focused row enters an inline row-action strip (favorite, open detail), since `f` is unreachable from a remote; note the design decision.
- [ ] **25.5.5** No hover-only UI — audit every hover-revealed affordance and give each a focus-visible equivalent, because a remote has no hover at all.
- [ ] **25.5.6** Key-repeat resilience — holding ArrowDown must scroll smoothly through the rAF-throttled window republish without queueing focus updates — verified against the 90 k fixture.
- [ ] **25.5.7** Magic-remote coexistence — webOS's pointer cursor still works: targets meet the 25.9 sizes and focus follows the last input modality without fighting the cursor.
- [ ] **25.5.8** Pointer-free walkthrough — execute every core flow (connect-URL import, browse, search, play, zap, settings, help) using only arrows/Enter/Esc and record the checklist here.
- [ ] **25.5.9** Remote documentation — add a remote column (OK/Back/arrows) to the generated keymap docs from 25.2.9 so the TV mapping ships with the shortcut table.
- [ ] **25.5.10** TV-profile dry run — run the walkthrough in a keyboard-only 1920×1080 Chromium session as the webOS stand-in, deferring real-hardware validation to Phase 30 (noted).

## Feature 25.6 — Focus visibility and management

Focus is the pointer for keyboard and remote users — always visible via tokens, restored after every panel, never trapped, and never dropped on the floor when the focused element disappears.

- [ ] **25.6.1** Focus ring tokens — define `:focus-visible` outline tokens in `tokens.css` (width, offset, per-theme color) applied globally; `outline: none` without a replacement is banned.
- [ ] **25.6.2** Restoration helper — implement a push/pop focus stack used by the settings panel, help overlay, and inline detail panels, restoring focus to the invoking element on close.
- [ ] **25.6.3** Dialog containment — modal dialogs wrap Tab/Shift+Tab within themselves and always release on Esc; non-modal surfaces (dock, notices) never contain focus.
- [ ] **25.6.4** Playback focus policy — starting dock playback leaves list focus untouched; entering theater moves focus into the player region, and leaving returns it to the originating row.
- [ ] **25.6.5** Orphan handling — when the focused element disappears (a row unfavorited in the favorites view, a deleted source), move focus to the nearest sibling or the list container — never silently to `<body>`.
- [ ] **25.6.6** Scroll-safe focus — programmatic focus after a slice republish uses `preventScroll: true` with the windowing controller doing the scrolling, avoiding double-scroll jank.
- [ ] **25.6.7** Skip link — add a visually-hidden-until-focused skip link from the rail to the list for keyboard users on every view.
- [ ] **25.6.8** Ring contrast — verify the focus ring meets 3:1 non-text contrast against every surface it can appear on, in both themes, with measured values noted.
- [ ] **25.6.9** Focus-order audit — walk each view recording the actual focus order; fix any positive tabindex or DOM-order surprises found.
- [ ] **25.6.10** Management tests — unit test the restoration stack, orphan reassignment, and dialog Tab-wrap in jsdom.

## Feature 25.7 — 10-foot readability pass

A TV is read from three meters: this pass measures contrast and sizes at a 1080p distance profile, fixes failures in tokens (never per-component), and bans information that only exists below the minimum size.

- [ ] **25.7.1** Distance profile — define the supported 10-foot profile (1920×1080, comfortable density, ~3 m viewing) and document it as the TV baseline in this phase file.
- [ ] **25.7.2** Contrast table — measure every text/background token pair in both themes against WCAG AA (4.5:1 normal, 3:1 large) and commit the results table beside `tokens.css`, extending the 22.5.7 spot-check into full coverage.
- [ ] **25.7.3** Token-level fixes — correct failing pairs by adjusting tokens only — per-component color overrides remain banned.
- [ ] **25.7.4** Minimum sizes — establish and enforce minimum font-size tokens for the profile (body, secondary, badge text); anything smaller must move into an on-demand panel instead.
- [ ] **25.7.5** Non-color redundancy — audit dots, progress bars, and the Phase 23 health indicators for a second signal (label, position, tooltip text) so color-blind viewers at distance lose nothing.
- [ ] **25.7.6** Truncation audit — verify ellipsized channel and title names at TV widths keep a useful prefix, setting minimum column widths for the name-vs-now-playing split.
- [ ] **25.7.7** Player surfaces — check theater transport, error surfaces, and the next-episode prompt at the distance profile — these appear when the user is furthest away.
- [ ] **25.7.8** Focus at distance — confirm the focus ring and active-row highlight are unmistakable from 3 m; adjust the ring tokens if the 25.6.8 values prove too subtle on a large panel.
- [ ] **25.7.9** Physical check — run the pass on a real 1080p screen at distance (or a faithful stand-in), noting deviations between measured contrast and perceived legibility.
- [ ] **25.7.10** Results record — file all measurements, fixes, and accepted deviations in the 10-foot section of `docs/a11y-checklist.md`.

## Feature 25.8 — Screen reader smoke pass

Semantics are only real when a screen reader agrees: a scripted NVDA and VoiceOver walkthrough of import → browse → play, with expected announcements written down first and deviations fixed or explicitly accepted.

- [ ] **25.8.1** Walkthrough script — write the scripted journey (paste-import → browse list → search → open inline detail → play → volume/mute → settings) with the expected announcement per step, before any SR run.
- [ ] **25.8.2** NVDA run — execute the script with NVDA on Windows (Chrome and Firefox), logging per-step results and deviations.
- [ ] **25.8.3** VoiceOver run — execute the script with VoiceOver on macOS Safari, logging the same way.
- [ ] **25.8.4** List announcements — verify option name, position-in-set (from `aria-setsize`/`aria-posinset`), selection state, and group context announce correctly inside the windowed list.
- [ ] **25.8.5** Notice announcements — verify the live status region announces offline/update/demotion notices exactly once, with no re-announcement on unrelated re-renders.
- [ ] **25.8.6** Player state — verify play/pause/mute changes and channel switches announce naturally through the accessible-name swaps and the status region.
- [ ] **25.8.7** Quiet progress — confirm EPG progress bars are not announced on every tick (no live semantics on progressbars; values readable on demand).
- [ ] **25.8.8** Settings forms — verify every settings control announces its label, current value, and hint (`for`/`id` plus `aria-describedby`) across both screen readers.
- [ ] **25.8.9** Fix or accept — fix every deviation in-phase or record it as an accepted limitation with its reason — no silent failures left behind.
- [ ] **25.8.10** Run records — file both runs (SR versions, browser versions, per-step outcomes) in the screen-reader section of `docs/a11y-checklist.md`.

## Feature 25.9 — Touch and hit targets

Fingers get the same respect as remotes: coarse-pointer devices force adequate target sizes automatically, long-press mirrors right-click favorite parity, and scrolling a 90 k list never misfires a tap.

- [ ] **25.9.1** Coarse-pointer density — force comfortable density (44 px rows) and ≥ 44 px controls under `@media (pointer: coarse)`, overriding a stored compact preference on touch devices; note the decision.
- [ ] **25.9.2** Long-press favorite — implement a pointer-events long-press detector (~500 ms hold, movement-cancel) on channel rows toggling favorite — parity with the desktop right-click from plan §9.
- [ ] **25.9.3** Ghost-click suppression — a completed long-press swallows the synthetic click so the row does not also start playback.
- [ ] **25.9.4** Rail and transport sizing — audit icon-rail buttons and dock/theater transport for ≥ 44 px touch boxes with enough spacing to prevent adjacent mis-taps.
- [ ] **25.9.5** Slider hit areas — enlarge the volume and seek-bar hit areas via padding (not visual size), keeping the minimal look while making them draggable by thumb.
- [ ] **25.9.6** Touch equivalents — verify every desktop-only affordance (hover reveals, right-click favorite) has a touch path — long-press, the 25.5.4 row actions, or tap-on-EPG-area for detail.
- [ ] **25.9.7** No tap delays — set `touch-action: manipulation` on interactive containers and confirm the viewport meta prevents double-tap-zoom surprises.
- [ ] **25.9.8** Scroll/tap discrimination — verify touch-scrolling the virtual list never activates rows (movement threshold in the tap handling), even during fast flings over 90 k rows.
- [ ] **25.9.9** Device verification — run import → browse → search → play → long-press-favorite on a real Android Chrome at ~360 px width, recording the results.
- [ ] **25.9.10** Detector tests — unit test the long-press timing, movement-cancel, and click-suppression logic.

## Feature 25.10 — A11y regression checklist

Accessibility survives only as a ratchet: an automated axe-core scan in the test suite plus a documented per-release manual pass, both wired into the standing release protocol so regressions fail loudly before users feel them.

- [ ] **25.10.1** Checklist document — create `docs/a11y-checklist.md` consolidating the per-release manual pass (keyboard-only core flow, condensed SR script, contrast spot-checks, touch targets) with the 25.7/25.8 results sections.
- [ ] **25.10.2** Axe in the suite — wire axe-core scans of the list, grid, player, settings, and help-overlay states into the Playwright suite, failing on new critical/serious violations.
- [ ] **25.10.3** Baseline and ratchet — record the current axe baseline; any new violation fails, and every baselined exception carries a written reason in the checklist.
- [ ] **25.10.4** Pointer-free E2E — add a Playwright run driving import → browse → search → play with keyboard events only — the automated backbone of the remote story.
- [ ] **25.10.5** Keymap drift guards — a test regenerates the keymap docs (25.2.9) and diffs against the committed output, and asserts overlay/table parity, so shortcuts, docs, and help can never diverge.
- [ ] **25.10.6** Focus-style guard — a lint script fails on any `outline: none`/`outline: 0` without an accompanying `:focus-visible` replacement in the stylesheets.
- [ ] **25.10.7** Contrast automation — a unit test computes contrast ratios from `tokens.css` custom-property values for the documented pairs, turning the 25.7.2 table into an executable check.
- [ ] **25.10.8** Suite wiring — expose the automated a11y suite as `npm run test:a11y`, run it in the standing verification, and document the command in the checklist.
- [ ] **25.10.9** First full pass — execute the complete manual checklist for this phase's merge and attach dated results.
- [ ] **25.10.10** Phase bookkeeping — check every box, record the decisions (real focus over `aria-activedescendant`, coarse-pointer density override, back-stack order), and run the standing MASTERPLAN.md §3 checklist plus the release-protocol cross-links.
