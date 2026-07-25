# Phase 02 — App Shell & Design System

> **Epic goal:** Build the visual and navigational skeleton — design tokens, dark theme, the 56 px icon rail, a hand-rolled hash router, view switching, empty states, and density modes — with zero CSS transitions or animations anywhere.
> **Verification:** On the built `dist/` (preview and deployed Pages URL), every rail icon switches views instantly via hash routes, `#/connect` resolves to its stub, first-run/empty/error states render, both density modes flip row-height tokens live, `grep -ri "transition\|animation\|@keyframes" src/styles/ src/ui/` returns nothing, and build/typecheck/lint stay green. **Met, with one correction to this line's own literal wording** — see "Completion notes."

Before this phase the repo is the Phase 01 skeleton: a deployable Vite + Spektrum smoke page with empty `src/app/`, `src/ui/`, and `src/styles/` folders. After it, the app has its permanent chrome: `tokens.css` and `base.css` define the dark-first design language, the icon rail navigates between Sources, Favorites, Recent, Guide, and Settings, the ~50-line hash router owns `location.hash` (including the `/connect` stub that Phase 14 will fill), each view renders inside one container with honest empty states, the settings panel shell overlays the rail, and compact/comfortable density is a one-variable switch — all instant, all animation-free, on desktop widths and a 1080p TV canvas alike.

**Live:** deployed to [d-dezeeuw.github.io/ThunderTV](https://d-dezeeuw.github.io/ThunderTV/); verified via `curl` (HTTP 200, correct new shell markup) and via a full real-browser interaction pass against the built, vendored `dist/` (same sandbox-proxy caveat as Phase 01 applies to hitting the live URL from a real browser inside this session — see "Completion notes").

## Feature 02.1 — tokens.css design tokens (color, spacing, typography, density variables)

One `src/styles/tokens.css` file is the single vocabulary for color, spacing, type, and density — every later component styles itself from these variables, never from literals.

- [x] **02.1.1** Define the color scale — `--color-bg/-surface/-surface-raised/-border/-text/-text-dim/-accent/-danger` on `:root`, plus `--color-scrim` (added for the settings-panel backdrop, Feature 02.7).
- [x] **02.1.2** Define the spacing scale — `--space-1` through `--space-6` on a 4px base.
- [x] **02.1.3** Define typography tokens — `--font-ui` system stack, `--text-xs/sm/md/lg`, `--leading-tight/normal`.
- [x] **02.1.4** Define density variables — `--row-h` (44px default), `--row-pad-x`, `--logo-box`.
- [x] **02.1.5** Define chrome dimensions — `--rail-w: 56px`, `--panel-w: 320px`, `--dock-h: 96px` (reserved, unused until Phase 12).
- [x] **02.1.6** Add focus and state tokens — `--focus-ring`, `--surface-hover`, `--surface-active`.
- [x] **02.1.7** Wire the file — `tokens.css` linked before `base.css`/`shell.css` in `index.html`; confirmed present in the built `dist/index.html` with relative (`base: './'`-safe) URLs.
- [x] **02.1.8** Reserve the light-theme hook — commented `[data-theme='light']` override block in `tokens.css` documenting the Phase 22 handoff.
- [x] **02.1.9** Convert the smoke page — **superseded rather than restyled**: the Phase 01 smoke block (`.smoke`, `.smoke__message`, etc.) is deleted outright, replaced by the real shell. Its role as "the thing that proves Spektrum reactivity works" is now served by real interactions (route switching, settings toggle, density toggle) — see the "Smoke page removed" completion note for the reasoning.
- [x] **02.1.10** Guard against literals — `scripts/check-css.mjs` (new) greps `src/**/*.css` for literal hex colors outside `tokens.css`; proven to catch a regression via an injected probe file, then clean; `README.md`'s conventions section documents the rule.

## Feature 02.2 — Base stylesheet and reset with the no-animation policy

`src/styles/base.css` normalizes the browser and mechanically enforces the anti-jank rules: no transitions, no animations, no layout surprises.

- [x] **02.2.1** Write the minimal reset — `box-sizing: border-box` on `*`/`::before`/`::after`, `img { display: block; max-width: 100% }`.
- [x] **02.2.2** Enforce the policy globally — `*, *::before, *::after { transition: none !important; animation: none !important; }` with a comment citing the no-animation policy.
- [x] **02.2.3** Set the document baseline — `html`/`body` on `--color-bg`/`--color-text`/`--font-ui`, `height: 100%`, `overflow: hidden`.
- [x] **02.2.4** Define scrolling discipline — `.scroll-y` utility (`overflow-y: auto; overscroll-behavior: contain`), applied to the view container.
- [x] **02.2.5** Add truncation utilities — `.truncate` (ellipsis) plus the `img` fixed-box rule from 02.2.1.
- [x] **02.2.6** Style focus visibly — `:focus { outline: none }` + `:focus-visible { box-shadow: var(--focus-ring) }`, never removed without replacement.
- [x] **02.2.7** Apply `content-visibility` — `.cv-auto` utility (`content-visibility: auto; contain-intrinsic-size: auto 500px`), applied to hidden view sections.
- [x] **02.2.8** Respect reduced data, not motion — documented in a `base.css` comment: no `prefers-reduced-motion` handling needed since nothing moves by design.
- [x] **02.2.9** Add the animation grep gate — implemented in the new `scripts/check-css.mjs` (see "Completion notes" for why this is a sibling script rather than an extension of `check-dist.mjs`, despite the task text naming the latter) — fails on `transition:`/`animation:`/`@keyframes` in authored `src/**/*.css`, correctly excluding the intentional `none !important` kill-switch; proven via an injected probe.
- [x] **02.2.10** Visual smoke — **adapted**: no literal DevTools "Paint flashing" recording (not scriptable via this session's headless-browser tooling); verified the stronger, mechanical equivalent instead — `check-css.mjs` guarantees zero authored transitions/animations exist at all, and the real-browser interaction pass (routes, settings, density) showed instant, single-frame changes throughout with no visible flicker.

## Feature 02.3 — Icon rail sidebar (~56px: Sources, Favorites, Recent, Guide, Settings)

The permanent left edge of the app: five icon buttons in a 56 px rail, driven by Spektrum state, navigating by hash — the whole chrome the user keeps all day.

- [x] **02.3.1** Build the rail markup — `<nav class="rail">` in `index.html` with five `<button>` entries; the four route buttons use `data-view` + `data-action="click" data-fn="navigate"`.
- [x] **02.3.2** Style the rail — fixed `--rail-w` column, centered icons, token-driven active state (`.rail__btn--active`), no hover transitions (enforced globally by 02.2.2).
- [x] **02.3.3** Track the active view — `:class="{ 'rail__btn--active': view.<route>.active }"` per button, bound to the `computed()` values from Feature 02.5.2/shell.ts.
- [x] **02.3.4** Implement `navigate` — `defineFn('navigate', ...)` in `src/app/shell.ts`; reads `el.dataset.view`, sets `location.hash` only — never writes `ui.activeView` directly.
- [x] **02.3.5** Add accessible names — `:aria-label`/`:title` bound to `strings.rail.*` (seeded into Spektrum state at bootstrap so bindings can reach the plain-TS `strings.ts` module — see `src/app/strings.ts`).
- [x] **02.3.6** Mark the current view for AT — `:aria-current="view.<route>.active ? 'page' : null"`; confirmed via the real `.d.ts`-documented kebab-attribute path (`setAttribute`/`removeAttribute`, not a dead property expando) before writing any markup, and confirmed for real in the browser (`aria-current: "page"` present only on the active button).
- [x] **02.3.7** Keyboard reachability — all five rail buttons are plain, unmodified `<button>` elements in DOM order, so Tab/Enter/Space work natively; no custom tabindex handling needed yet (Phase 25 formalizes roving focus for the eventual channel list, not this small, static rail).
- [x] **02.3.8** Distinguish Settings — **implemented more directly than specified**: rather than routing Settings through `navigate` with an internal special case, its button binds straight to `data-fn="toggleSettings"` (Feature 02.7) — it was never a route to begin with, so `navigate` (and `location.hash`) never needs to know about it at all. Simpler and removes a branch; noted as a deliberate deviation from the task's literal wording.
- [x] **02.3.9** Keep files small — `shell.ts` (navigate + view-active computeds + connect detection) is 47 lines; no split needed yet.
- [x] **02.3.10** Smoke on the built output — **real browser proof**: clicked all five rail entries against `npm run preview` of the vendored `dist/`; hash, `aria-current`, `document.title`, and the visible view section all stayed in sync across every route, zero console errors.

## Feature 02.4 — Hand-rolled hash router (~50 lines, with /connect stub route)

A tiny hash router — no dependency — that owns `location.hash`, drives `ui.activeView`, and already reserves the credential-carrying `/connect` route for Phase 14.

- [x] **02.4.1** Implement the core — `src/app/router.ts`: `parseHash()` splits `location.hash` into `{ path, params }` via `URLSearchParams` on the post-`?` portion.
- [x] **02.4.2** Define the route table — `ROUTE_VALUES: readonly Route[]` (`sources`/`favorites`/`recent`/`guide`/`connect`); `resolveRoute()` falls back to `DEFAULT_ROUTE` (`sources`) for anything else.
- [x] **02.4.3** Wire `hashchange` — one `window.addEventListener('hashchange', applyRoute)` in `initRouter()`; `applyRoute()` is the *only* place `setValue('ui.activeView', ...)` is ever called in the codebase.
- [x] **02.4.4** Handle initial load — `initRouter()` calls `applyRoute()` once synchronously before `bindDOM()`/`run()` in `src/app/index.ts`'s bootstrap order.
- [x] **02.4.5** Default route — empty/bare `#/` calls `history.replaceState(null, '', '#/sources')` (no extra history entry) before setting state.
- [x] **02.4.6** Stub `/connect` — resolves to the `connect` route; the router itself never reads or exposes the params for storage/logging (only `parseHash()`'s pure return value is available to callers).
- [x] **02.4.7** Scrub discipline placeholder — documented inline in `router.ts`; Feature 02.5's `connect.detected` (in `shell.ts`) demonstrates the pattern by re-parsing `location.hash` only to check *whether* params exist, never their values — proven not to leak by a real test (see Completion notes: a fake `pass=secret` connect link never appears anywhere in the rendered DOM).
- [x] **02.4.8** Type the routes — `export type Route = 'sources' | 'favorites' | 'recent' | 'guide' | 'connect'`, consumed by `shell.ts` and `views.ts`; an unknown view id used as a `Route` is a compile error.
- [x] **02.4.9** Unit-test parsing — `src/app/router.spec.ts`, 10 real Vitest cases: no hash, bare `#`, bare `#/`, connect param extraction, malformed `?` sections, trailing `?` with no query, known/unknown/empty route resolution. All passing.
- [x] **02.4.10** Enforce the size budget — **60 lines** (target was ~50; the extra ~10 are doc comments on `parseHash`/`resolveRoute`/`initRouter`, judged worth keeping for clarity, well under the 300/400-line hard convention).

## Feature 02.5 — View container and view switching

One `<main>` container swaps view partials instantly based on router state — the frame every content phase (channel list, guide, settings views) renders into.

- [x] **02.5.1** Build the container — `<main class="view scroll-y" data-ref="viewContainer">` beside the rail in `index.html`, hosting five `<section>`s (one per route including `connect`).
- [x] **02.5.2** Bind visibility — each section uses `data-if="view.<route>.active"`, bound to `computed()` values registered once per route in `shell.ts`'s `registerViewActiveComputeds()` — never a raw `ui.activeView === '...'` comparison repeated in markup.
- [x] **02.5.3** Create view partial stubs — Sources/Favorites/Recent/Guide/Connect sections each carry a heading from `strings.views.<route>.heading`.
- [x] **02.5.4** Organize partials — all view markup lives directly in `index.html` for now, as planned; no `src/ui/views/` split needed until Phase 08's real channel list.
- [x] **02.5.5** Preserve scroll per view — `src/app/views.ts`: a module-level `Map<Route, number>` (not Spektrum state) saves `scrollTop` on switch-away and restores it (one rAF later, so the new section is actually visible first) on switch-back.
- [x] **02.5.6** Apply `content-visibility` — every non-Sources view section carries `.cv-auto`; Sources itself is the default/most-common view and is left out deliberately (it's usually the visible one, so `content-visibility: auto` would provide no benefit there).
- [x] **02.5.7** Announce view changes — `document.title = "ThunderTV — <Title>"` set from `views.ts`'s same `watch(['ui.activeView'], ...)` system, using `strings.views.<route>.title`.
- [x] **02.5.8** Keep the swap instant — **adapted**: no literal DevTools performance recording; verified functionally instead — rapid successive route clicks in the real-browser test showed exactly one visible section at every step, no stale double-visible frame observed.
- [x] **02.5.9** Unit-test switching — `src/app/views.spec.ts`: a real `bindDOM`-backed harness building one fixture `<section data-if>` per route, driving genuine `hashchange` events (see the "hashchange is asynchronous" finding below) through `initRouter()`, asserting exactly one section is visible per route across all five routes.
- [x] **02.5.10** Guard container ownership — documented in `views.ts`'s module comment: the future player dock and settings panel live outside `<main>` (confirmed structurally: `.settings-panel` is a sibling of `<main>` in `index.html`, not a descendant).

## Feature 02.6 — Empty states (first-run, no results, error)

Honest, specific empty states are the product's first impression: the first-run import card, "no results", and error surfaces that never leave a blank pane.

- [x] **02.6.1** Build the first-run card — centered card in Sources with four disabled-for-now import buttons (file/paste/URL/Xtream) plus the connect-bookmark note, all copy from `strings.emptyStates.firstRun`.
- [x] **02.6.2** Gate it on state — `data-if="hasNoSources"`, a `computed()` over `setValue`-seeded `sources.count` (stub `0` at bootstrap; Phase 07 flips real data in with no binding changes required).
- [x] **02.6.3** Design the no-results state — Favorites/Recent/Guide each render the shared `.empty-state` structure (icon + heading + message), view-specific copy from `strings.emptyStates.<view>`.
- [x] **02.6.4** Design the error state — `.empty-state--error`/`.empty-state__heading` color-override rules exist in `shell.css`, using `--color-danger`. **No live instance renders it yet** — nothing in the app performs a fetch that can fail until Phase 03's `classifiedFetch` exists, so wiring a real trigger now would mean fabricating a fake error condition. Shape is ready for Phase 03/07 to attach to.
- [x] **02.6.5** Extract the pattern — **implemented differently than the task's literal wording, by design necessity**: Spektrum has no component/include system, so "one shared partial" is a structural CSS contract in `shell.css` (`.empty-state`/`__heading`/`__message`/`__note`/`__actions`) reused verbatim by every instance, plus the one piece of real *logic* the pattern needs (`hasNoSources`) centralized in `src/ui/empty-state.ts`. See "Completion notes" for the reasoning against dynamically-injected-and-rebound HTML fragments.
- [x] **02.6.6** Populate all stub views — Favorites/Recent/Guide all show their no-results state unconditionally (no gating needed — these collections are always empty pre-Phase-13).
- [x] **02.6.7** Keep copy centralized — grep-verified: no user-facing string literal exists outside `src/app/strings.ts` in any `{{...}}`/`:attr` binding.
- [x] **02.6.8** Style within budget — token-only styling (`check-css.mjs` covers this too); icons reuse the Feature 02.9 sprite (`#icon-plus`, `#icon-favorites`, `#icon-recent`, `#icon-guide`).
- [x] **02.6.9** Unit-test the gating — `src/ui/empty-state.spec.ts`, 3 real Vitest cases including a genuine framework-sharp-edge finding (see "Completion notes"): `hasNoSources` true at `count=0`, flips false at `count=3`, and correctly falls back to true when `count` transitions to an explicit absent value.
- [x] **02.6.10** TV-distance review — checked at 1920×1080 (see Feature 02.10's responsive pass): no horizontal scroll, empty-state text renders at `--text-md`/`--text-sm` (16px/14px) in both density modes. **Partial**: genuine "2-3m couch distance" legibility can't be judged from this sandbox; token sizes are reasonable defaults, real hardware validation deferred to Phase 30 (webOS Target & 1.0 Release), which already owns TV validation.

## Feature 02.7 — Settings panel shell overlaying the rail

Settings is an overlay panel that appears over the rail instantly — no route change, no animation — establishing the shell that Phase 22 fills with real sections.

- [x] **02.7.1** Build the panel — `<aside class="settings-panel" data-if="ui.settingsOpen" data-ref="settingsPanel">` positioned via `position: fixed; inset: 0` with a `--panel-w`-capped body.
- [x] **02.7.2** Wire open/close — `defineFn('toggleSettings')` (rail button) and `defineFn('closeSettings')` (Escape/backdrop/close button) in `src/app/settings-panel.ts`; state lives only in `ui.settingsOpen`.
- [x] **02.7.3** Appear, don't slide — `data-if` sets `display` directly (no transition possible — the global kill-switch would block one anyway); confirmed no stray transition in `check-css.mjs` and visually in the real-browser pass.
- [x] **02.7.4** Stub the sections — User/Streaming/Playback/Appearance headings, each with a `TODO(phase-22)` marker; Appearance additionally hosts the real density toggle (02.7.5).
- [x] **02.7.5** Seed Appearance early — the density toggle (`.density-toggle`, Feature 02.8) lives inside the Appearance section, so the panel ships with one fully working control instead of only stubs.
- [x] **02.7.6** Trap focus sensibly — **real, verified behavior**: on open, focus moves into the panel via a double-`requestAnimationFrame` (documented reasoning: `ui.settingsOpen`'s DOM effect applies on Spektrum's next tick, so focusing before that targets a still-hidden element); on close, focus returns to whichever element had it before opening (captured via `document.activeElement`, not hardcoded to the rail button). Confirmed in the real-browser test: `focusInsidePanel: true` after open, `focusReturnedToSettingsBtn: true` after Escape.
- [x] **02.7.7** Dismiss on outside click — `.settings-panel__backdrop` carries its own `data-action="click" data-fn="closeSettings"`, no global click listener.
- [x] **02.7.8** Keep the view alive — confirmed structurally: `.settings-panel` is a sibling of `<main>`, never wraps or replaces it.
- [x] **02.7.9** Split files early — `src/app/settings-panel.ts` (38 lines), separate from `shell.ts`.
- [x] **02.7.10** Unit-test the toggle — `src/app/settings-panel.spec.ts`, 2 real Vitest cases (open/close toggle, Escape-through-the-bound-handler) — see "Completion notes" for a real `bindDOM()` idempotency bug this test caught in itself before it was fixed.

## Feature 02.8 — Density modes (compact 32px / comfortable 44px rows)

Density is one token flip: `--row-h` 32 px vs 44 px. It must be live-switchable now because the Phase 08 windowing math derives all scroll geometry from this constant.

- [x] **02.8.1** Model the setting — `ui.density` (`'compact' | 'comfortable'`, default `'comfortable'`), set only through `defineFn('setDensity')`.
- [x] **02.8.2** Apply via attribute — `<html :data-density="ui.density">`; confirmed `bindDOM()`'s default root is `document` (verified in the real `spektrum.js` source, not assumed), so binding directly on `<html>` — not a manual `document.documentElement.setAttribute()` call — is both correct and simpler. `tokens.css`'s `[data-density='compact']` block overrides `--row-h`/`--row-pad-x`/`--logo-box`.
- [x] **02.8.3** Build the toggle UI — two buttons in the settings panel's Appearance section, `data-density="compact"/"comfortable"` + `data-action="click" data-fn="setDensity"`.
- [x] **02.8.4** Export the constant contract — `rowHeight(density)` in `src/ui/density.ts`, returning 32/44; documented as the one number the Phase 08 windowing controller may use, never DOM-measured.
- [x] **02.8.5** Demo rows — a small static list in the Sources view, styled from `--row-h`/`--row-pad-x`/`--logo-box`. **Real bug found and fixed here**: `data-each="demoRows"` was first placed on the repeated `<li>` itself instead of its `<ul>` container — exactly the anti-pattern the real Spektrum docs explicitly warn against ("❌ wrong: `<li>` is the container..."). Caught by the real-browser test (`demoRowCount: 1` instead of 4), fixed, re-verified (`demoRowCount: 4`). Shown unconditionally (not gated on `hasNoSources`) since proving density rendering is independent of real source state.
- [x] **02.8.6** Persist intent, defer plumbing — commented in `density.ts`: session-only until Phase 05's persistence bridge.
- [x] **02.8.7** Switch without jank — confirmed in the real-browser test: toggling to compact instantly changed the demo row height from 44px to 32px with no transition (blocked globally anyway) and no logo-box size shift.
- [x] **02.8.8** TV default note — recorded here for Phase 30: comfortable (44px, the current default) is very likely the right default for TV/remote targets too, given webOS's larger recommended touch/focus target sizes; revisit only if real hardware testing (Phase 30) says otherwise.
- [x] **02.8.9** Unit-test the mapping — `src/ui/density.spec.ts`, 4 real Vitest cases: `rowHeight()` for both modes, `setDensity` updating `ui.density` on a real bound click, and correctly ignoring an invalid density value.
- [x] **02.8.10** Document the contract — recorded in `density.ts`'s own doc comment (README architecture notes deferred to whenever `src/ui/` gets a dedicated README section — not yet, to avoid a near-duplicate of the code comment).

## Feature 02.9 — Inline SVG icon set

A tiny, dependency-free inline SVG icon set — rail icons, empty-state glyphs, and future transport icons — with zero network requests and one visual style.

- [x] **02.9.1** Draw the core five — hand-drawn 24×24 `viewBox` symbols for Sources (list), Favorites (star), Recent (clock), Guide (2×2 grid), Settings (gear), stroke-based, `stroke-width="2"` throughout.
- [x] **02.9.2** Choose the delivery mechanism — one `<svg style="display:none">` sprite of `<symbol>`s in `index.html`, referenced via `<use href="#icon-...">` — zero per-icon HTTP requests, zero JS icon components.
- [x] **02.9.3** Color via tokens — every shape uses `stroke="currentColor"` (or `fill="currentColor"` for the two solid glyphs), so rail active/inactive and danger states inherit color for free.
- [x] **02.9.4** Add the supporting glyphs — close (×), search, plus (import), alert (with a solid dot, for the not-yet-live error state), play (solid triangle).
- [x] **02.9.5** Accessibility treatment — every `<svg><use>` wrapper carries `aria-hidden="true"`; meaning comes from the parent button's `aria-label`/heading text, never the icon itself.
- [x] **02.9.6** Size discipline — `.icon--s`/`.icon--m` (rail/close/settings-header) and `.icon--empty` (via `--icon-l`) token-driven sizes; verified crisp at both densities in the real-browser pass (no layout-side-effect scaling observed).
- [x] **02.9.7** Budget check — **real finding and real fix**: the sprite's first-draft, Prettier-expanded markup measured 7,320 raw bytes — nearly double the "well under 4 KB" target. Fixed by hand-compacting every `<symbol>` onto single lines under a `<!-- prettier-ignore -->` marker (confirmed Prettier respects it and won't silently re-expand on the next `npm run format`); final size **3,524 raw bytes**, and the built `dist/index.html` (18.47 KB raw / 3.42 KB gz total, sprite included) still comfortably clears the ~60 KB app-JS budget it's checked against.
- [x] **02.9.8** Keep licensing clean — every path/shape is hand-drawn geometry (rects, circles, lines, two custom paths for the star and play triangle) — no copied icon-font glyphs; authorship/drawing rules noted in the sprite's leading comment.
- [x] **02.9.9** Document how to add one — the sprite's first line is exactly this: `id="icon-<name>"`, `viewBox="0 0 24 24"`, `stroke="currentColor" stroke-width="2" fill="none"`, `stroke-linecap/linejoin="round"`.
- [x] **02.9.10** Verify no regressions — confirmed in the real-browser pass against the vendored, same-origin `dist/` build (relative-URL-safe, same-document `<use>` needs no origin check); `file://` re-verification not repeated here since Feature 01.8.4 already established `type="module"` itself fails under `file://` regardless of the sprite.

## Feature 02.10 — Responsive behavior (narrow window and 1080p TV canvas)

The shell must hold together from a narrow desktop window up to a 1080p TV canvas — same layout system, no breakpoint-driven redesign, no animation.

- [x] **02.10.1** Define the grid — `#app { display: grid; grid-template-columns: var(--rail-w) 1fr; }` in `shell.css`; no absolute positioning anywhere except the settings overlay (`position: fixed`, the one documented exception).
- [x] **02.10.2** Set the floor — `--floor-w: 360px` documented in `tokens.css`; **verified for real** at exactly 360×640: `hasHorizontalScroll: false`, rail stays 56px, content column compresses.
- [x] **02.10.3** Handle narrow overlay — one `@media (max-width: 480px) { .settings-panel__body { width: 100%; } }` in `shell.css`. **Documented limitation**: media query conditions can't reference CSS custom properties, so the literal `480px` and `tokens.css`'s `--panel-narrow-threshold` documentation token must be kept in sync by hand — flagged with an explicit comment at both sites. Verified for real at 400×800 (`panelWidth: 400`, i.e. full-width) vs. 1280×800 (`panelWidth: 320`, i.e. capped).
- [x] **02.10.4** Verify 1080p TV canvas — **verified for real** at exactly 1920×1080: no horizontal scroll, rail hit targets unchanged (56px), settings panel caps at `--panel-w` (320px) rather than going full-width (correctly above the narrow threshold). True couch-distance legibility judgment deferred to Phase 30 (see Feature 02.6.10) — this session has no physical display to judge that against.
- [x] **02.10.5** Respect UI scale — tested via `deviceScaleFactor: 2` (a proxy for browser zoom, since Playwright doesn't expose zoom directly): no horizontal scroll introduced, rail width stable. All sizing is `rem`/token-based (no `px`-locked text), so genuine zoom should behave identically; full 100–200% browser-zoom testing deferred (not scriptable in this sandbox) but the underlying CSS technique is the same one the DPR test exercised.
- [x] **02.10.6** Guard fixed-height math — documented in `tokens.css`'s density-token comment and `density.ts`'s doc comment: `--row-h` is density-controlled, never responsive; viewport changes row *count* via the (future) windowing controller, never row *height*.
- [x] **02.10.7** Reserve dock space honestly — `#app`'s grid comment in `shell.css` documents that Phase 12's dock becomes a second grid row without changing this structure; no dock exists yet to verify against, so this is a documented contract, not yet a tested behavior.
- [x] **02.10.8** Test viewport resize behavior — implied by 02.10.2/02.10.4/02.10.5's independent viewport checks all passing with zero console errors and no transition artifacts possible (global kill-switch); a live continuous-resize drag wasn't separately scripted since discrete-viewport checks at the floor, threshold, and TV sizes cover the same CSS paths.
- [ ] **02.10.9** Cross-browser smoke — **deferred**: this sandbox only has a headless Chromium build available (`/opt/pw-browsers`); Firefox and Safari aren't installed and can't be obtained here. Chromium is thoroughly verified (every interactive check in this phase). Real Firefox/Safari verification needs a machine with those browsers — flagged for a manual pass before considering the shell fully cross-browser-proven.
- [x] **02.10.10** Deploy and close — `npm run deploy` run for real against `D-dezeeuw/ThunderTV`; live URL verified via `curl` (HTTP 200, correct new shell content) and the `gh-pages` branch tree confirmed to still exactly match `dist/` (no dotfile regression — Phase 01's `--dotfiles` fix holds on a second real deploy). Phase gate walked below.

## Completion notes

**What's genuinely done and verified:** the full app shell — tokens, reset, rail, router, view switching, empty states, settings panel, density, icon sprite, and responsive behavior — all built, and almost everything proven with a **real, interactive, headless-Chromium session** against the vendored/same-origin build: every route click verified end-to-end (hash, `aria-current`, `document.title`, visible section all in sync), settings open/close with real focus-trap behavior, density toggle changing real row geometry live, a connect-link test proving credentials never touch the DOM, and viewport checks at the narrow floor, the panel-overlay threshold, and a real 1920×1080 canvas. 20 real Vitest specs across router/views/empty-state/settings-panel/density, all passing.

**Smoke page removed, not restyled (02.1.9):** the literal task said "restyle the smoke block using only tokens." Since Phase 02's whole point is building the *real* shell, keeping an artificial counter widget around felt like exactly the kind of thing the user's Phase 01 feedback ("I only see an odd/even counter, not a first version of an IPTV client") was pushing back on — so it was deleted outright. Its job (prove Spektrum's `setValue`/`computed`/`defineFn` work end to end) is now served by real product interactions instead: clicking a rail button, toggling settings, flipping density. All three were verified with the same rigor the smoke page got in Phase 01.

**Real framework findings from writing this phase (worth carrying forward):**
- **`data-if`/`:attr` support full JS expressions, `data-each` takes a dotted path only.** Fetched the real `docs/bindings.md` and `spektrum.js` source *before* writing bindings this time (Phase 01's `data-action` guess cost a debug cycle; this phase avoided repeating that for `data-if`, `:class`, `:aria-current`, and `data-each`).
- **`:aria-current` and other hyphenated `:attr` bindings route through `setAttribute`/`removeAttribute`, not a property write** (confirmed in `spektrum.js`: `PROP_ALIAS`/`isKebab` handling) — `null` correctly *removes* the attribute rather than setting it to the string `"null"`, which is exactly the right ARIA semantics and was verified, not assumed.
- **`bindDOM(root)` is idempotent per root identity and scans once.** Elements appended to an already-bound root are never picked up by a second `bindDOM()` call on the same root. This broke `settings-panel.spec.ts` on the first attempt; fixed by building all fixture elements before the single `bindDOM()` call, matching how the real app already does it (everything exists in `index.html` before the one bootstrap-time `bindDOM()`).
- **`data-each` must go on the *container*, not the repeated item** — the docs warn about this exact anti-pattern, and Feature 02.8.5's demo rows fell into it anyway on the first draft (`data-each` on the `<li>`). Caught by the real-browser test (`demoRowCount: 1` instead of 4), not by code review — a concrete argument for the real-browser verification discipline this phase (and Phase 01) insisted on.
- **`hashchange` fires asynchronously, and never fires for a same-value assignment.** `views.spec.ts` first hung indefinitely: `initRouter()`'s initial resolution uses `history.replaceState` (which never fires `hashchange`) to land on `#/sources`, so the test's first loop iteration — also `sources` — was a no-op assignment that never dispatched an event. Fixed by priming with a distinct dummy hash before the real test loop, and by awaiting the event explicitly rather than assuming synchronous dispatch.
- **`computed()` only re-derives on an actual dependency *change* (a delta), and `setValue(path, undefined)` doesn't count as one.** Traced through `applyEntry`/`deepMerge`/`isPath` in the real source: `isPath`'s change-detection explicitly requires `!== undefined` at every path segment, so a delta whose value *is* `undefined` is invisible to it — the value does land in `appState`, but nothing downstream re-runs. `resetState()` also doesn't regenerate a delta, so a computed's primed value is simply gone (not falsy-recomputed) after a reset until something real changes again. `null` doesn't have this problem. `empty-state.spec.ts` hit this directly and now documents it inline as the reason it uses `null`, not `undefined`, to simulate an absent value.

**Two deliberate, documented deviations from the phase's literal task wording:**
- **02.2.9/02.1.10**: implemented as a new `scripts/check-css.mjs` rather than "extending `scripts/check-dist.mjs`" — the latter validates *built* `dist/` output, this validates *authored* `src/` CSS; conflating the two concerns in one script seemed worse than a clearly-named sibling.
- **The verification line's literal grep** (`grep -ri "transition\|animation\|@keyframes" src/styles/ src/ui/` returning nothing) does **not** return empty — it matches the intentional `transition: none !important`/`animation: none !important` kill-switch itself, plus a handful of comments *documenting* the no-animation policy. `scripts/check-css.mjs` is the real, mechanical guard, and it correctly distinguishes "the policy is being enforced" from "the policy is being violated" (excludes the kill-switch pattern, catches everything else) — proven by an injected regression in Feature 02.2.9. The phase's own literal verification line didn't anticipate needing that kill-switch to exist at all; noted here rather than silently reworded.

**Known gaps, honestly flagged:**
- Firefox/Safari cross-browser verification (02.10.9) — this sandbox has no browser but headless Chromium.
- Genuine TV-couch-distance legibility (02.6.10/02.10.4) and full 100–200% browser-zoom testing (02.10.5) — both partially covered by proxy checks here (DPR scaling, token-based sizing, no-horizontal-scroll at 1920×1080), real hardware/browser validation deferred to Phase 30 where TV validation is already in scope.
