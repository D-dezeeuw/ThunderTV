# Phase 02 — App Shell & Design System

> **Epic goal:** Build the visual and navigational skeleton — design tokens, dark theme, the 56 px icon rail, a hand-rolled hash router, view switching, empty states, and density modes — with zero CSS transitions or animations anywhere.
> **Verification:** On the built `dist/` (preview and deployed Pages URL), every rail icon switches views instantly via hash routes, `#/connect` resolves to its stub, first-run/empty/error states render, both density modes flip row-height tokens live, `grep -ri "transition\|animation\|@keyframes" src/styles/ src/ui/` returns nothing, and build/typecheck/lint stay green.

Before this phase the repo is the Phase 01 skeleton: a deployable Vite + Spektrum smoke page with empty `src/app/`, `src/ui/`, and `src/styles/` folders. After it, the app has its permanent chrome: `tokens.css` and `base.css` define the dark-first design language, the icon rail navigates between Sources, Favorites, Recent, Guide, and Settings, the ~50-line hash router owns `location.hash` (including the `/connect` stub that Phase 14 will fill), each view renders inside one container with honest empty states, the settings panel shell overlays the rail, and compact/comfortable density is a one-variable switch — all instant, all animation-free, on desktop widths and a 1080p TV canvas alike.

## Feature 02.1 — tokens.css design tokens (color, spacing, typography, density variables)

One `src/styles/tokens.css` file is the single vocabulary for color, spacing, type, and density — every later component styles itself from these variables, never from literals.

- [ ] **02.1.1** Define the color scale — dark-first `--color-bg`, `--color-surface`, `--color-surface-raised`, `--color-border`, `--color-text`, `--color-text-dim`, `--color-accent`, `--color-danger` custom properties on `:root` in `src/styles/tokens.css`.
- [ ] **02.1.2** Define the spacing scale — `--space-1` through `--space-6` on a 4 px base, covering rail padding, row gaps, and panel insets.
- [ ] **02.1.3** Define typography tokens — system font stack in `--font-ui`, plus `--text-xs/sm/md/lg` sizes and `--leading-tight/normal` line heights (no webfont downloads, per the performance budget).
- [ ] **02.1.4** Define density variables — `--row-h` (default 44 px), `--row-pad-x`, and `--logo-box` tokens that Feature 02.8 retargets per density mode and the Phase 08 windowing math reads as its fixed row height.
- [ ] **02.1.5** Define chrome dimensions — `--rail-w: 56px`, `--panel-w` for the settings overlay, and `--dock-h` reserved for the Phase 12 player dock.
- [ ] **02.1.6** Add focus and state tokens — `--focus-ring` and hover/active surface tokens so keyboard-first navigation (and later webOS remote focus) has one consistent treatment.
- [ ] **02.1.7** Wire the file — import `tokens.css` before `base.css` from `index.html` and confirm Vite emits it into the built CSS with `base: './'`-safe URLs.
- [ ] **02.1.8** Reserve the light-theme hook — add a commented `[data-theme='light']` override block documenting that theme switching lands with Settings → Appearance (Phase 22), keeping tokens the only file a theme touches.
- [ ] **02.1.9** Convert the smoke page — restyle the Phase 01 smoke block using only tokens, deleting any literal colors/sizes it introduced.
- [ ] **02.1.10** Guard against literals — add a documented review rule (README conventions section) plus a `scripts/check-dist.mjs` grep failing on hex colors in `src/ui/` and `src/app/` CSS outside `tokens.css`.

## Feature 02.2 — Base stylesheet and reset with the no-animation policy

`src/styles/base.css` normalizes the browser and mechanically enforces the anti-jank rules: no transitions, no animations, no layout surprises.

- [ ] **02.2.1** Write the minimal reset — `box-sizing: border-box`, zeroed margins, `img { display: block; max-width: 100% }` in `src/styles/base.css`, nothing framework-sized.
- [ ] **02.2.2** Enforce the policy globally — add `*, *::before, *::after { transition: none !important; animation: none !important; }` with a comment citing the masterplan's no-animation principle.
- [ ] **02.2.3** Set the document baseline — `html`/`body` on `--color-bg`/`--color-text` with `--font-ui`, `height: 100%`, and `overflow: hidden` so only designated containers scroll.
- [ ] **02.2.4** Define scrolling discipline — a `.scroll-y` utility with `overscroll-behavior: contain` used by the view container and future channel list; document that scrollbars stay native.
- [ ] **02.2.5** Add truncation utilities — `.truncate` (ellipsis, `white-space: nowrap`) and fixed-box image rules backing the "no layout thrash" rule for channel rows.
- [ ] **02.2.6** Style focus visibly — `:focus-visible` outlines from `--focus-ring`, never removed without replacement, as the base of keyboard/remote navigation.
- [ ] **02.2.7** Apply `content-visibility` — a `.cv-auto` utility with `content-visibility: auto` and a sensible `contain-intrinsic-size`, used on off-screen panels per the anti-jank rules.
- [ ] **02.2.8** Respect reduced data, not motion — document in a CSS comment that `prefers-reduced-motion` needs no handling because nothing moves by design.
- [ ] **02.2.9** Add the animation grep gate — extend `scripts/check-dist.mjs` to fail the build check when `transition`, `animation`, or `@keyframes` appears in any authored CSS under `src/`.
- [ ] **02.2.10** Visual smoke — verify in the browser that focus rings, truncation, and scrolling behave on the built `dist/` with devtools' "Paint flashing" showing no idle repaints.

## Feature 02.3 — Icon rail sidebar (~56px: Sources, Favorites, Recent, Guide, Settings)

The permanent left edge of the app: five icon buttons in a 56 px rail, driven by Spektrum state, navigating by hash — the whole chrome the user keeps all day.

- [ ] **02.3.1** Build the rail markup — a `<nav class="rail">` in `index.html` with five `<button>` entries (Sources, Favorites, Recent, Guide, Settings) using `data-action="click:navigate"` and a `data-view` attribute each.
- [ ] **02.3.2** Style the rail — fixed `--rail-w` column, icons centered, active state via a token-driven background, no hover transitions, in a dedicated `src/styles/` rule block.
- [ ] **02.3.3** Track the active view — bind the active button's class to a Spektrum `ui.activeView` value (`:class` off `computed` per entry) so rail state always mirrors the router.
- [ ] **02.3.4** Implement `navigate` — a `defineFn('navigate', ...)` in `src/app/shell.ts` that sets `location.hash` (router remains the single source of truth; the action never mutates `ui.activeView` directly).
- [ ] **02.3.5** Add accessible names — `aria-label` and `title` per button sourced from the strings module stub (`src/app/strings.ts`), honoring the no-hardcoded-literals convention.
- [ ] **02.3.6** Mark the current view for AT — reflect `aria-current="page"` on the active rail button via a bound attribute.
- [ ] **02.3.7** Keyboard reachability — verify Tab reaches every rail button in order and Enter/Space activates it, as groundwork for the Phase 25 roving-focus work.
- [ ] **02.3.8** Distinguish Settings — Settings toggles the overlay panel (Feature 02.7) rather than switching the view container; encode that special case in the `navigate` action.
- [ ] **02.3.9** Keep files small — split rail wiring from `shell.ts` into `src/app/rail.ts` if either file approaches 300 lines, per the file-size convention.
- [ ] **02.3.10** Smoke on the built output — click all five entries on `npm run preview` and confirm hash, rail highlight, and view container stay in sync with zero visible repaint jank.

## Feature 02.4 — Hand-rolled hash router (~50 lines, with /connect stub route)

A tiny hash router — no dependency — that owns `location.hash`, drives `ui.activeView`, and already reserves the credential-carrying `/connect` route for Phase 14.

- [ ] **02.4.1** Implement the core — `src/app/router.ts` (~50 lines): parse `location.hash` into `{ path, params }` using `URLSearchParams` on the post-`?` fragment portion, per the masterplan §5.6 pattern.
- [ ] **02.4.2** Define the route table — a typed map of `#/sources`, `#/favorites`, `#/recent`, `#/guide`, and `#/connect` to view ids, with unknown hashes falling back to the default route.
- [ ] **02.4.3** Wire `hashchange` — a single listener that resolves the route and calls `setValue('ui.activeView', view)`; no other module may write that key.
- [ ] **02.4.4** Handle initial load — resolve the route once at bootstrap before `run()` so a deep link (e.g. `#/favorites`) renders the right view on first paint.
- [ ] **02.4.5** Default route — empty or bare `#/` redirects to `#/sources` via `history.replaceState` (no extra history entry).
- [ ] **02.4.6** Stub `/connect` — route `#/connect?...` to a placeholder view that displays "connect link detected" without reading credentials, plus a `TODO(phase-14)` marker; the stub must never log or render the fragment params.
- [ ] **02.4.7** Scrub discipline placeholder — document in `router.ts` that Phase 14 will consume-and-scrub the fragment via `history.replaceState` before any third-party request, so the router API must expose params without persisting them.
- [ ] **02.4.8** Type the routes — export a `Route` union type consumed by `rail.ts` and the view container so an unknown view id is a compile error.
- [ ] **02.4.9** Unit-test parsing — Vitest specs for hash parsing edge cases: no hash, bare `#`, unknown path, `#/connect?type=xtream` param extraction, malformed `?` sections.
- [ ] **02.4.10** Enforce the size budget — confirm `router.ts` stays ~50 lines (hard file limit aside) and note the final line count in this phase file.

## Feature 02.5 — View container and view switching

One `<main>` container swaps view partials instantly based on router state — the frame every content phase (channel list, guide, settings views) renders into.

- [ ] **02.5.1** Build the container — a single `<main class="view scroll-y">` beside the rail in `index.html`, hosting one view section per route.
- [ ] **02.5.2** Bind visibility — each view section toggles via `data-if` on `computed` per-view booleans derived from `ui.activeView` (no `display` string interpolation in templates).
- [ ] **02.5.3** Create view partial stubs — placeholder markup blocks for Sources, Favorites, Recent, Guide, and Connect, each carrying only a heading from the strings module.
- [ ] **02.5.4** Organize partials — keep view markup in `index.html` sections for now, with a `src/ui/views/` note documenting when a view graduates to its own partial file (channel list in Phase 08).
- [ ] **02.5.5** Preserve scroll per view — store each view's `scrollTop` in a plain module map in `src/app/views.ts` on switch-away and restore on switch-back (module memory, not Spektrum state — this is per-view UI state Phase 05 later formalizes).
- [ ] **02.5.6** Apply `content-visibility` — hidden views get the `.cv-auto` treatment so inactive DOM stays cheap.
- [ ] **02.5.7** Announce view changes — set `document.title` per view ("ThunderTV — Favorites") from the same route resolution, using strings-module labels.
- [ ] **02.5.8** Keep the swap instant — verify no intermediate blank frame on switching by checking a devtools performance recording (one style/layout pass per switch).
- [ ] **02.5.9** Unit-test switching — Vitest + a `bindDOM`-style harness asserting that setting each route hash makes exactly one view section visible.
- [ ] **02.5.10** Guard container ownership — document in `src/app/views.ts` that the future player dock and settings panel live outside `<main>`, so view switching never tears down playback.

## Feature 02.6 — Empty states (first-run, no results, error)

Honest, specific empty states are the product's first impression: the first-run import card, "no results", and error surfaces that never leave a blank pane.

- [ ] **02.6.1** Build the first-run card — a centered card in the Sources view offering the four import entry points (file, paste, URL, Xtream) as disabled-for-now buttons plus a one-line note that a connect bookmark skips setup entirely.
- [ ] **02.6.2** Gate it on state — show the card via `data-if` on a `computed('hasNoSources')` over `setValue`-seeded stub state, so Phase 07 only has to flip real data in.
- [ ] **02.6.3** Design the no-results state — a reusable empty block (icon + message + optional action slot) for Favorites/Recent/Guide when their collections are empty, each with a view-specific message from the strings module.
- [ ] **02.6.4** Design the error state — a distinct error block (uses `--color-danger` tokens) with slots for a classified message and a retry action, shaped to receive the Phase 03 `classifiedFetch` kinds later.
- [ ] **02.6.5** Extract the pattern — implement the three states as one shared partial in `src/ui/empty-state.ts` + markup template, parameterized by Spektrum values rather than copy-pasted per view.
- [ ] **02.6.6** Populate all stub views — wire Favorites, Recent, and Guide to show their no-results state by default, replacing the bare headings from 02.5.3.
- [ ] **02.6.7** Keep copy centralized — every empty-state string lives in `src/app/strings.ts`; grep-verify no user-facing literal exists in the partial code.
- [ ] **02.6.8** Style within budget — token-only styling, no illustrations or webfont icons; reuse the Feature 02.9 inline SVG set for the icon slot.
- [ ] **02.6.9** Unit-test the gating — Vitest specs asserting first-run card visibility flips with `hasNoSources`, and the error block renders its message value.
- [ ] **02.6.10** TV-distance review — check both density modes at 1080p canvas: empty-state text must be readable from couch distance (min font-size tokens respected).

## Feature 02.7 — Settings panel shell overlaying the rail

Settings is an overlay panel that appears over the rail instantly — no route change, no animation — establishing the shell that Phase 22 fills with real sections.

- [ ] **02.7.1** Build the panel — an `<aside class="settings-panel">` positioned over the rail/content edge at `--panel-w`, toggled by `data-if` on `ui.settingsOpen`.
- [ ] **02.7.2** Wire open/close — `defineFn('toggleSettings')` used by the rail's Settings button; Escape and an explicit close button both call it; state lives only in `ui.settingsOpen`.
- [ ] **02.7.3** Appear, don't slide — the panel renders instantly (per the no-animation policy) with a token-driven raised surface and border; verify no transition sneaks in via base.css overrides.
- [ ] **02.7.4** Stub the sections — headings for User, Streaming, Playback, and Appearance from the plan's settings taxonomy, each with an empty body and a `TODO(phase-22)` marker.
- [ ] **02.7.5** Seed Appearance early — place the Feature 02.8 density toggle inside the Appearance section so the panel ships with one working control.
- [ ] **02.7.6** Trap focus sensibly — on open, move focus to the panel; on close, return it to the Settings rail button; document the full a11y pass as Phase 25 scope.
- [ ] **02.7.7** Dismiss on outside click — clicking the dimmed content area closes the panel via one `data-action` on the backdrop element (no global click listener).
- [ ] **02.7.8** Keep the view alive — verify the underlying view (and later the player dock) keeps rendering beneath the panel; the panel never unmounts `<main>`.
- [ ] **02.7.9** Split files early — panel wiring lives in `src/app/settings-panel.ts`, separate from `shell.ts`, respecting the 300-line target.
- [ ] **02.7.10** Unit-test the toggle — Vitest spec asserting `toggleSettings` flips `ui.settingsOpen` and that Escape closes an open panel through the bound handler.

## Feature 02.8 — Density modes (compact 32px / comfortable 44px rows)

Density is one token flip: `--row-h` 32 px vs 44 px. It must be live-switchable now because the Phase 08 windowing math derives all scroll geometry from this constant.

- [ ] **02.8.1** Model the setting — a `ui.density` Spektrum value (`'compact' | 'comfortable'`, default comfortable) set only through a `defineFn('setDensity')` action.
- [ ] **02.8.2** Apply via attribute — reflect the mode as `data-density` on `<html>`; `tokens.css` overrides `--row-h`, `--row-pad-x`, and `--logo-box` under `[data-density='compact']`.
- [ ] **02.8.3** Build the toggle UI — a two-option control in the settings panel's Appearance section bound with `data-model` (or `data-action`) to `setDensity`.
- [ ] **02.8.4** Export the constant contract — a `rowHeight(density)` helper in `src/ui/density.ts` returning 32/44, documented as the single number the virtual-list controller may use (never measured from the DOM).
- [ ] **02.8.5** Demo rows — add a short static list of sample rows to the Sources view styled from `--row-h`, proving both modes render correctly before real channel rows exist.
- [ ] **02.8.6** Persist intent, defer plumbing — note in `setDensity` that persistence arrives with the Phase 05 persistence bridge; for now the choice is session-only (comment, not dead code).
- [ ] **02.8.7** Switch without jank — verify toggling density on the demo rows is a single instant relayout with no transition and no image size shift (fixed `--logo-box`).
- [ ] **02.8.8** TV default note — record the decision of whether 1080p TV canvases should default to comfortable (larger touch/remote targets) as an inline note for the webOS phase.
- [ ] **02.8.9** Unit-test the mapping — Vitest specs for `rowHeight()` and for `setDensity` updating both `ui.density` and the `data-density` attribute.
- [ ] **02.8.10** Document the contract — extend the README architecture notes: density changes re-publish the list window (one `setValue`), never trigger row measurement.

## Feature 02.9 — Inline SVG icon set

A tiny, dependency-free inline SVG icon set — rail icons, empty-state glyphs, and future transport icons — with zero network requests and one visual style.

- [ ] **02.9.1** Draw the core five — hand-tuned 24×24 `viewBox` SVGs for Sources, Favorites (star), Recent (clock), Guide (grid), and Settings (gear), stroke-based, consistent stroke width.
- [ ] **02.9.2** Choose the delivery mechanism — a single `<svg style="display:none">` sprite of `<symbol>`s in `index.html` referenced by `<use href="#icon-...">`, avoiding per-icon HTTP requests and JS icon components.
- [ ] **02.9.3** Color via tokens — icons inherit `currentColor` so rail active/inactive and danger states come free from the color tokens.
- [ ] **02.9.4** Add the supporting glyphs — close (×), search, plus/import, alert (for the error empty state), and play — the shapes Features 02.6/02.7 and Phase 12 already need.
- [ ] **02.9.5** Accessibility treatment — decorative `aria-hidden="true"` on all `<use>` sites; meaning is carried by the button's `aria-label` from 02.3.5.
- [ ] **02.9.6** Size discipline — icons render at token-controlled sizes (`--icon-s/m`), never scaled by layout side effects; verify crispness at both densities.
- [ ] **02.9.7** Budget check — measure the sprite's contribution to `index.html` (target well under 4 KB raw) and record it against the initial-JS/asset budget.
- [ ] **02.9.8** Keep licensing clean — icons are original hand-drawn paths (no copied icon-font glyphs); note authorship in a comment above the sprite.
- [ ] **02.9.9** Document how to add one — a short comment convention above the sprite (naming: `icon-<name>`, 24×24, stroke 2) so later phases extend it consistently.
- [ ] **02.9.10** Verify no regressions — confirm the sprite renders identically on the deployed Pages build (relative-URL-safe since `<use>` is same-document) and in `file://` preview.

## Feature 02.10 — Responsive behavior (narrow window and 1080p TV canvas)

The shell must hold together from a narrow desktop window up to a 1080p TV canvas — same layout system, no breakpoint-driven redesign, no animation.

- [ ] **02.10.1** Define the grid — the shell is one CSS grid: `--rail-w` fixed column + flexible `<main>`, with the future dock as a grid row; no absolute-positioned layout except the settings overlay.
- [ ] **02.10.2** Set the floor — establish a minimum supported width (~360 px), at which the rail stays 56 px and content compresses; verify no horizontal scrollbar appears at the floor.
- [ ] **02.10.3** Handle narrow overlay — below a token-defined threshold the settings panel covers the full width instead of `--panel-w`; implemented with one media query on custom properties.
- [ ] **02.10.4** Verify 1080p TV canvas — at exactly 1920×1080, check rail hit targets, type sizes, and empty states at 2–3 m viewing distance assumptions; record adjustments as token changes only.
- [ ] **02.10.5** Respect UI scale — test browser zoom 100–200 % and confirm layout is zoom-stable (rem/token-based sizing, no px-locked text).
- [ ] **02.10.6** Guard fixed-height math — document that `--row-h` is density-controlled and never responsive (the windowing controller depends on it being constant per mode) — viewport size changes row *count*, not row height.
- [ ] **02.10.7** Reserve dock space honestly — when the (stub) dock row is present, `<main>` shrinks via the grid; nothing overlaps or reflows text mid-list.
- [ ] **02.10.8** Test viewport resize behavior — resizing the window must trigger no transition artifacts and at most one relayout per frame; verify with a performance recording.
- [ ] **02.10.9** Cross-browser smoke — verify the shell in Chromium, Firefox, and Safari (import-map-capable versions), noting any grid/`content-visibility` deltas in this phase file.
- [ ] **02.10.10** Deploy and close — `npm run deploy`, walk the full shell (routes, panel, density, both canvas sizes) on the live Pages URL, and complete the phase `> Verification:` line before merging `feature/phase-02-app-shell-and-design-system`.
