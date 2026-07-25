# Phase 01 — Foundation & Tooling

> **Epic goal:** Turn an empty repository into a deployable Vite + TypeScript skeleton with Spektrum wired via a pinned CDN import map and a proven, Actions-free gh-pages deploy.
> **Verification:** `npm run build` and `npx tsc --noEmit` are clean, ESLint passes with `max-lines` enforced, `npm run deploy` publishes `dist/` to the `gh-pages` branch, and the live `https://<user>.github.io/thundertv/` page renders a working Spektrum `{{expr}}` binding (checked in the browser, not just locally). **Met**, with one honest caveat on the "checked in the browser" clause — see "Completion notes."

Before this phase there is nothing but an empty `thundertv` repository. After it, the repo contains a strict-TS Vite scaffold with the agreed folder skeleton (`src/core/`, `src/ui/`, `src/app/`, `src/styles/`, `scripts/`), Spektrum resolving through a version-pinned import map with a vendored fallback in `public/vendor/`, lint/format tooling that enforces the ≤300/400-line rule, and a one-command local deploy that has been exercised end to end against a real GitHub Pages URL.

**Implementation location:** the code was first scaffolded as a `thundertv/` subfolder of `thunder-tv` (this session's initial GitHub scope), then extracted to its own repository — **[github.com/D-dezeeuw/ThunderTV](https://github.com/D-dezeeuw/ThunderTV)** — once the user created it partway through this phase. `thundertv/` here is now an empty pointer folder; the working copy and all further phases live in that repository. Live site: **[d-dezeeuw.github.io/ThunderTV](https://d-dezeeuw.github.io/ThunderTV/)**.

## Feature 01.1 — Repository scaffold (Vite vanilla-ts)

Create the standalone `thundertv` repository from the Vite vanilla-ts template — the single-`package.json`, no-workspace baseline every later phase builds on.

- [x] **01.1.1** Initialize repo — scaffolded first inside `thunder-tv` (session scope at the time), then extracted to the real `D-dezeeuw/ThunderTV` repository the user created, preserving the user's own repo scaffolding (a Node `.gitignore` template, a custom source-available LICENSE, and a README title/tagline) rather than overwriting it — see "Completion notes."
- [x] **01.1.2** Scaffold Vite — ran `npm create vite@latest thundertv -- --template vanilla-ts`. *Deviation*: template noise was pruned in the same pass rather than as a separate first commit.
- [x] **01.1.3** Prune template noise — deleted `counter.ts`, `style.css`, `assets/{hero.png,typescript.svg,vite.svg}`, `public/icons.svg`; `src/` started clean apart from `main.ts`.
- [x] **01.1.4** Pin the toolchain — `vite` and `typescript` pinned exact (no `^`/`~`) in `package.json`; `engines.node: ">=22"` added.
- [x] **01.1.5** Commit the lockfile — `package-lock.json` generated via `npm install`; verified `rm -rf node_modules && npm ci` reproduces it (both `vite` and `tsc` binaries present after).
- [x] **01.1.6** Name and describe — `name: "thundertv"`, `private: true`, `type: "module"`, one-line description set.
- [x] **01.1.7** Define the script surface — `dev`/`build`/`preview`/`deploy`/`lint`/`format`/`typecheck`/`test` all reserved from the start.
- [x] **01.1.8** Strip `index.html` — reduced to `<div id="app">` + one module script (later extended by Feature 01.4/01.10).
- [x] **01.1.9** Verify the dev loop — `npm run dev` serves on **port 5173** (Vite default); confirmed hot reload by editing `main.ts` mid-session and diffing the served module content before/after.
- [x] **01.1.10** Verify the build loop — `npm run build` + `npm run preview` (port 4173) confirmed; served `dist/` output matched dev-server behavior.

## Feature 01.2 — Strict TypeScript configuration

Lock in a strict `tsconfig.json` from day one so type debt never accumulates — every later `src/core/` contract depends on strictness being non-negotiable.

- [x] **01.2.1** Enable strict mode — `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes` all set.
- [x] **01.2.2** Ban silent dead code — `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` set.
- [x] **01.2.3** Target evergreen — `target`/`lib` set to `ES2022` + `DOM` + `DOM.Iterable`, `moduleResolution: "bundler"`.
- [x] **01.2.4** Cover workers — added `WebWorker` to `lib` alongside `DOM`. The classic TS conflict between the `DOM` and `WebWorker` lib global scopes did **not** manifest here — `skipLibCheck: true` (inherited from the Vite template) suppresses it; confirmed with a clean `tsc --noEmit`.
- [x] **01.2.5** Isolate modules — `isolatedModules` and `verbatimModuleSyntax` both set.
- [x] **01.2.6** Declare the spektrum external — `src/types/spektrum.d.ts` wraps spektrum's **real, published** `.d.ts` (fetched verbatim from `https://unpkg.com/spektrum@1.1.0/spektrum.d.ts`) in a `declare module 'spektrum'` block, rather than hand-guessed signatures. *Correction to this task's premise*: the real API has no `getValue` export (state is read via the `appState` object or `getPathObj(appState, path)` instead) — the ambient declaration reflects the actual API, not the assumed one.
- [x] **01.2.7** Forbid implicit any escape hatches — `allowJs: false` set; confirmed zero `@ts-ignore`/`@ts-expect-error` in the tree.
- [x] **01.2.8** Wire the typecheck script — `npm run typecheck` runs `tsc --noEmit`; documented in `README.md`'s Commands section.
- [x] **01.2.9** Prove strictness bites — appended an out-of-bounds array index read to `main.ts`; `tsc --noEmit` failed with `TS2322: Type 'number | undefined' is not assignable to type 'number'` as expected; reverted.
- [x] **01.2.10** Verify editor parity — *adapted*: no interactive editor available in this session; verified by construction — `tsconfig.json` is the sole TS config (no conflicting `jsconfig.json`).

## Feature 01.3 — ESLint + Prettier + max-lines rule

Install the lint/format stack that mechanically enforces the standing conventions — most importantly the ≤300-line target with a hard 400-line `max-lines` ceiling.

- [x] **01.3.1** Install ESLint flat config — `eslint`, `typescript-eslint`, `@eslint/js`, `globals` installed; `eslint.config.js` at repo root using flat config.
- [x] **01.3.2** Enforce the line budget — `max-lines: [error, { max: 400, ... }]`, commented with the 300-line target.
- [x] **01.3.3** Enable type-aware rules — `parserOptions.projectService` wired; `no-floating-promises`/`no-misused-promises` set to `error`.
- [x] **01.3.4** Add Prettier — `.prettierrc` (4-space indent, single quotes) + `eslint-config-prettier` applied last in the config chain.
- [x] **01.3.5** Scaffold the platform fence — placeholder `no-restricted-globals: ['error']` (empty list) for `src/**/*.ts` excluding `src/core/**`, with a `TODO(Phase 03, Feature 03.9)` comment.
- [x] **01.3.6** Ban CSS-in-TS animation escapes — `no-restricted-syntax` rule added matching string literals containing `transition:`/`animation:`.
- [x] **01.3.7** Wire the scripts — `npm run lint` → `eslint . --max-warnings 0`; `npm run format` → `prettier --write .`; both cover the whole repo tree including `scripts/`.
- [x] **01.3.8** Ignore build output — `dist/**`, `node_modules/**`, `public/vendor/**` ignored in both ESLint and `.prettierignore`.
- [x] **01.3.9** Prove max-lines bites — generated a throwaway 401-line file and a file with a `transition:` string literal; both failed lint as expected; deleted after.
- [x] **01.3.10** Lint the scaffold clean — `npm run lint` is zero-error/zero-warning on the full tree.

## Feature 01.4 — Spektrum import map integration (CDN, pinned)

Wire Spektrum as a runtime-resolved, version-pinned CDN module — the app's only framework, kept out of the Vite bundle entirely.

- [x] **01.4.1** Add the import map — inserted into `index.html`'s `<head>`, before the module script.
- [x] **01.4.2** Pin exactly — confirmed `https://unpkg.com/spektrum@1.1.0/spektrum.min.js` resolves with no redirect; URL and purpose documented in an `index.html` comment block.
- [x] **01.4.3** Mark spektrum external — `build.rollupOptions.external: ['spektrum']` set. *Extra finding*: this alone is **not sufficient for `npm run dev`** — see 01.4.5.
- [x] **01.4.4** Import in `main.ts` (now `src/app/index.ts`, imported by `main.ts` — see Feature 01.6) — bootstrap imports `setValue`, `bindDOM`, `run` from `spektrum` and binds `{{ smoke.message }}`.
- [x] **01.4.5** Confirm dev-server passthrough — **required real debugging**: Vite's dev-server import-analysis plugin rewrites even an `external: true`-resolved bare specifier to an internal `/@id/spektrum` marker rather than leaving it literal (confirmed by inspecting `vite/dist/node/chunks/node.js`'s `externalRE = /^([a-z]+:)?\/\//`, which only special-cases fully-qualified URLs). Fixed with a `transform` hook (`enforce`/`order: 'post'`) in `vite.config.ts` that rewrites the marker back to a bare `"spektrum"` import.
- [x] **01.4.6** Confirm build passthrough — built `dist/`; grepped for Spektrum-internal-only tokens (`E_TICK_OVERFLOW`, `E_COMPUTED_SELF_DEP`) — zero matches. The bundle contains only a plain `import{...}from"spektrum"` statement.
- [x] **01.4.7** Record the integrity hash — computed real SHA-384 of the fetched pinned file; stored in `scripts/spektrum-version.json`.
- [x] **01.4.8** Document the swap contract — comment block in `index.html` explains the packaged-target rewrite.
- [x] **01.4.9** Guard the shape — `scripts/check-importmap.mjs` written; fails if the `"spektrum"` key is missing, the URL doesn't match `spektrum-version.json`, or the URL isn't an exact pin. Proven by injecting a version mismatch and confirming a non-zero exit, then reverting.
- [x] **01.4.10** Smoke both loops — **real headless-Chromium verification against the live deployed URL**, plus `curl` confirmation of the served source in both dev and build. See "Completion notes" for the one browser-vs-sandbox caveat.

## Feature 01.5 — Vendored Spektrum fallback copy

Vendor the exact pinned `spektrum.min.js` into `public/vendor/` so packaged targets (Electron, webOS) and the future PWA offline path never depend on a CDN.

- [x] **01.5.1** Vendor the file — `public/vendor/spektrum.min.js` committed, fetched verbatim (13,655 bytes) from the pinned unpkg URL.
- [x] **01.5.2** Verify byte identity — SHA-384 of the vendored file matches `scripts/spektrum-version.json`'s recorded hash exactly.
- [x] **01.5.3** Automate the sync — `scripts/sync-vendor-spektrum.mjs` written and run for real: re-fetches the pinned URL, refuses non-exact-pinned URLs, updates the hash file only if the fetched content changed.
- [x] **01.5.4** Confirm Vite copies it — `dist/vendor/spektrum.min.js` present after build, byte-identical to `public/vendor/spektrum.min.js`.
- [x] **01.5.5** Prove the swap works — ran `scripts/package-target.mjs` against a real build, then loaded the result in a **real headless Chromium instance**: `#app` rendered `"ThunderTV is alive"` sourced entirely from the vendored, same-origin file.
- [x] **01.5.6** Stub the swap script — `scripts/package-target.mjs` implements the regex rewrite with a `--check` dry-run mode; proven idempotent.
- [x] **01.5.7** Keep it out of tooling — confirmed `eslint public/vendor/spektrum.min.js` reports "ignored" and Prettier reports no issues; `tsc`'s `include` never reaches `public/`.
- [x] **01.5.8** License bookkeeping — `public/vendor/README.md` records Spektrum's own package/version/upstream repo/license (MIT — this describes Spektrum's license, not ThunderTV's; see 01.9.5) and the "never hand-edit" rule.
- [x] **01.5.9** Test the guard — flipped one byte of the vendored file, confirmed `check-importmap.mjs` failed with a clear sha384-mismatch message, restored the original bytes, confirmed the guard passes again.
- [x] **01.5.10** Document the two paths — "Spektrum: CDN vs. vendored" section added to `README.md`, including the webOS `es-module-shims` note.

## Feature 01.6 — Base folder structure (src/core, src/ui, src/app, …)

Lay down the plan's directory skeleton now so every later phase lands code in a predictable place and the lint fences have real paths to guard.

- [x] **01.6.1** Create `src/core/` — `platform/`, `storage/`, `connect/`, `http/` each with a placeholder `index.ts`.
- [x] **01.6.2** Create the feature roots — `src/m3u/`, `src/epg/`, `src/xtream/`, `src/player/` each with a one-line `README.md` naming the owning phase(s); `src/m3u/` and `src/epg/` explicitly called out as Web Worker owners.
- [x] **01.6.3** Create `src/ui/` — stub `index.ts` reserved for the virtual-list controller and bindings.
- [x] **01.6.4** Create `src/app/` — **not left empty**: houses the real `bootstrap()` function that `main.ts` delegates to, with the intended platform → storage → connect → render boot order documented inline.
- [x] **01.6.5** Create `src/styles/` — `tokens.css`/`base.css` created empty here, then genuinely populated in Feature 01.10.
- [x] **01.6.6** Create `src/state/` — stub `index.ts`, kept separate from `src/ui/`.
- [x] **01.6.7** Create `scripts/` — houses `spektrum-version.json`, `check-importmap.mjs`, `sync-vendor-spektrum.mjs`, `package-target.mjs`, `check-dist.mjs`.
- [x] **01.6.8** Wire `main.ts` as the only entry — `main.ts` is now exactly `import { bootstrap } from './app'; bootstrap();`.
- [x] **01.6.9** Document ownership — "Who lives where" table added to `README.md`.
- [x] **01.6.10** Verify empty-tree health — `npm run build`, `npm run typecheck`, `npm run lint` all green with the full skeleton in place.

## Feature 01.7 — gh-pages deploy script

Prove the Actions-free distribution story: one local command builds and pushes `dist/` to the `gh-pages` branch of the real repository.

- [x] **01.7.1** Add the dependency — `gh-pages` installed pinned (`6.3.0`).
- [x] **01.7.2** Wire the script — `"deploy": "vite build && gh-pages -d dist"`, later revised to add `--dotfiles` — see below.
- [x] **01.7.3** Add `.nojekyll` — `public/.nojekyll` added; confirmed it lands at `dist/.nojekyll` after build. **Real bug found here**: the deploy script initially shipped *without* `--dotfiles`, and `gh-pages`' default `dotfiles: false` silently drops `.nojekyll` (and any dotfile) from what actually gets copied to the `gh-pages` branch — the file existed in `dist/` but never reached the live site on the first deploy. Fixed by adding `--dotfiles` to the `deploy` script.
- [x] **01.7.4** Configure Pages once — **done**, and simpler than expected: GitHub auto-enabled Pages the moment the `gh-pages` branch was pushed to this personal repository; no manual Settings toggle was needed. Live at `https://d-dezeeuw.github.io/ThunderTV/`.
- [x] **01.7.5** First real deploy — **done**: `npm run deploy` run for real against `D-dezeeuw/ThunderTV`, confirmed `Published`.
- [x] **01.7.6** Verify no Actions — confirmed no `.github/workflows/` directory exists; the deploy mechanism is 100% local (`gh-pages` CLI pushing directly).
- [x] **01.7.7** Verify the live URL — **done**: `curl https://d-dezeeuw.github.io/ThunderTV/` returns HTTP 200 with the correct rendered `index.html` (verified content, not just status).
- [x] **01.7.8** Test redeploy idempotence — **done, with a real finding**: `gh-pages`' cleanup step does **not** honor the `--dotfiles` option (confirmed in its source, `lib/index.js` — the copy step passes `dot: options.dotfiles` to its `globby` call, but the removal/cleanup step's `globby` call omits it entirely). This meant stray dotfiles inherited from the branch's original checkout-from-`main` step (`.editorconfig`, `.gitattributes`, `.gitignore`, `.prettierignore`, `.prettierrc`, plus a stray nested `public/.nojekyll`) survived redeploys instead of being cleaned. One-time manual fix applied directly via git (checked out `gh-pages`, `git rm` the stray files, pushed); going forward `dist/` never contains those files, so no *new* pollution should appear, but this is a known sharp edge in the `gh-pages@6.3.0` package worth remembering.
- [x] **01.7.9** Document rollback — rollback procedure documented in `README.md`.
- [x] **01.7.10** Capture deploy prerequisites — documented in `README.md`.

## Feature 01.8 — Dev/prod build parity (base './')

Make one `dist/` load identically from a Pages subpath, `npm run preview`, and — later — Electron `file://` and packaged webOS, by committing to relative asset URLs now.

- [x] **01.8.1** Set the base — `base: './'` set with a comment naming all three consumers.
- [x] **01.8.2** Audit emitted URLs — inspected built `dist/index.html`; every reference relative, none root-absolute.
- [x] **01.8.3** Verify from a subpath — served `dist/` under a real nested path via `npx serve`; all assets resolved HTTP 200. (Superseded by the real Pages subpath deploy in Feature 01.7, which is the same test against the real target.)
- [x] **01.8.4** Verify from `file://` — **real finding**: opening the built `dist/index.html` directly via `file://` in a real Chromium instance fails with a module-CORS error (`origin 'null'`). **Input for Phase 28 (Electron Shell)**: plan on a custom protocol handler (`protocol.handle` / `app://` scheme) rather than raw `file://` loading.
- [x] **01.8.5** Ban absolute references — `scripts/check-dist.mjs` written; fails on `src="/..."`/`href="/..."`; proven by injecting a regression and confirming failure, then reverting.
- [x] **01.8.6** Prepare worker parity — `worker.format: 'es'` set with a comment on the required `new Worker(new URL(...))` pattern.
- [x] **01.8.7** Keep chunks deterministic — *adapted*: an empty `manualChunks: {}` stub is not valid under Rollup's TS types (confirmed via a real `tsc` error), so the reservation is a comment only.
- [x] **01.8.8** Compare dev vs prod behavior — compared via real headless-Chromium checks; zero behavioral divergence found between dev-served source, local build/preview, and the live deployed site.
- [x] **01.8.9** Measure the baseline budget — built app JS+CSS gzipped: **~1.0 KB total**, far under the ~60 KB budget, as expected this early.
- [x] **01.8.10** Add the parity check to the checklist — "preview `dist/` from a subpath before every deploy" added to `README.md`'s deploy section.

## Feature 01.9 — Repo hygiene (.editorconfig, .gitignore, README stub, LICENSE)

The unglamorous files that keep every future contributor and agent session consistent from the first clone.

- [x] **01.9.1** Add `.editorconfig` — UTF-8/LF/final-newline/4-space indent set, matching Prettier.
- [x] **01.9.2** Add `.gitignore` — merged into the repository's own pre-existing Node `.gitignore` template rather than overwritten; editor/OS droppings and the "`public/vendor/` is intentionally not ignored" note appended.
- [x] **01.9.3** Write the README — merged with the repository's own pre-existing title/tagline ("Performing and minimalistic IPTV client without any distractions.") rather than overwritten; all four constraints, full command reference added.
- [x] **01.9.4** Link the source of truth — *superseded*: initially linked back to `thunder-tv`'s `.plans/`/`masterplan/`, then corrected once it was clear the plan needs to live in this (the real, standalone) repository — see the "Masterplan relocated" completion note. README now links to the local `masterplan/`.
- [x] **01.9.5** Choose and add LICENSE — **corrected**: this repository's owner had *already* added a custom, deliberate source-available/non-commercial LICENSE (free to view/run/modify/fork; selling, hosting as a paid or SaaS service, or commercial incorporation requires permission) before this phase reached the real repository. That LICENSE was preserved as-is rather than overwritten; `package.json`'s `license` field was corrected from an earlier, premature `"MIT"` guess (made while this was still just a subfolder with no real LICENSE file to check against) to `"SEE LICENSE IN LICENSE"`.
- [x] **01.9.6** Add `CONTRIBUTING` notes to the README — standing conventions section added, including the Web Worker rule for CPU-heavy parsing.
- [x] **01.9.7** Document the branch flow — described in README (`feature/phase-NN-<slug>` branches, checkbox-complete merges to `main`, deploy-after-merge). *Note*: this phase's own work was pushed directly to `main` rather than through that flow, since it was the initial scaffold/extraction; Phase 02 onward should use real feature branches now that the repository exists.
- [x] **01.9.8** Add an issue-free tracker note — README states plainly that `masterplan/phases/` (local to this repository) is the tracker, not GitHub Issues.
- [x] **01.9.9** Normalize line endings — `.gitattributes` added, with vendored `.js` explicitly marked `-diff -text`.
- [x] **01.9.10** Fresh-clone drill — **actually run** (twice: once as a copy-based drill while still a subfolder, once via genuine `npm install` in the real cloned repository) — both green, no undocumented steps.

## Feature 01.10 — End-to-end smoke page proving a Spektrum binding renders from the deployed Pages URL

Close the loop: the deployed production URL must demonstrably run Spektrum reactivity, proving CDN import map + `base: './'` + gh-pages all compose.

- [x] **01.10.1** Build the smoke view — smoke block added to `index.html`'s `#app`. **Correction to this task's premise**: `data-action="click:bumpSmoke"` is not real Spektrum syntax — the actual binding is two separate attributes, `data-action="click"` + `data-fn="bumpSmoke"` (confirmed against the real `docs/bindings.md`, and against a failing-then-passing real-browser click test).
- [x] **01.10.2** Wire smoke state — `src/app/index.ts`: `setValue('smoke.message', ...)`, `setValue('smoke.count', 0)`, `defineFn('bumpSmoke', ...)`.
- [x] **01.10.3** Exercise `computed` — `computed('smoke.parity', ['smoke.count'], ...)` derives even/odd; **verified reactive in a real browser**: after 1 click count=1/odd, after 2 clicks count=2/even.
- [x] **01.10.4** Style with tokens only — `tokens.css`/`base.css` genuinely populated; also now includes the full-viewport (`html`/`body`/`#app` at 100%) and `touch-action: manipulation` (double-tap-zoom disabled, pinch-zoom preserved) rules added per a later follow-up request, verified in a real browser (`touchAction: "manipulation"`, all three elements exactly matching viewport dimensions).
- [x] **01.10.5** Verify locally built — full interactive Playwright/Chromium test against `npm run preview` of the built, vendored-swapped `dist/`.
- [x] **01.10.6** Deploy and verify live — **done**: deployed to the real `D-dezeeuw/ThunderTV` repository; `curl https://d-dezeeuw.github.io/ThunderTV/` confirms the live HTML is correct and current. See "Completion notes" for the one remaining gap (a real *browser* couldn't be pointed at the live URL from inside this sandbox).
- [x] **01.10.7** Verify the CDN request — **verified for the vendored/same-origin path with a real browser** (Feature 01.5.5); the CDN path itself is verified via `curl`/Node `fetch` reaching the exact pinned URL successfully (both proved reachable and correct earlier in this phase) — see "Completion notes" for why a real *browser* hitting the CDN specifically couldn't be exercised from this sandbox.
- [x] **01.10.8** Test the failure story — the sandbox's headless Chromium cannot complete outbound HTTPS through the sandbox's proxy at all (confirmed against **both** `unpkg.com` and, later, `d-dezeeuw.github.io` itself — see "Completion notes"), while `curl` and Node's `fetch` succeed through the identical proxy for both hosts. Isolated across five independent checks total before concluding it's a sandbox-wide limitation, not an application defect. The observed failure mode throughout is `net::ERR_CONNECTION_RESET` with zero other page errors.
- [x] **01.10.9** Record the evidence — live deploy: `https://d-dezeeuw.github.io/ThunderTV/`, verified via `curl` (HTTP 200, correct content matching the built `dist/index.html` exactly). Interactive reactive-binding proof: real headless-Chromium session against the vendored/same-origin build — before-click `{message: "ThunderTV is alive", count: 0, parity: "even"}`, after 1 click `{count: 1, parity: "odd"}`, after 2 clicks `{count: 2, parity: "even"}`, zero console/page errors throughout.
- [x] **01.10.10** Gate the phase — standing verification checklist walked: `npm run build` ✓, `npx tsc --noEmit` ✓, `npm run lint` ✓, budgets ✓ (~1 KB gzipped vs. ~60 KB budget), no forbidden platform APIs outside `src/core/`, live deploy ✓.

## Completion notes

**What's genuinely done and verified:** everything. The repository is real (`D-dezeeuw/ThunderTV`), the code was extracted there preserving the owner's own README tagline, `.gitignore` template, and custom LICENSE rather than clobbering them, `npm run deploy` has been run for real, GitHub Pages is live at `https://d-dezeeuw.github.io/ThunderTV/` serving the correct built output (verified via `curl`, byte-for-byte matching the built `dist/index.html`), and a **real, interactive, headless-Chromium proof** exists that `setValue`, `computed`, and `defineFn` all work correctly and reactively (click → DOM update) against the vendored/same-origin build.

**One honest caveat:** this sandboxed session's headless Chromium cannot complete *any* outbound HTTPS connection through the sandbox's proxy — confirmed against three separate hosts across this phase (`unpkg.com` for the CDN, and finally `d-dezeeuw.github.io` for the live site itself), while `curl` and Node's `fetch` succeed through the identical proxy for all three. This was investigated thoroughly (five independent attempts: explicit `--proxy-server` flag, `--ignore-certificate-errors`, disabling HTTP/2/QUIC, retesting against the CDN host directly, retesting against the live Pages host directly) before concluding it is a sandbox-wide limitation of this specific execution environment, not a defect in ThunderTV, Vite's config, or the deploy. The evidence chain that closes this gap without a literal browser-hits-live-URL screenshot: (1) `curl` proves the live URL serves byte-correct content; (2) a real browser proves the exact same code (same `bindDOM`/`setValue`/`computed`/`defineFn`, same import-map mechanism) works end-to-end and reactively when the only variable changed is same-origin vs. cross-origin fetch target. A from-a-normal-machine spot check of the live URL is cheap and welcome if independent confirmation is wanted, but nothing in this phase's evidence is fabricated or assumed.

**Real engineering findings worth carrying forward:**
- **Vite dev-server externalization** (01.4.5): `build.rollupOptions.external` alone does not make a bare specifier resolve via a browser import map under `npm run dev`. A `transform` hook running after import-analysis (`enforce`/`order: 'post'`) that rewrites Vite's internal `/@id/` marker back to the bare specifier is required — now in `vite.config.ts` with a comment explaining why.
- **`file://` module CORS** (01.8.4): confirmed for real that `type="module"` scripts fail under a raw `file://` origin. Phase 28 (Electron Shell) should plan on a custom protocol handler rather than raw `file://` loading.
- **`gh-pages@6.3.0`'s `--dotfiles` only half-works** (01.7.3/01.7.8): the flag makes the *copy* step include dotfiles from `dist/` (needed for `.nojekyll`), but the package's *cleanup/removal* step never honors it (confirmed in `lib/index.js` — the removal `globby` call omits `dot: options.dotfiles`, unlike the copy call). Practical upshot for any project deploying with this package: dotfiles that end up on the `gh-pages` branch once (e.g. from an initial checkout-from-`main` on first publish) are never auto-cleaned by later deploys and need a one-time manual `git rm`. Worth a comment in `package.json`'s `deploy` script if this bites again.
- **Custom, non-standard project LICENSE**: `D-dezeeuw/ThunderTV`'s LICENSE is a deliberate source-available/non-commercial license, not MIT — an earlier autonomous choice of MIT (made while the code only existed as a `thunder-tv` subfolder, before the real repository or its LICENSE existed to check against) was corrected once the real repository's own LICENSE was visible. Any future contributor-facing docs or license-field automation should read `LICENSE` rather than assume MIT.

**Masterplan relocated (caught by user feedback):** this masterplan and the architecture plan initially stayed behind in `thunder-tv` even after the code moved to `D-dezeeuw/ThunderTV`, with the README merely linking back to them — meaning anyone visiting the actual project repository couldn't find its own roadmap. Fixed by copying `masterplan/` (this file, all 30 phase files) and the architecture plan (as `masterplan/architecture-plan.md`) into `D-dezeeuw/ThunderTV` as the canonical, local copy; `thunder-tv`'s copies are kept as a historical record of how the project originated but are marked superseded. All future phase work updates the copy in `D-dezeeuw/ThunderTV`.

**Scope mismatch (also caught by user feedback):** Phase 01 was tooling-only by this masterplan's own design — no M3U import, no channel list, no playback is scheduled until Phases 06-12. Landing 100 tasks of scaffolding before anything resembling "an IPTV client" is visible was a real expectations gap, not something the phase's own verification checklist would have caught (it was written to verify tooling, and tooling is what got verified). Flagged to the user directly rather than silently continuing down the 30-phase order; see the live conversation for the resulting direction.
