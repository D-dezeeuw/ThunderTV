# Phase 27 — Testing Infrastructure

> **Epic goal:** Build a lean but real safety net — unit, DOM-binding, worker, storage-matrix, and built-dist smoke tests — all runnable locally with one command, with no CI anywhere in the loop.
> **Verification:** `node scripts/verify.mjs` runs typecheck + lint + Vitest + build + budgets green in under ~90 s; the storage matrix passes on all three tiers; the Playwright smoke passes against `vite preview` of a real build; coverage thresholds for `src/core/` are enforced and green.

Before this phase the codebase carries the ported m3u-utils specs and ad-hoc tests written along the way, but no conventions, no fixtures library, no DOM-binding harness, and no single pre-merge command. After this phase every layer has its harness — Vitest with co-located specs, a curated fixture library with provenance, a tier-parameterized storage contract suite, a jsdom Spektrum binding harness, worker protocol tests, an Xtream mock server, and a Playwright smoke against the built `dist/` — all orchestrated by `scripts/verify.mjs`, the executable form of the masterplan's phase-loop step 4.

## Feature 27.1 — Vitest setup and conventions

One test runner, one convention: Vitest configured to share the Vite pipeline, specs co-located with their sources, and rules written down so every later spec lands in the right place without discussion.

- [ ] **27.1.1** Configure Vitest — `vitest.config.ts` sharing `vite.config.ts` resolution/aliases, `node` environment by default with jsdom opt-in per file.
- [ ] **27.1.2** Resolve the bare `spektrum` specifier — map it to `public/vendor/spektrum.min.js` in test config, since Node has no import map to consult.
- [ ] **27.1.3** Co-location convention — `*.spec.ts` beside sources; a lint check rejects unit specs placed under `test/` (helpers and fixtures excepted).
- [ ] **27.1.4** npm scripts — `npm test` (single run), `npm run test:watch`, and `npm run test:coverage` via `@vitest/coverage-v8`.
- [ ] **27.1.5** Coverage plumbing — v8 provider with `text` + `json-summary` reporters so the Feature 27.9 ratchet script has machine-readable input.
- [ ] **27.1.6** Determinism helpers — `test/helpers/` with `vi.useFakeTimers` patterns for the global 30 s tick and the 150 ms search debounce, plus a seeded-random util.
- [ ] **27.1.7** Migrate the ported specs — bring the thunder-tv specs for `playlist.utils`, `kodiprop.utils`, `catchup.utils`, and `strip-country-prefix` into co-located files and green them.
- [ ] **27.1.8** State isolation — every spec resets Spektrum state via a shared reset helper so suite order never matters.
- [ ] **27.1.9** Speed budget — the whole unit suite finishes in < 10 s locally; benches and slow suites are excluded from the default run.
- [ ] **27.1.10** Document conventions — a testing section in the README: how to run, where specs live, and what belongs in unit vs smoke coverage.

## Feature 27.2 — Fixture library

Parsers are only as good as their inputs: a curated, sanitized set of real-world-shaped M3U, XMLTV, and Xtream fixtures under `test/fixtures/` — with provenance documented — gives every suite honest data.

- [ ] **27.2.1** Create the layout — `test/fixtures/{m3u,xmltv,xtream}/` with a top-level `README.md`.
- [ ] **27.2.2** Curate malformed M3U samples — BOM, CRLF, missing `#EXTM3U`, quoted commas in titles, `url-tvg` headers, and duplicate `tvg-id` cases.
- [ ] **27.2.3** Attribute-rich sample — catchup attributes, `tvg-shift`, and slash-containing `group-title` values exercising the ported utils.
- [ ] **27.2.4** XMLTV fixtures — a small guide with overlapping programmes, missing stop times, and offset timezones, plus a `.gz` variant.
- [ ] **27.2.5** Xtream JSON fixtures — `player_api.php` response shapes: auth success/failure, live categories/streams, VOD, series info, short EPG — including real provider quirks such as numbers-as-strings.
- [ ] **27.2.6** Provenance rule — the README lists origin per fixture (synthetic or anonymized capture) and confirms all credentials and hostnames are scrubbed to `example.invalid`.
- [ ] **27.2.7** Connect-URL fixtures — a constants module of `#/connect` fragments (valid, missing pass, `save=0`, malformed) for router and connect specs.
- [ ] **27.2.8** Link the generated tier — reference `scripts/gen-fixtures.mjs` (Phase 26) for large inputs; commit only the small deterministic tier and record its manifest hash.
- [ ] **27.2.9** Typed loader — `test/helpers/fixtures.ts` reads fixtures consistently across node and jsdom environments.
- [ ] **27.2.10** Retrofit sweep — move existing parser and storage specs off inline strings onto curated fixtures wherever realistic shape matters.

## Feature 27.3 — Storage test matrix harness

The tier promise — same behavior, different durability — is enforced by one contract suite run against all three `StorageAdapter` implementations, with `fake-indexeddb` making the IDB tier testable in plain Node.

- [ ] **27.3.1** Contract suite — a `describeStorageContract(factory)` helper in `src/core/storage/` asserting the full `StorageAdapter` API surface.
- [ ] **27.3.2** Memory reference run — `MemoryStorage` passes first; per §6.2 it is the reference implementation the other tiers must match.
- [ ] **27.3.3** IDB tier via `fake-indexeddb` — run `IdbStorage` against `fake-indexeddb` scoped per suite, with the real `idb` wrapper code untouched.
- [ ] **27.3.4** localStorage tier run — exercise the chunked-JSON codec including the ~5 MB budget accounting, under jsdom's localStorage.
- [ ] **27.3.5** Quota-failure injection — force `setItem` to throw `QuotaExceededError` mid-batch and assert `guardedSet` demotes to the memory tier without data corruption.
- [ ] **27.3.6** Probe tests — `probeIndexedDb` against healthy, open-error, blocked, and write-fails-after-open cases (the §5.1 read-only-engine trap).
- [ ] **27.3.7** Bulk-put semantics — write 10 k rows in chunks and assert identical counts and read-back across tiers, respecting each tier's persistence claims.
- [ ] **27.3.8** Mid-session demotion — a runtime IDB failure demotes to partial for the session and persists a flag forcing a re-probe next boot; assert both halves.
- [ ] **27.3.9** Composite-key behavior — `channels [playlistId, index]` and `epgPrograms [channelId, start]` range queries validated on the IDB tier, with memory-tier queries returning identical results.
- [ ] **27.3.10** Keep it fast — the whole matrix runs inside `npm test` in < 5 s so it is never skipped.

## Feature 27.4 — Spektrum DOM binding test harness

The templates are the UI, so the bindings deserve tests: a jsdom harness mounts an HTML partial, binds Spektrum, mutates state, and asserts the resulting DOM — closing the gap between store specs and full E2E.

- [ ] **27.4.1** Environment setup — `// @vitest-environment jsdom` per binding spec file, with the node default documented as intentional for everything else.
- [ ] **27.4.2** Harness helper — `test/helpers/spektrum-dom.ts`: mount a partial HTML string, run the Spektrum DOM binding, return the root plus a cleanup that fully resets state and DOM.
- [ ] **27.4.3** Channel-row spec — `setValue` a row object and assert rendered name, logo `src`, and now-playing text via `textContent`.
- [ ] **27.4.4** `data-each` windowing spec — publish a `visibleRows` slice, assert exactly `slice.length` row nodes, then republish a shifted slice and assert reconciliation updates rather than full re-render.
- [ ] **27.4.5** Spacer spec — `padTop`/`padBottom` heights derive from published values per the §6.1 math at fixed `ROW_H`.
- [ ] **27.4.6** `data-action` spec — dispatch click and keydown on bound elements and assert the `defineFn` actions fire with the expected payloads.
- [ ] **27.4.7** `data-model` spec — a search-input round trip: type → state updates → filtered publish, with fake timers driving the 150 ms debounce.
- [ ] **27.4.8** Global-tick spec — advance fake timers 30 s and assert visible-slice EPG progress values recompute while off-window state stays untouched.
- [ ] **27.4.9** `data-if` spec — the empty state, storage-tier notice, and CORS explanation panel toggle with their state flags.
- [ ] **27.4.10** Pattern doc — a README-testing snippet showing the mount → mutate → assert pattern for future view specs.

## Feature 27.5 — Worker tests

The chunked worker protocol (§6.9) is a typed contract; these tests run the parser workers under Vitest — via its worker support or a thin node shim — and pin the message sequences down.

- [ ] **27.5.1** Choose the run mode — evaluate Vitest's web-worker support vs a node shim wrapper; record the decision in this phase file per the autonomy rule.
- [ ] **27.5.2** Worker shim — `test/helpers/worker-shim.ts` wraps a worker module's message handler as an async function with a captured `postMessage` queue.
- [ ] **27.5.3** M3U protocol spec — feed fixture text and assert the ordered `progress` → `chunk` × N → `summary` sequence matching the `WorkerIn`/`WorkerOut` types.
- [ ] **27.5.4** Chunk-boundary spec — row counts exactly divisible and non-divisible by `CHUNK`; the final chunk always carries `done: true`.
- [ ] **27.5.5** Malformed-input spec — the malformed fixtures produce either a typed `error` message or documented skip counts, never a silent hang.
- [ ] **27.5.6** XMLTV normalization spec — overlapping and missing-stop programmes handled, timezone offsets normalized to epoch ms, channels mapped by id.
- [ ] **27.5.7** Gzip-path spec — the `.gz` fixture through the worker's decompression path yields byte-identical output to the plain XML fixture.
- [ ] **27.5.8** Pruning spec — programmes older than 24 h dropped on import and the 3-day per-channel horizon capped.
- [ ] **27.5.9** Exhaustiveness check — a compile-level spec asserts main-thread handlers exhaustively switch over every `WorkerOut` variant.
- [ ] **27.5.10** Throughput canary — a small assertion (10 k rows parsed in < 500 ms under the shim) as an early warning, distinct from the full Phase 26 bench.

## Feature 27.6 — Playwright smoke against the built dist

The dev server lies about production; the smoke suite runs against `vite preview` of a real `dist/` build and walks the golden path: import a fixture, scroll, search, play a stub stream, restore a session.

- [ ] **27.6.1** Playwright setup — `playwright.config.ts` with a `webServer` running `vite build && vite preview --port 4173`, Chromium-only for speed.
- [ ] **27.6.2** Import smoke — upload a `test/fixtures` M3U through the file-input flow, wait for the import summary, and assert the channel count in the UI.
- [ ] **27.6.3** Scroll smoke — scroll the list, assert row content changes, and assert the DOM row count stays ≤ ~40 throughout.
- [ ] **27.6.4** Search smoke — type a query, assert the filtered rows, clear, and assert the full list restores.
- [ ] **27.6.5** Play stub — click a channel and assert the player dock appears; a tiny local media fixture served by the preview server lets the native engine attach without network.
- [ ] **27.6.6** Session-restore smoke — reload the page and assert the last-active channel row and favorites render from the state cache (§6.4) before the playlist reloads.
- [ ] **27.6.7** Connect-URL smoke — visit a fixture `#/connect` fragment, assert the source is created and the list shown, and assert `page.url()` contains no credentials after the scrub.
- [ ] **27.6.8** Storage-tier assertion — read the dev hook exposing the probed tier and assert `full` under Chromium.
- [ ] **27.6.9** Failure artifacts — traces and screenshots on failure written to a gitignored artifacts folder for local debugging.
- [ ] **27.6.10** Wire and document — `npm run test:e2e`, documented as required before merging any UI-touching phase.

## Feature 27.7 — Xtream mock server for tests

A tiny fixture-serving mock — the pattern ported from thunder-tv's `apps/xtream-mock-server` — lets Xtream client, error-taxonomy, and CORS-behavior tests run hermetically with zero real providers involved.

- [ ] **27.7.1** Port the pattern — `scripts/xtream-mock.mjs`, a dependency-free `node:http` server modeled on thunder-tv's mock route surface, serving `test/fixtures/xtream` JSON.
- [ ] **27.7.2** Endpoint map — a `player_api.php` action router: no-action auth, `get_live_categories`, `get_live_streams`, `get_vod_streams`, `get_series`/`get_series_info`, `get_short_epg` — matching the `src/xtream/` endpoint map.
- [ ] **27.7.3** Credential validation — username/password query args checked against fixture creds; wrong creds return the real Xtream auth-failure shape.
- [ ] **27.7.4** Stream endpoints — `/live/{user}/{pass}/{id}.m3u8` serves a minimal valid HLS playlist pointing at a tiny local segment, enough for engine-attach tests.
- [ ] **27.7.5** CORS toggle — a `--cors` flag controls `Access-Control-Allow-Origin` so both blocked-on-web and permitted scenarios are testable.
- [ ] **27.7.6** Fault injection — flags for per-action delay, HTTP 500, and timeout to drive the Phase 19/23 classified-error specs.
- [ ] **27.7.7** Vitest integration — a start/stop helper binding an ephemeral port per suite; the Xtream client unit specs run against it.
- [ ] **27.7.8** Playwright integration — the smoke config boots the mock beside `vite preview`; an Xtream connect flow is exercised end to end.
- [ ] **27.7.9** Redaction assertion — a spec proves client log lines about mock requests never contain the username or password (the redacting-logger contract).
- [ ] **27.7.10** Standalone doc — a short note on running it manually (`node scripts/xtream-mock.mjs --port 8081`) for hand testing.

## Feature 27.8 — Pre-merge local gate

`scripts/verify.mjs` is the executable form of masterplan §3 step 4: typecheck, lint, tests, build, and budgets in one command — the thing you run before every merge, because there is no CI to catch you.

- [ ] **27.8.1** Create `scripts/verify.mjs` — orchestrates the steps sequentially with a clear per-step PASS/FAIL summary.
- [ ] **27.8.2** The steps — `tsc --noEmit`, ESLint (max-lines enforced), `vitest run`, `vite build`, then `node scripts/check-budgets.mjs`.
- [ ] **27.8.3** Fail-fast and full modes — default stops on first red; `--all` runs everything and reports every failure at once.
- [ ] **27.8.4** Optional E2E — a `--e2e` flag appends the built-dist Playwright smoke for UI-affecting phases.
- [ ] **27.8.5** Wall-clock budget — the gate without E2E finishes in < 90 s locally, with per-step timing printed so slowdowns are visible.
- [ ] **27.8.6** Canonical command — wire `npm run verify` and reference it from the masterplan's way-of-working as the step-4 command.
- [ ] **27.8.7** No-CI guard — the script asserts `.github/workflows/` does not exist, turning the no-GitHub-Actions rule into an executable check.
- [ ] **27.8.8** Dirty-tree warning — warn when uncommitted changes exist so a green run demonstrably corresponds to the commit being merged.
- [ ] **27.8.9** Machine-readable output — write a gitignored `verify-report.json` with per-step results for the Phase 29/30 release checklists to consume.
- [ ] **27.8.10** Document — a README "Before you merge" section: run `npm run verify`, merge only on green — mirroring masterplan §3 steps 4–5.

## Feature 27.9 — Coverage targets for core modules

Coverage thresholds on the modules where bugs hurt most — storage, state, parsers — set from measured baselines and ratcheted upward as reality allows, never plucked from aspiration.

- [ ] **27.9.1** Measure the baseline — run coverage and record current statement percentages for `src/core/storage`, `src/core/connect`, `src/core/http`, `src/m3u`, `src/epg`, and `src/xtream`.
- [ ] **27.9.2** Per-glob thresholds — `coverage.thresholds` entries in `vitest.config.ts` set at baseline minus a small margin, so the gate is green on day one and meaningful thereafter.
- [ ] **27.9.3** Ratchet script — `scripts/ratchet-coverage.mjs` compares the `json-summary` output to thresholds and, with `--write`, raises any threshold the actuals beat by > 2 points.
- [ ] **27.9.4** Storage priority — close matrix-suite gaps (probe branches, demotion paths) until `src/core/storage` statements reach ≥ 90 %.
- [ ] **27.9.5** Parser priority — use the malformed fixtures to bring `src/m3u` and `src/epg` to ≥ 85 % statements.
- [ ] **27.9.6** Persistence-bridge coverage — the debounced `persist()` snapshot path and its timer edges covered, including flush-on-pending behavior.
- [ ] **27.9.7** Exclusions policy — coverage excludes `*.spec.ts`, `test/helpers`, and dev-overlay code, with the rationale in config comments.
- [ ] **27.9.8** Gate integration — decide whether coverage-with-thresholds runs inside `verify.mjs` or behind `verify --coverage` based on measured cost; note the decision.
- [ ] **27.9.9** Never lower silently — the policy that lowering any threshold requires a written rationale in the commit touching the config.
- [ ] **27.9.10** Record the final coverage table in this phase file when done.

## Feature 27.10 — Regression test policy

Bugs that come back are the expensive ones: from here on, every bug fix lands with a test that failed before the fix, and the policy is written into the masterplan so it outlives this phase.

- [ ] **27.10.1** Write the policy — a "Regression tests" addition to MASTERPLAN.md's standing conventions: every bug fix lands with a failing-first test.
- [ ] **27.10.2** Document the workflow — reproduce in a spec, watch it fail, fix, watch it green; the proof pattern described in the README testing docs.
- [ ] **27.10.3** Naming convention — regression spec titles carry a short bug slug (`regression: <slug>`) so `vitest -t regression` lists them all.
- [ ] **27.10.4** Seed an exemplar — pick one real bug from the Phase 01–25 decision notes and land its regression spec as the reference example.
- [ ] **27.10.5** Escape hatch — when an automated test is impractical (device-only or timing-only bugs), the fix must document the manual verification protocol in the phase file instead.
- [ ] **27.10.6** Triage template — a short note format: symptom, root cause, test added, verification run.
- [ ] **27.10.7** Player-engine bugs — decide and document which engine-bug classes go to unit specs with a stubbed video element vs the Playwright stub-stream smoke.
- [ ] **27.10.8** Fixture-growth rule — when a real-world playlist breaks parsing, its minimized anonymized sample joins `test/fixtures/` with provenance noted.
- [ ] **27.10.9** Visibility nudge — `verify.mjs` prints the current count of `regression:` specs in its summary.
- [ ] **27.10.10** Retrospective sweep — audit Phase 01–25 fixes lacking regression specs; backfill the top gaps or record accepted exceptions in this phase file.
