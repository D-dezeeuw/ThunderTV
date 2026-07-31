# Phase 03 — Platform Adapter Layer

> **Epic goal:** Put every platform-specific capability (HTTP, files, storage handles, capability flags) behind one `PlatformAdapter` interface injected once at bootstrap, so the later Electron and webOS targets are adapter swaps, not rewrites.
> **Verification:** The app boots exclusively through `createPlatform()`; `WebPlatform` is the only code touching `fetch` and file inputs; ESLint fails any `fetch`/`indexedDB`/`localStorage` reference outside `src/core/` (proven with a deliberate violation); `classifiedFetch` unit tests cover ok/http/timeout/cors-or-network; and the full adapter suite plus `FakePlatform` passes under `npm test`.
> **Status:** `shipped` · tracker: `current` — The adapter, capability flags and lint fences all still hold — `src/core/platform/README.md` is the live reference.

Before this phase the shell from Phase 02 runs with no network, file, or platform access at all. After it, `src/core/platform/` defines the `PlatformAdapter` contract from the plan (§4) — `storage`, `http`, `files`, `capabilities` — with a complete `WebPlatform` implementation: an `HttpAdapter` with timeout/abort and CORS-classified failures (MASTERPLAN.md §5.2), proxy URL template support, a `FileAdapter` over `input[type=file]`, and the `window.electron` detection bootstrap. ESLint fences make the adapter boundary mechanical, and a `FakePlatform` gives every downstream phase a deterministic test double. The `storage` slot is typed against the `StorageAdapter` interface but bound to a temporary in-memory stub until Phase 04 delivers the tiers.

## Feature 03.1 — PlatformAdapter interface definition

Define the one interface that decouples the entire app from its host platform — the single most important architectural idea ported from thunder-tv's `DataService` factory pattern.

- [x] **03.1.1** Create the contract — `src/core/platform/platform-adapter.ts` declares `PlatformAdapter { name; storage; http; files; capabilities }` (adds `name` beyond the literal plan snippet — see Completion notes).
- [x] **03.1.2** Forward-declare `StorageAdapter` — `src/core/storage/storage-adapter.ts` (types only): `get/set/delete/clear`, explicitly documented as a Phase 04 placeholder shape.
- [x] **03.1.3** Declare `HttpAdapter` — `get`/`getText`/`getJson` with `{ headers?, timeoutMs?, signal?, noProxy?, maxBytes? }` options, in `src/core/http/http-adapter.ts`.
- [x] **03.1.4** Declare `FileAdapter` — `pickFile(accept): Promise<PickedFile | null>` and `readText(file): Promise<ReadTextResult>` (a classified result, not a bare `string` — see 03.7.3) in `src/core/platform/file-adapter.ts`.
- [x] **03.1.5** Document the injection rule — TSDoc on `PlatformAdapter` states construction happens once in `main.ts`/`setPlatform()`, no direct construction elsewhere.
- [x] **03.1.6** Export the accessor — `src/core/platform/index.ts`: `setPlatform`/`getPlatform` (throws before init, throws on double-init) plus a test-only `resetPlatformForTests`.
- [x] **03.1.7** Keep the surface honest — no Electron-only methods added; extension is capability flags only.
- [x] **03.1.8** Type-only barrel — `platform-adapter.ts` has zero runtime code, interfaces/types only.
- [x] **03.1.9** Unit-test the accessor — `src/core/platform/index.spec.ts` (3 tests): throws before set, same instance after, throws on double-init.
- [x] **03.1.10** Document the pattern — `src/core/platform/README.md` maps this to thunder-tv's `DataFactory()` and names the Phase 28 `ElectronPlatform`.

## Feature 03.2 — Capability flags model (corsUnrestricted, externalPlayers, durableStorage)

Capabilities are declared data, not scattered `if (isElectron)` checks — UX decisions (CORS warnings, player options, storage notices) all read from one flags object.

- [x] **03.2.1** Define the type — `Capabilities` in `src/core/platform/capabilities.ts`, matching the plan §4 fields verbatim.
- [x] **03.2.2** Fix web values — `createWebCapabilities()` hardcodes `corsUnrestricted: false`, `externalPlayers: false`.
- [x] **03.2.3** Stub durable storage honestly — `createWebPlatform()` calls `createWebCapabilities('none')` until Phase 04.
- [x] **03.2.4** Make flags readonly — `Capabilities` fields are `readonly`; `createWebCapabilities`/`createFakePlatform` return `Object.freeze()`d objects (compile-time **and** runtime enforcement — see the `capabilities.spec.ts` mutation-throws test).
- [x] **03.2.5** Mirror into state — `bootstrap()` sets `platform.capabilities` (and `platform.name`) via `setValue` right after `setPlatform()`.
- [x] **03.2.6** Ban direct environment sniffing — `window.electron` is ESLint-fenced outside `src/core/` (see Completion notes for the exact scope chosen vs. the literal task wording).
- [x] **03.2.7** Define consumer guidance — documented in `capabilities.ts` TSDoc and `src/core/platform/README.md`.
- [x] **03.2.8** Future-proof deliberately — `capabilities.ts` TSDoc states new fields get safe-false/`'none'` defaults, never widen existing ones.
- [x] **03.2.9** Unit-test immutability — `capabilities.spec.ts`: `Object.isFrozen` is true, a `@ts-expect-error`-guarded mutation attempt throws `TypeError` at runtime (strict-mode frozen-object write).
- [x] **03.2.10** Wire a visible proof — `index.html`'s first-run card shows `data-testid="cors-hint"` only when `!platform.capabilities.corsUnrestricted`; verified rendering the real string in a live browser check (see Verification below).

## Feature 03.3 — WebPlatform implementation

The default (and for now only) concrete platform: browser `fetch`, DOM file inputs, and probe-driven capabilities, assembled behind the interface.

- [x] **03.3.1** Implement the class — `src/core/platform/web-platform.ts`'s `createWebPlatform()` composes `WebHttpAdapter`, `WebFileAdapter`, the storage stub, and web capabilities.
- [x] **03.3.2** Construct via factory — `createWebPlatform()` returns a `Promise<PlatformAdapter>` (not a real `await` yet — see Completion notes for why it isn't literally declared `async`).
- [x] **03.3.3** Keep it thin — every new file in `src/core/` is well under 100 lines; no file approaches the 300-line target.
- [x] **03.3.4** Bootstrap in `main.ts` — `bootstrap()` awaits `createPlatform()`/`setPlatform()` before any other state seeding, router init, or `run()`.
- [x] **03.3.5** Fail loudly, boot anyway — deliberately **not** implemented as a catch-and-degrade branch; see Completion notes (dead-code reasoning).
- [x] **03.3.6** No side effects at import — `web-platform.ts` only defines functions/closures at module scope; `web-platform.spec.ts`'s "constructing twice" test proves no shared state leaks between calls.
- [x] **03.3.7** Expose nothing extra — only `createWebPlatform` is exported; `WebHttpAdapter`/`WebFileAdapter` are imported directly by it, not re-exported from this module.
- [x] **03.3.8** Wire smoke usage — no direct `fetch` exists anywhere outside `src/core/http/classified-fetch.ts` (swept via 03.9.9); the `fake-platform.spec.ts` downstream example (03.10.8) demonstrates the `getPlatform().http` usage pattern for future import code.
- [x] **03.3.9** Integration-test assembly — `web-platform.spec.ts` (5 tests): all four slots exist, capabilities are web-correct, two calls don't share instances, storage stub round-trips a value.
- [x] **03.3.10** Record bundle impact — see Verification: the JS bundle grew from 4.20 kB (1.89 kB gzip, end of Phase 02) to 10.11 kB (4.36 kB gzip) — a **+2.47 kB gzip** contribution for the entire platform/http adapter layer, zero third-party dependencies added (`package.json` `dependencies`/`devDependencies` unchanged). Total app is 3.71 kB (HTML) + 1.60 kB (CSS) + 4.36 kB (JS) gzip ≈ **9.7 kB gzip**, well inside the ≤60 KB budget.

## Feature 03.4 — HttpAdapter with timeout and abort

All network I/O flows through one adapter with a default timeout, caller aborts, and consistent header handling — the base `classifiedFetch` builds on.

- [x] **03.4.1** Implement `WebHttpAdapter` — `src/core/http/web-http-adapter.ts` delegates to `classifiedFetch`, which owns the 15 s default `AbortSignal.timeout`.
- [x] **03.4.2** Support caller aborts — `combineSignals()` in `classified-fetch.ts` uses `AbortSignal.any` when available, with a manual `AbortController`-based fallback (both paths unit-tested).
- [x] **03.4.3** Type the responses — `get()` returns the full classified union; `getText`/`getJson` resolve `null` on any classified failure, never throw.
- [x] **03.4.4** Pass conditional headers through — caller headers (incl. `If-None-Match`/`If-Modified-Since`) pass straight through; `status: 304` surfaces distinctly inside the `http` kind.
- [x] **03.4.5** Expose response headers — `ok` results carry `etag`/`lastModified` read from the real `Response` headers.
- [x] **03.4.6** Never log URLs raw — no adapter code logs anything; `classified-fetch.spec.ts`'s "never logs the raw URL" spec spies on `console.error`/`console.warn` across a failing request and asserts neither call's arguments contain the URL.
- [x] **03.4.7** Cap response size defensively — `maxBytes`: a `Content-Length` over the limit fails immediately (`too-large`, body cancelled unread); a chunked response without `Content-Length` is capped lazily via a byte-counting `TransformStream` once the caller reads the body (documented trade-off — see Completion notes).
- [x] **03.4.8** Keep binary open — `ok` results carry the live `Response` (or its `maxBytes`-wrapped stream), never pre-read.
- [x] **03.4.9** Unit-test timeout and abort — `web-http-adapter.spec.ts`: a 20 ms configured timeout resolves `{ kind: 'timeout' }`; a caller abort rejects instead of waiting for a 60 s timeout.
- [x] **03.4.10** Unit-test conditional flow — both `classified-fetch.spec.ts` and `web-http-adapter.spec.ts` assert a 304 response yields `{ kind: 'http', status: 304 }` without a body read (spied `res.text`/`getText()` never called) — folding 304 into `http` rather than a dedicated kind, per the task's own "or the dedicated variant chosen" allowance.

## Feature 03.5 — CORS/network failure classification (classifiedFetch from MASTERPLAN.md §5.2)

A CORS block, DNS failure, and offline all look identical to `fetch`; classification turns that opaque `TypeError` into specific, honest UX — the linchpin of the plan's designed-in CORS story (§8).

- [x] **03.5.1** Port the reference — `src/core/http/classified-fetch.ts`'s `classifiedFetch` implements the full result union: `ok`, `http`, `timeout`, `cors-or-network`, plus `mixed-content` and `too-large` (03.5.4/03.4.7).
- [x] **03.5.2** Compute `crossOrigin` — `safeCrossOrigin()` implements exactly the plan's origin comparison, guarded against a throwing `new URL()`.
- [x] **03.5.3** Fold in `navigator.onLine` — `offlineHint` is set from `!navigator.onLine` on every `cors-or-network` result; unit-tested.
- [x] **03.5.4** Detect mixed content early — `mixedContentBlocked()` (ported verbatim) runs before any `fetch` call; `mixed-content` unit-tested to never invoke the mocked `fetch`.
- [x] **03.5.5** Type the union exhaustively — `FetchFailure`/`ClassifiedFetchResult`/`FetchFailureKind` exported; `FakeHttpAdapter`'s `buildScriptedFailure` switches over `FetchFailureKind` with no `default`, so TypeScript itself enforces exhaustiveness (a new kind fails to compile until every switch handles it).
- [x] **03.5.6** Map kinds to strings — `strings.http.failure.*` in `src/app/strings.ts` (http/timeout/corsOrNetwork/offline/mixedContent/tooLarge) plus `strings.http.proxy.*`.
- [x] **03.5.7** Integrate with the adapter — `WebHttpAdapter.get` delegates to `classifiedFetch`; direct `fetch` is lint-banned everywhere outside `src/core/`.
- [x] **03.5.8** Unit-test each kind — `classified-fetch.spec.ts` covers all six kinds (ok/http/304/timeout/cors-or-network×2/mixed-content/too-large) with a mocked global `fetch`.
- [x] **03.5.9** Cover URL edge cases — specs for an invalid string, a relative path, and a URL with a port + query string; none throw.
- [x] **03.5.10** Document the UX contract — `src/core/http/README.md`'s failure-kind table names each kind's intended surface (Phase 07/14/23).

## Feature 03.6 — Proxy URL template support ({url} substitution)

The optional user-configured proxy (`https://my-proxy/{url}`) is applied inside the http adapter so playlist, EPG, and Xtream calls get it uniformly — empty by default, no public proxy shipped.

- [x] **03.6.1** Implement the template — `applyProxy()` in `src/core/http/proxy.ts` substitutes the `encodeURIComponent`-ed URL into `{url}`, or appends it when the placeholder is absent.
- [x] **03.6.2** Validate the template — `isValidProxyTemplate()` accepts `https://` or `http://localhost`/`http://127.0.0.1`, rejects everything else including unparseable strings; the save-time error string (`strings.http.proxy.invalidTemplate`) exists (wiring the Settings save flow itself is Phase 22's job).
- [x] **03.6.3** Wire into the adapter — `WebHttpAdapter` takes an optional `getProxyTemplate` constructor getter (defaults to "no proxy"); `createWebPlatform()` deliberately passes none yet (see Completion notes).
- [x] **03.6.4** Classify through the proxy — `WebHttpAdapter.get` stamps `viaProxy: true` onto any failure result once the request actually went through a proxy; unit-tested both ways (proxy configured vs. not).
- [x] **03.6.5** Skip same-origin — `applyProxy` never rewrites a same-origin URL; unit-tested.
- [x] **03.6.6** Keep credentials off the proxy log trail — `proxy.ts` TSDoc states the exposure explicitly; `strings.http.proxy.credentialWarning` carries the exact warning copy for Phase 22 to surface.
- [x] **03.6.7** Expose a bypass flag — `HttpRequestOptions.noProxy`; unit-tested.
- [x] **03.6.8** Media caveat noted — recorded in `proxy.ts` TSDoc and `src/core/http/README.md`.
- [x] **03.6.9** Unit-test substitution — `proxy.spec.ts`: substitution, round-trip decode, no-placeholder append, no-template no-op, same-origin skip, template validation (valid/local/rejected/unparseable).
- [x] **03.6.10** Integration-test through the adapter — `web-http-adapter.spec.ts` asserts the exact proxied URL `fetch` receives, the raw URL when no template is set, and the `noProxy` bypass.

## Feature 03.7 — FileAdapter over input[type=file]

File upload is a first-class, always-working import path on the web (no CORS); the adapter wraps the DOM input dance so callers get a clean promise API.

- [x] **03.7.1** Implement `WebFileAdapter` — `src/core/platform/web-file-adapter.ts`: detached, off-screen `<input type="file">`, `change`/`cancel` wiring, resolves `{ name, size, file } | null`.
- [x] **03.7.2** Handle cancel correctly — a real `cancel` event resolves `null`; a window-`focus`-based fallback (300 ms grace) also resolves `null` for engines lacking `cancel`.
- [x] **03.7.3** Read as text — `readText()` returns a classified `ReadTextResult` (`{ kind: 'ok', text }` or `{ kind: 'too-large', sizeBytes, limitBytes }`), never throws past the ~150 MB threshold.
- [x] **03.7.4** Accept the right types — `M3U_ACCEPT`/`XMLTV_ACCEPT` constants exported for Phase 07/16.
- [x] **03.7.5** Keep bytes available — `PickedFile.file` carries the real `File`.
- [x] **03.7.6** Clean up after use — the input is removed from the DOM and both listeners detached in every `settle()` path; verified programmatically (post-resolution DOM query finds no leftover `input[type=file]`) rather than a manual DevTools heap snapshot (see Completion notes).
- [x] **03.7.7** Respect user activation — TSDoc documents the requirement; `warnIfNoUserGesture()` emits a dev-mode `console.warn` (best-effort, can't be a hard guard per spec).
- [x] **03.7.8** Fence the DOM API — `no-restricted-syntax` flags any `document.createElement('input')` outside `src/core/**`; proven live (see Verification).
- [x] **03.7.9** Unit-test with jsdom — `web-file-adapter.spec.ts`: resolve-on-change, null-on-cancel, DOM cleanup, accept-attribute wiring, `readText` round-trip, `readText` too-large classification.
- [x] **03.7.10** Manual smoke — the first-run card's file button is wired to the real `pickFile()` (not disabled); verified in a live headless-browser run picking a real `.m3u` file and rendering its name/size (see Verification) — `TODO(phase-07)` comments mark the wiring for removal.

## Feature 03.8 — Platform detection bootstrap (window.electron check)

One detection function, identical in spirit to thunder-tv's `DataFactory()`: `window.electron` truthy selects the Electron adapter, everything else gets `WebPlatform` — decided once, at boot.

- [x] **03.8.1** Implement `createPlatform()` — `src/core/platform/create-platform.ts`: `window.electron` truthy throws a "not yet implemented (Phase 28)" error; otherwise returns `createWebPlatform()`.
- [x] **03.8.2** Type the global — `src/types/platform.d.ts` declares `Window['electron']?: unknown`.
- [x] **03.8.3** Call it first — `bootstrap()` awaits `createPlatform()`/`setPlatform()` before every other seed/register call, `initRouter()`, `bindDOM()`, and `run()`.
- [x] **03.8.4** Note the webOS story — documented in `create-platform.ts` TSDoc: no `isWebOS` branch exists or should be added.
- [x] **03.8.5** Guard against late injection — detection reads `window.electron` exactly once per `createPlatform()` call (once per boot in real usage); documented in TSDoc.
- [x] **03.8.6** Surface the platform in state — `platform.name` mirrored into Spektrum state from `PlatformAdapter.name` (not a second `window.electron` read — see Completion notes on why `name` was added to the interface).
- [x] **03.8.7** Keep `main.ts` tiny — `main.ts` is a 3-line call-through; all sequencing lives in `src/app/index.ts`'s `bootstrap()` (39 lines).
- [x] **03.8.8** Unit-test both branches — `create-platform.spec.ts`: absent `window.electron` resolves `{ name: 'web' }`; truthy `window.electron` rejects with a message matching `/Phase 28/`.
- [x] **03.8.9** Verify on the built output — confirmed via a live headless-browser run against the built `dist/` (see Verification): boots fully, `platform.capabilities`/`platform.name` populate Spektrum state correctly, zero console errors.
- [x] **03.8.10** Document the swap-cost claim — `src/core/platform/README.md` states the Phase 28 swap cost and points at `FakePlatform` as the mechanism keeping it testable.

## Feature 03.9 — ESLint fences (no-restricted-globals outside src/core/)

Make the adapter boundary mechanical: outside `src/core/`, referencing `fetch`, `indexedDB`, or `localStorage` is a lint error, not a review comment.

- [x] **03.9.1** Fill the Phase 01 placeholder — real `no-restricted-globals` entries for `fetch`, `indexedDB`, `localStorage` (each with a message pointing at `getPlatform()`).
- [x] **03.9.2** Carve out `src/core/` — one `ignores: ['src/core/**']` block; no worker-specific carve-out added yet since no worker file exists to reference `fetch` (Phase 06/16 territory — revisit then if a worker genuinely needs a `fetch`-in-worker exemption).
- [x] **03.9.3** Fence property access too — `no-restricted-properties` for `window.fetch`, `globalThis.fetch`, `window.localStorage`, `window.indexedDB`, `navigator.storage`.
- [x] **03.9.4** Fence `sessionStorage` — global + `window.sessionStorage` property both banned.
- [x] **03.9.5** Fence `XMLHttpRequest` and `WebSocket` — both added to `no-restricted-globals`.
- [x] **03.9.6** Keep tests honest — a `**/*.spec.ts` (outside `src/core/`) override re-permits the bare `fetch` global/`window.fetch`/`globalThis.fetch` for stubbing (e.g. asserting "no real network call happens"); every other fenced API stays banned in specs too.
- [x] **03.9.7** Prove the fence — a temporary `fetch('x')` + `document.createElement('input')` + `window.localStorage.getItem('x')` added to `src/ui/density.ts`; `npm run lint` failed with all three custom messages (`no-restricted-globals`, `no-restricted-syntax`, `no-restricted-properties`); reverted immediately after (see Verification for the captured output).
- [x] **03.9.8** Prove the carve-out — confirmed the file that actually calls `fetch()` (`src/core/http/classified-fetch.ts` — see Completion notes on the literal `web-http-adapter.ts` naming) lints clean; the full `npm run lint` pass across the whole repo is that proof in aggregate.
- [x] **03.9.9** Sweep the existing tree — `npm run lint` is clean repo-wide; no stragglers found (Phase 01/02 code never touched these APIs directly).
- [x] **03.9.10** Document the policy — README's "Standing conventions" section extended with the full fenced-API list and the `FakePlatform` testing rule.

## Feature 03.10 — Adapter unit tests plus a FakePlatform for downstream tests

A deterministic `FakePlatform` (scripted HTTP, in-memory files, memory storage) is this phase's product for every later phase's tests — plus the consolidated adapter suite proving the layer itself.

- [x] **03.10.1** Implement `FakePlatform` — `src/core/platform/fake-platform.ts`: `FakeHttpAdapter` (scriptable `onGet(url).reply(...)`), `FakeFileAdapter` (seeded in-memory files), `MemoryStorage`, `createFakePlatform(capabilityOverrides)`.
- [x] **03.10.2** Script failures too — every `FetchFailureKind` is scriptable (`http`/`timeout`/`cors-or-network`/`mixed-content`/`too-large`), each with overridable detail fields.
- [x] **03.10.3** Record interactions — `FakeHttpAdapter.calls`, `FakeFileAdapter.picks`; both expose `reset()`.
- [x] **03.10.4** Keep it out of the bundle — `scripts/check-dist.mjs` now greps every built JS asset for five `FakePlatform` symbol names and fails the build if found; run clean against a real build (see Verification).
- [x] **03.10.5** Provide a harness helper — `withFakePlatform(capabilityOverrides, fn)` installs, runs, and restores via `resetPlatformForTests()` in a `finally`.
- [x] **03.10.6** Consolidate the adapter suite — `npx vitest run` covers all of Features 03.1–03.9's specs in one pass: 14 files, 86 tests.
- [x] **03.10.7** Contract-test the fake — `fake-platform.spec.ts`'s "contract parity" describe block asserts `FakeHttpAdapter`'s `ok`/304 result shapes match what `classifiedFetch`/`WebHttpAdapter` actually produce.
- [x] **03.10.8** Seed one downstream example — `hypotheticalImportCall()` in `fake-platform.spec.ts`: scripts a `cors-or-network` reply, calls through `getPlatform().http.get()`, and asserts the classified value lands in Spektrum state via `setValue`/`tick`/`appState`.
- [x] **03.10.9** Document usage — `src/core/platform/README.md`'s "Testing against FakePlatform" section with the exact recipe.
- [x] **03.10.10** Gate the phase — see Verification below for the full local gate; the live-Pages-URL smoke happens immediately after this merge (README's deploy rule requires deploying from a clean, merged `main`, never a feature branch) and is recorded in a short follow-up note once done.

## Completion notes

**Real findings from building this phase:**

- **jsdom/Node realm mismatch for `DOMException`.** `AbortController.abort()`/`AbortSignal.timeout()` in this Vitest+jsdom setup construct errors via **Node's** internal `DOMException`, while a test file's global `DOMException` (referenced e.g. via `new DOMException(...)`) is **jsdom's own**, separate class. `e instanceof DOMException` is `false` across that split even though `.name` is identical on both sides. Fixed by duck-typing on `.name` (`hasName()` in `classified-fetch.ts`) instead of `instanceof` — exactly as correct in production, where only one realm exists.
- **`Response` rejects a non-null body on a null-body status.** `new Response('', { status: 304 })` throws `TypeError: Invalid response status code 304` per the Fetch spec (304/204/205 are null-body statuses). Test fixtures now pass `null` as the body for these.
- **`exactOptionalPropertyTypes: true` needs real discipline at DOM-lib boundaries.** Building an object literal like `{ headers: maybeUndefined }` against a target whose `headers?: HeadersInit` doesn't itself say `| undefined` fails to compile even though the key is optional — the flag distinguishes "key absent" from "key present with value `undefined`". Fixed via conditional spread (`...(x !== undefined ? { x } : {})`) at every boundary into `fetch()`/`Response`/`FileList`, and by redeclaring our own interfaces' optional fields as `field?: T | undefined` so our own adapter-to-adapter calls don't need the same dance.
- **ESLint flat config doesn't merge rule values across matching blocks — the last matching block wins outright.** Adding a new `no-restricted-syntax` array for `src/**` (minus `src/core/**`) would have silently dropped the pre-existing global transition/animation ban for every file in that scope, since flat config replaces (not merges) a rule's array value per matching file. Fixed by extracting the transition selector into a shared `const` and re-including it in every block that also sets `no-restricted-syntax`.
- **`@typescript-eslint/require-await`/`no-unassigned-vars` caught two premature-abstraction smells.** An initial `web-platform.ts` draft declared a `let proxyTemplate` placeholder variable that nothing ever assigned (dead code) and marked `createWebPlatform` `async` with no real `await` inside. Both were simplified away rather than suppressed — `WebHttpAdapter` already defaults to "no proxy" without needing a dead getter, and the factory returns a `Promise` directly today (Phase 04 adds the real `await`).

**Deliberate deviations from the literal task wording (all functionally equivalent or intentionally narrower in scope, reasoned in code comments at each site):**

- **03.1.1 / 03.8.6**: `PlatformAdapter` gained a `name: 'web' | 'electron'` field beyond the plan's literal four-field snippet, so `platform.name` can be mirrored into state without a second `window.electron` read outside `src/core/platform/` (which 03.2.6's own fence would otherwise forbid).
- **03.2.6**: the `window.electron` fence uses the same `src/core/**` exemption as every other fenced API, rather than a narrower `src/core/platform/**`-only exemption. `src/core/http/` and `src/core/storage/` have no legitimate reason to sniff `window.electron` either, so the uniform boundary is simpler to reason about without a real gap in practice.
- **03.3.2 / 03.3.5**: `createWebPlatform()` is not literally declared `async` (it returns `Promise.resolve(...)` directly) to avoid `@typescript-eslint/require-await` firing on a function with nothing to `await` yet; and no catch-and-degrade branch was added around `WebHttpAdapter`/`WebFileAdapter` construction, since their constructors only assign fields and cannot throw for any input — guarding an unreachable path would be dead defensive code.
- **03.4.10**: 304 is folded into the general `http` kind (`{ kind: 'http', status: 304 }`) rather than a dedicated variant, per the task's own "(or the dedicated variant chosen)" allowance — the `status` field already disambiguates it for the Phase 15 conditional-refresh consumer.
- **03.6.3**: `createWebPlatform()` deliberately constructs `WebHttpAdapter` with **no** `getProxyTemplate` getter — passing one that only ever returns `undefined` (nothing sets a template until Phase 22) would itself be dead code; the adapter's own default already means "no proxy".
- **03.7.6**: DOM cleanup is verified by asserting no `input[type=file]` remains in the DOM after resolution (a real, automated Vitest assertion) rather than a manual DevTools heap snapshot, which isn't reproducible/automatable in this environment.
- **03.9.2**: no worker-specific `fetch` carve-out was added — `src/m3u/` and `src/epg/` are still README-only placeholders (Phase 06/16 own them), so there is no worker file today that would need one.
- **03.9.8**: the literal call site of `fetch()` lives in `classified-fetch.ts`, not `web-http-adapter.ts` (which only delegates to it) — both live in the same exempted `src/core/http/` folder, so the carve-out's precision is proven either way; noted here for accuracy against the task's exact file name.

**Known gaps, honestly flagged:**

- The Electron branch of `createPlatform()` is a designed stub (throws "Phase 28"), not a real implementation — exactly as scoped.
- 03.10.10's live-Pages-URL smoke happens right after this merge (deploy must run from a clean `main` per the README's own deploy rule, never from a feature branch) — recorded as a short follow-up once done, not fabricated here.
- The sandbox's headless Chromium cannot reach the pinned CDN URL for Spektrum directly (`net::ERR_CONNECTION_RESET` through the proxy, a previously-documented limitation) — every live-browser check below therefore ran against a build with `scripts/package-target.mjs`'s vendored-Spektrum swap applied locally to `dist/` only (never committed; `index.html`'s source still points at the CDN as required for the real deploy).

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (0 errors, 0 warnings) across the whole repo.
- `npm run lint:css` — clean (3 CSS files, no hex/transition regressions).
- `npx vitest run` — **14 test files, 86 tests, all passing** (index/capabilities/web-platform/classified-fetch/proxy/web-http-adapter/web-file-adapter/create-platform/fake-platform specs, plus the 5 Phase 02 spec files unaffected).
- `npm run build` — clean; `dist/assets/index-*.js` 10.11 kB raw / 4.36 kB gzip (see 03.3.10 for the full budget accounting).
- `node scripts/check-dist.mjs` — clean: no root-absolute references, no `FakePlatform` symbols in the built bundle.
- **Fence proof (03.9.7)**: a temporary `fetch('x')`/`document.createElement('input')`/`window.localStorage.getItem('x')` block added to `src/ui/density.ts` produced exactly three `npm run lint` errors, one per fence, each with its custom message pointing at `getPlatform()`/`WebFileAdapter`; reverted immediately, `npm run lint` clean again afterward.
- **Live browser verification** (headless Chromium against a built `dist/` with the vendored-Spektrum swap applied locally, per the sandbox caveat above):
    - Zero console errors/page errors across every check below.
    - The Sources first-run card's CORS hint (`data-testid="cors-hint"`) renders the real `strings.emptyStates.firstRun.corsHint` text.
    - The "Upload M3U file" button is enabled (not `disabled`) and wired to the real `WebFileAdapter.pickFile()`: using Playwright's real file-chooser interception, picking an actual temporary `.m3u` file rendered `"Picked: sample.m3u (65 bytes)"` in `data-testid="picked-file-note"`.
    - Every Phase 02 shell behavior (rail navigation across all four routes, settings panel open/Esc-close, density toggle) still works with the new async `bootstrap()` — no regression from making bootstrap `await createPlatform()` before rendering.

Docs updated: this file, `src/core/platform/README.md` (new), `src/core/http/README.md` (new), and `README.md` (commands table's stale "wired in Phase 27" `test` script note fixed, standing-conventions bullet expanded to the full fenced-API list, `src/app/` row in "Who lives where" updated — the last two were stale from before this phase and are fixed here per the "fix stale docs you notice" rule).

Tests added: 9 new spec files (`index.spec.ts`, `capabilities.spec.ts`, `web-platform.spec.ts`, `classified-fetch.spec.ts`, `proxy.spec.ts`, `web-http-adapter.spec.ts`, `web-file-adapter.spec.ts`, `create-platform.spec.ts`, `fake-platform.spec.ts`), 66 new test cases, all passing alongside the 20 pre-existing Phase 02 tests (86 total).

## Post-merge deploy follow-up (03.10.10)

Deployed from a clean, merged `main` per the README's deploy rule (`npm run deploy`; published `dist/` to `gh-pages`). The sandbox's headless Chromium cannot complete outbound HTTPS to `github.io` either (the same `net::ERR_CONNECTION_RESET` proxy limitation as the CDN check above — a real browser is unaffected), so the live site was verified structurally instead:

- `curl https://d-dezeeuw.github.io/ThunderTV/` → `200`, response body byte-for-byte the same size as the local build's `dist/index.html` (19,903 bytes).
- The served HTML carries the real Phase 03 markup: `data-fn="pickM3uFile"` and `strings.emptyStates.firstRun.corsHint` binding both present (1 match each), plus every `data-testid` from this phase and Phase 02 (`cors-hint`, `picked-file-note`, `empty-first-run`, all four `view-*` testids).
- The import map still points at the pinned CDN URL (`https://unpkg.com/spektrum@1.1.0/spektrum.min.js`) — confirmed the deploy did **not** pick up the local vendored-Spektrum swap used for sandbox testing (that swap only ever touched a local, gitignored `dist/`, never the committed source).
