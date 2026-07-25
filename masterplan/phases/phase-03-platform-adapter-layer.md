# Phase 03 — Platform Adapter Layer

> **Epic goal:** Put every platform-specific capability (HTTP, files, storage handles, capability flags) behind one `PlatformAdapter` interface injected once at bootstrap, so the later Electron and webOS targets are adapter swaps, not rewrites.
> **Verification:** The app boots exclusively through `createPlatform()`; `WebPlatform` is the only code touching `fetch` and file inputs; ESLint fails any `fetch`/`indexedDB`/`localStorage` reference outside `src/core/` (proven with a deliberate violation); `classifiedFetch` unit tests cover ok/http/timeout/cors-or-network; and the full adapter suite plus `FakePlatform` passes under `npm test`.

Before this phase the shell from Phase 02 runs with no network, file, or platform access at all. After it, `src/core/platform/` defines the `PlatformAdapter` contract from the plan (§4) — `storage`, `http`, `files`, `capabilities` — with a complete `WebPlatform` implementation: an `HttpAdapter` with timeout/abort and CORS-classified failures (MASTERPLAN.md §5.2), proxy URL template support, a `FileAdapter` over `input[type=file]`, and the `window.electron` detection bootstrap. ESLint fences make the adapter boundary mechanical, and a `FakePlatform` gives every downstream phase a deterministic test double. The `storage` slot is typed against the `StorageAdapter` interface but bound to a temporary in-memory stub until Phase 04 delivers the tiers.

## Feature 03.1 — PlatformAdapter interface definition

Define the one interface that decouples the entire app from its host platform — the single most important architectural idea ported from thunder-tv's `DataService` factory pattern.

- [ ] **03.1.1** Create the contract — `src/core/platform/platform-adapter.ts` declaring `interface PlatformAdapter { storage: StorageAdapter; http: HttpAdapter; files: FileAdapter; capabilities: Capabilities }` exactly as specified in the plan §4.
- [ ] **03.1.2** Forward-declare `StorageAdapter` — import the interface shape from `src/core/storage/storage-adapter.ts` (created here as types only; Phase 04 implements it) so the platform contract compiles now.
- [ ] **03.1.3** Declare `HttpAdapter` — `get`/`getText`/`getJson` methods with `{ headers?, timeoutMs?, signal? }` options and classified results, defined in `src/core/http/http-adapter.ts`.
- [ ] **03.1.4** Declare `FileAdapter` — `pickFile(accept): Promise<PickedFile | null>` and `readText(file): Promise<string>` shapes covering the M3U/XMLTV upload flows.
- [ ] **03.1.5** Document the injection rule — TSDoc on `PlatformAdapter` stating it is constructed once in `main.ts` and passed down; no module may construct or import a concrete platform directly.
- [ ] **03.1.6** Export the accessor — `src/core/platform/index.ts` with `setPlatform(p)` / `getPlatform()` (throws before init) so non-boot modules obtain the adapter without import cycles.
- [ ] **03.1.7** Keep the surface honest — deliberately exclude anything Electron-only (external players, native dialogs) from v1 methods; extension happens via capability flags, not optional methods, per the plan.
- [ ] **03.1.8** Type-only barrel — ensure `platform-adapter.ts` stays implementation-free (interfaces + types only) so importing the contract never drags an implementation into a chunk.
- [ ] **03.1.9** Unit-test the accessor — Vitest spec: `getPlatform()` throws before `setPlatform`, returns the same instance after, and rejects double initialization.
- [ ] **03.1.10** Document the pattern — add a `src/core/platform/README.md` paragraph mapping this design to thunder-tv's `DataFactory()` precedent and naming the future `ElectronPlatform`/webOS variants.

## Feature 03.2 — Capability flags model (corsUnrestricted, externalPlayers, durableStorage)

Capabilities are declared data, not scattered `if (isElectron)` checks — UX decisions (CORS warnings, player options, storage notices) all read from one flags object.

- [ ] **03.2.1** Define the type — `interface Capabilities { corsUnrestricted: boolean; externalPlayers: boolean; durableStorage: 'full' | 'partial' | 'none' }` in `src/core/platform/capabilities.ts`, matching the plan §4 verbatim.
- [ ] **03.2.2** Fix web values — `WebPlatform` reports `corsUnrestricted: false` and `externalPlayers: false` as constants; only `durableStorage` is dynamic (set from the Phase 04 probe result).
- [ ] **03.2.3** Stub durable storage honestly — until Phase 04 lands, the temporary storage stub reports `durableStorage: 'none'` so no code can assume persistence that doesn't exist yet.
- [ ] **03.2.4** Make flags readonly — expose `Capabilities` as `Readonly<...>` post-construction; the only sanctioned mutation path is the Phase 04 runtime demotion hook, which goes through a dedicated setter.
- [ ] **03.2.5** Mirror into state — copy capabilities into a Spektrum `platform.capabilities` value at bootstrap so templates can gate UI (`data-if`) without importing core modules.
- [ ] **03.2.6** Ban direct environment sniffing — extend the ESLint `no-restricted-globals`/`no-restricted-properties` config to flag `window.electron` references outside `src/core/platform/`, forcing consumers through capabilities.
- [ ] **03.2.7** Define consumer guidance — TSDoc examples: CORS warning UX keys off `corsUnrestricted`, storage-mode notice keys off `durableStorage`, external-player settings hidden when `externalPlayers` is false.
- [ ] **03.2.8** Future-proof deliberately — document (comment) that new capabilities are added as new fields with safe-false defaults, never by widening existing ones.
- [ ] **03.2.9** Unit-test immutability — Vitest spec asserting web capability constants and that TypeScript rejects mutation (`@ts-expect-error` compile-time assertions).
- [ ] **03.2.10** Wire a visible proof — the Sources first-run card shows its CORS hint line only when `platform.capabilities.corsUnrestricted` is false, as the first real flag consumer.

## Feature 03.3 — WebPlatform implementation

The default (and for now only) concrete platform: browser `fetch`, DOM file inputs, and probe-driven capabilities, assembled behind the interface.

- [ ] **03.3.1** Implement the class — `src/core/platform/web-platform.ts` composing `WebHttpAdapter`, `WebFileAdapter`, the storage stub, and web capabilities into a `PlatformAdapter`.
- [ ] **03.3.2** Construct via factory — `createWebPlatform()` async factory that will await the Phase 04 storage probe; today it awaits the stub and fills `durableStorage` accordingly.
- [ ] **03.3.3** Keep it thin — `WebPlatform` only wires collaborators; all behavior lives in the adapter classes, keeping every file comfortably under the 300-line target.
- [ ] **03.3.4** Bootstrap in `main.ts` — call `createPlatform()` (Feature 03.8) before any state seeding or `run()`, matching the plan's boot order (platform → storage → connect → render).
- [ ] **03.3.5** Fail loudly, boot anyway — a collaborator constructor throwing must degrade (e.g. capabilities to safest values) rather than white-screen; log one classified console line.
- [ ] **03.3.6** No side effects at import — verify importing `web-platform.ts` performs zero DOM/network work; everything happens inside the factory (import-order safety for tests).
- [ ] **03.3.7** Expose nothing extra — the module exports only `createWebPlatform`; internals (`WebHttpAdapter` etc.) are non-exported or `@internal` so nothing bypasses the interface.
- [ ] **03.3.8** Wire smoke usage — replace any direct `fetch` remaining in the repo (there must be none after Phase 02) and route the Phase 07-bound import-card URL flow's future needs through `getPlatform().http` in a documented example.
- [ ] **03.3.9** Integration-test assembly — Vitest spec constructing `createWebPlatform()` in jsdom and asserting the four slots exist, capabilities are web-correct, and the same instance is returned by `getPlatform()`.
- [ ] **03.3.10** Record bundle impact — confirm `src/core/platform/` adds no third-party dependency and note its gzipped contribution against the ≤60 KB app budget.

## Feature 03.4 — HttpAdapter with timeout and abort

All network I/O flows through one adapter with a default timeout, caller aborts, and consistent header handling — the base `classifiedFetch` builds on.

- [ ] **03.4.1** Implement `WebHttpAdapter` — `src/core/http/web-http-adapter.ts` wrapping `fetch` with a 15 s default timeout via `AbortSignal.timeout`, per the MASTERPLAN.md §5.2 sample.
- [ ] **03.4.2** Support caller aborts — accept an external `AbortSignal` and combine it with the timeout signal (`AbortSignal.any` with a documented fallback for engines lacking it).
- [ ] **03.4.3** Type the responses — `get` resolves to the classified result union (Feature 03.5); `getText`/`getJson` conveniences layer on top and never throw for classified failures.
- [ ] **03.4.4** Pass conditional headers through — support caller-supplied `If-None-Match`/`If-Modified-Since` headers and surface `status: 304` distinctly, ready for the Phase 15 conditional-refresh flow (§6.6).
- [ ] **03.4.5** Expose response headers — return `etag` and `last-modified` (lower-cased map) alongside ok results so playlist sources can persist them.
- [ ] **03.4.6** Never log URLs raw — adapter-internal diagnostics must omit or redact the URL (Xtream URLs embed credentials, §6.8); enforce with a code comment and a spec asserting no console call receives the full URL.
- [ ] **03.4.7** Cap response size defensively — implement an optional `maxBytes` guard (streamed length check) so a misconfigured URL cannot balloon memory before the worker ever sees it.
- [ ] **03.4.8** Keep binary open — `get` exposes the raw `Response` on ok results so the Phase 16 gzip XMLTV path can stream bytes without adapter changes.
- [ ] **03.4.9** Unit-test timeout and abort — Vitest with a mocked `fetch`: default timeout fires as `timeout` kind, caller abort rejects promptly, and combined signals don't leak listeners.
- [ ] **03.4.10** Unit-test conditional flow — spec asserting a 304 response returns `{ kind: 'http', status: 304 }` (or the dedicated variant chosen) without attempting a body read.

## Feature 03.5 — CORS/network failure classification (classifiedFetch from MASTERPLAN.md §5.2)

A CORS block, DNS failure, and offline all look identical to `fetch`; classification turns that opaque `TypeError` into specific, honest UX — the linchpin of the plan's designed-in CORS story (§8).

- [ ] **03.5.1** Port the reference — implement `classifiedFetch` in `src/core/http/classified-fetch.ts` following MASTERPLAN.md §5.2: result kinds `ok`, `http` (with status), `timeout`, `cors-or-network`.
- [ ] **03.5.2** Compute `crossOrigin` — on `cors-or-network`, include `crossOrigin: new URL(url, location.href).origin !== location.origin` so the UI can say "almost certainly CORS" only when it is.
- [ ] **03.5.3** Fold in `navigator.onLine` — include an `offlineHint` boolean on failures so messaging can distinguish "you appear offline" from "the provider blocks browser requests".
- [ ] **03.5.4** Detect mixed content early — add `mixedContentBlocked(url)` (§5.9) beside it and classify `https:`-page/`http:`-target requests as a dedicated `mixed-content` kind _before_ fetching, since the browser fails these silently.
- [ ] **03.5.5** Type the union exhaustively — export `FetchFailure` and the full result union; consumers must `switch` exhaustively (enforced by `never` checks) so no failure kind is silently dropped.
- [ ] **03.5.6** Map kinds to strings — add message keys for each kind to `src/app/strings.ts` (specific CORS explanation with download-and-upload and proxy alternatives, not "network error"), consumed by the Phase 02 error empty-state.
- [ ] **03.5.7** Integrate with the adapter — `WebHttpAdapter.get` delegates to `classifiedFetch` so classification is unavoidable; direct `fetch` remains lint-banned outside `src/core/`.
- [ ] **03.5.8** Unit-test each kind — Vitest with mocked `fetch`: resolves ok on 200, `http` on 500, `timeout` on `TimeoutError` DOMException, `cors-or-network` with correct `crossOrigin` on TypeError, `mixed-content` without any fetch attempt.
- [ ] **03.5.9** Cover URL edge cases — specs for relative URLs, URLs with ports, and invalid URLs (classification must not itself throw).
- [ ] **03.5.10** Document the UX contract — a short section in `src/core/http/README.md` mapping each kind to its intended surface (import flow errors in Phase 07, connect-flow errors in Phase 14, stream errors in Phase 23).

## Feature 03.6 — Proxy URL template support ({url} substitution)

The optional user-configured proxy (`https://my-proxy/{url}`) is applied inside the http adapter so playlist, EPG, and Xtream calls get it uniformly — empty by default, no public proxy shipped.

- [ ] **03.6.1** Implement the template — `applyProxy(template, url)` in `src/core/http/proxy.ts`: substitute `{url}` with the **encodeURIComponent**-ed target; a template without `{url}` gets the encoded URL appended (documented behavior).
- [ ] **03.6.2** Validate the template — reject templates that aren't `https://` (or same-origin `http://localhost`) at save time with a specific strings-module error; never silently downgrade to no proxy.
- [ ] **03.6.3** Wire into the adapter — `WebHttpAdapter` reads the current proxy template from a `settings.proxyTemplate` accessor (Spektrum-state-backed later; constructor-injected getter now) and applies it to every request when set.
- [ ] **03.6.4** Classify through the proxy — a failing proxied request classifies against the _proxy_ origin; include `viaProxy: true` in failure results so error copy can say the proxy itself failed.
- [ ] **03.6.5** Skip same-origin — never proxy requests to `location.origin` (app shell assets, vendored files); guard and spec it.
- [ ] **03.6.6** Keep credentials off the proxy log trail — document prominently that Xtream URLs passed to a proxy expose credentials to the proxy operator; this exact warning string ships in the Settings → Streaming copy (Phase 22 consumes it from `strings.ts` now).
- [ ] **03.6.7** Expose a bypass flag — per-request `{ noProxy: true }` option for calls that must never be proxied, used later by the PWA service-worker checks.
- [ ] **03.6.8** Media caveat noted — record in `proxy.ts` TSDoc that hls.js/mpegts.js segment fetches bypass this adapter and remain CORS-bound on web, with expectation-setting owned by the player phases (per plan §8.3).
- [ ] **03.6.9** Unit-test substitution — Vitest specs: `{url}` substitution with query-string-bearing targets, encoding correctness (round-trip decode equals original), no-`{url}` append mode, same-origin skip, invalid template rejection.
- [ ] **03.6.10** Integration-test through the adapter — mocked-fetch spec proving `WebHttpAdapter.get` hits `https://my-proxy/https%3A%2F%2Fprovider...` when the template is set and the raw URL when cleared.

## Feature 03.7 — FileAdapter over input[type=file]

File upload is a first-class, always-working import path on the web (no CORS); the adapter wraps the DOM input dance so callers get a clean promise API.

- [ ] **03.7.1** Implement `WebFileAdapter` — `src/core/platform/web-file-adapter.ts`: `pickFile(accept)` creates a detached `<input type="file">`, wires `change`, clicks it, and resolves `{ name, size, file } | null`.
- [ ] **03.7.2** Handle cancel correctly — resolve `null` on the input's `cancel` event (with a focus-based fallback for engines that lack it) so callers never hang on a dismissed picker.
- [ ] **03.7.3** Read as text — `readText(file)` via `file.text()` with a size pre-check that warns (classified result, not exception) past a documented threshold (~150 MB) before the M3U worker path exists.
- [ ] **03.7.4** Accept the right types — default accept lists for M3U (`.m3u,.m3u8,audio/x-mpegurl`) and XMLTV (`.xml,.xml.gz,application/gzip`) exported as constants for Phases 07/16.
- [ ] **03.7.5** Keep bytes available — expose the underlying `File` on the result so the gzip XMLTV path can stream `arrayBuffer()` later without re-picking.
- [ ] **03.7.6** Clean up after use — remove listeners and drop the input reference after resolution; verify no detached-node leak across repeated picks in a devtools heap snapshot.
- [ ] **03.7.7** Respect user activation — document that `pickFile` must be called synchronously from a user gesture (browsers block programmatic clicks otherwise); assert with a dev-mode warning when activation is absent.
- [ ] **03.7.8** Fence the DOM API — extend the lint fence so `input[type=file]` creation (`document.createElement('input')` with file type) outside `src/core/` is flagged via `no-restricted-syntax`.
- [ ] **03.7.9** Unit-test with jsdom — specs for resolve-on-change, `null`-on-cancel, and `readText` round-tripping a constructed `File` fixture.
- [ ] **03.7.10** Manual smoke — temporarily wire the first-run card's File button to `pickFile` and confirm a real `.m3u` file's name and size render, then leave the wiring behind a `TODO(phase-07)`.

## Feature 03.8 — Platform detection bootstrap (window.electron check)

One detection function, identical in spirit to thunder-tv's `DataFactory()`: `window.electron` truthy selects the Electron adapter, everything else gets `WebPlatform` — decided once, at boot.

- [ ] **03.8.1** Implement `createPlatform()` — `src/core/platform/create-platform.ts`: `if (window.electron) return createElectronPlatform(); return createWebPlatform();` with the Electron branch throwing a descriptive "not yet implemented (Phase 28)" error today.
- [ ] **03.8.2** Type the global — declare `Window['electron']` as an opaque `unknown` marker in `src/types/` (the real bridge type arrives in Phase 28), so detection compiles strictly without inventing an API.
- [ ] **03.8.3** Call it first — `main.ts` awaits `createPlatform()` and `setPlatform()` before the router, state seeding, and `run()`; assert the boot order in a comment block referencing plan §4 and §6.4.
- [ ] **03.8.4** Note the webOS story — document in `create-platform.ts` that webOS is _not_ a third branch: it is `WebPlatform` + storage probe + vendored import map (plan §4), so no `isWebOS` sniffing may appear.
- [ ] **03.8.5** Guard against late injection — detection reads `window.electron` exactly once at boot; document that a preload script must exist before app code runs (Electron guarantees this) and never re-detect.
- [ ] **03.8.6** Surface the platform in state — set `platform.name` (`'web' | 'electron'`) alongside capabilities for diagnostics UI; never for feature gating (capabilities own that).
- [ ] **03.8.7** Keep `main.ts` tiny — bootstrap sequencing lives in `src/app/bootstrap.ts` if `main.ts` nears the line target; `main.ts` stays a thin call-through.
- [ ] **03.8.8** Unit-test both branches — Vitest specs with `window.electron` stubbed: truthy selects the (throwing) Electron path, absent selects `WebPlatform`; restore globals between tests.
- [ ] **03.8.9** Verify on the built output — confirm the deployed Pages build logs/marks `platform.name === 'web'` and boots fully with the detection in place.
- [ ] **03.8.10** Document the swap-cost claim — add to `src/core/platform/README.md`: the Electron phase means one new `createElectronPlatform()` plus a preload bridge, zero UI changes — and keep this claim testable via `FakePlatform` (Feature 03.10).

## Feature 03.9 — ESLint fences (no-restricted-globals outside src/core/)

Make the adapter boundary mechanical: outside `src/core/`, referencing `fetch`, `indexedDB`, or `localStorage` is a lint error, not a review comment.

- [ ] **03.9.1** Fill the Phase 01 placeholder — replace the stub from 01.3.5 with a real `no-restricted-globals` config listing `fetch`, `indexedDB`, and `localStorage` (each with a message pointing to `getPlatform()`), applied to all files.
- [ ] **03.9.2** Carve out `src/core/` — an override block for `src/core/**` (and worker files under `src/m3u/`/`src/epg/` for `fetch`-in-worker cases, decided and noted here) that disables exactly those entries, nothing more.
- [ ] **03.9.3** Fence property access too — add `no-restricted-properties`/`no-restricted-syntax` entries for `window.fetch`, `globalThis.fetch`, `window.localStorage`, `window.indexedDB`, and `navigator.storage` so aliasing cannot dodge the global rule.
- [ ] **03.9.4** Fence `sessionStorage` — include `sessionStorage` in the ban (same leak/persistence concerns), documenting that any session-scoped persistence goes through the storage layer.
- [ ] **03.9.5** Fence `XMLHttpRequest` and `WebSocket` — add both to the restricted list so no alternative transport bypasses classification; note that a future need reopens this deliberately.
- [ ] **03.9.6** Keep tests honest — test files may construct mocks but not call real platform APIs; add a `**/*.spec.ts` override permitting `fetch` _stubbing_ globals via the chosen mock helper only, with a comment explaining why.
- [ ] **03.9.7** Prove the fence — add a temporary `fetch('x')` in `src/ui/`, confirm `npm run lint` fails with the custom message, remove it, and note the run here.
- [ ] **03.9.8** Prove the carve-out — confirm `src/core/http/web-http-adapter.ts` lints clean while using `fetch`, demonstrating override precision.
- [ ] **03.9.9** Sweep the existing tree — run the updated lint over the whole repo and migrate any stragglers (the Phase 01 smoke page must contain none) to adapter calls.
- [ ] **03.9.10** Document the policy — extend the README conventions section: the fence list, the `src/core/` exemption, and the rule that new platform APIs get fenced the day they are first used.

## Feature 03.10 — Adapter unit tests plus a FakePlatform for downstream tests

A deterministic `FakePlatform` (scripted HTTP, in-memory files, memory storage) is this phase's product for every later phase's tests — plus the consolidated adapter suite proving the layer itself.

- [ ] **03.10.1** Implement `FakePlatform` — `src/core/platform/fake-platform.ts` (test-only export): `FakeHttpAdapter` with a scriptable route table (`onGet(url).reply(kind, body, headers)`), `FakeFileAdapter` seeded with in-memory files, `MemoryStorage`-backed storage stub, and settable capabilities.
- [ ] **03.10.2** Script failures too — the fake http adapter can return any classified kind (`timeout`, `cors-or-network` with `crossOrigin`, `http` 304/500, `mixed-content`) so downstream phases can test every error surface without network.
- [ ] **03.10.3** Record interactions — the fakes record calls (URLs requested with headers, files picked, capability reads) for assertion, with a `reset()` between specs.
- [ ] **03.10.4** Keep it out of the bundle — ensure `fake-platform.ts` is imported only from spec files; verify via the build-output grep in `scripts/check-dist.mjs` that no fake symbol reaches `dist/`.
- [ ] **03.10.5** Provide a harness helper — `withFakePlatform(overrides, fn)` test utility that calls `setPlatform`, runs the spec body, and restores/clears the accessor afterward.
- [ ] **03.10.6** Consolidate the adapter suite — one `npm test` run covering Features 03.1–03.9's specs (accessor, capabilities, http timeout/abort/classification/proxy, file adapter, detection, fence proofs referenced by note).
- [ ] **03.10.7** Contract-test the fake — run the _same_ behavioral specs (classification result shapes, proxy application, 304 handling) against `FakeHttpAdapter` where applicable, so the fake cannot drift from `WebHttpAdapter` semantics.
- [ ] **03.10.8** Seed one downstream example — a sample spec demonstrating the intended pattern: script a `cors-or-network` reply, run a hypothetical import call, assert the classified error value lands in Spektrum state.
- [ ] **03.10.9** Document usage — `src/core/platform/README.md` section with the `withFakePlatform` recipe, the route-table API, and the rule that downstream phases test against `FakePlatform`, never live network.
- [ ] **03.10.10** Gate the phase — full `npm test`, `npm run lint`, `npm run typecheck`, and a built-`dist/` smoke on the deployed Pages URL (app boots through `createPlatform()`), then check the phase `> Verification:` line and merge `feature/phase-03-platform-adapter-layer`.
