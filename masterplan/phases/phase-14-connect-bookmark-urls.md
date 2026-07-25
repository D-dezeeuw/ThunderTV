# Phase 14 — Connect Bookmark URLs

> **Epic goal:** One bookmarked link fully configures a device: a strictly validated hash-fragment schema consumed before first render, idempotently upserted, immediately scrubbed from the address bar, and generatable from settings with honest plain-words warnings.
> **Verification:** Opening a valid connect link on the built `dist/` lands directly on the configured source's channel list with the address bar credential-free — checked after every outcome path including invalid links; consuming the same link repeatedly yields exactly one source row with a stable id; with `save=0`, a full-flow storage sweep across all tiers finds zero credential material (including via favorites/recent); the settings generator round-trips through the parser for passwords containing `+`, spaces, and non-ASCII; the 14.10 fuzz, scrub-ordering, idempotency, and leak suites pass in `npm test`.

Before this phase, sources are configured by hand through the Phase 7 import flows, and the hash router (Phase 2) carries only view routes. After this phase, `src/core/connect/` owns the full bookmark contract from plan §7: `#/connect?type=xtream|m3u&url=…&user=…&pass=…&name=…&epg=…&save=0` is parsed and validated before first render, upserted keyed on `type+url+user`, scrubbed via `history.replaceState` before any app-initiated request, honored in session-only mode when `save=0`, and generatable (with warning copy and an optional QR code) from Settings → Streaming — so a phone-to-TV handoff becomes a single visit.

## Feature 14.1 — Connect param schema and validation (type/url/user/pass/name/epg/save, strict parsing, reject unknown types)

The fragment is untrusted input arriving from anywhere. A pure, strict parser turns it into a typed result — accepted exactly as specified or rejected with a specific reason, never half-imported.

- [ ] **14.1.1** Create `src/core/connect/schema.ts` — `parseConnectParams(fragment)` splits on the first `?`, reads via `URLSearchParams`, and returns a discriminated `{ ok: true, params } | { ok: false, error }`.
- [ ] **14.1.2** Gate `type` strictly to the literals `xtream` and `m3u` — anything else returns an `unknown-type` error and no partial import ever occurs.
- [ ] **14.1.3** Validate `url` through `new URL()` requiring an `http:`/`https:` protocol — reject `javascript:`, `data:`, relative, and empty values outright.
- [ ] **14.1.4** Enforce per-type requireds: `xtream` needs `user` and `pass`; `m3u` needs only `url` — each missing required yields a field-specific error token for the UI.
- [ ] **14.1.5** Define the optionals: `name` (trimmed, length-capped), `epg` (validated like `url`), and `save` where only the literal `0` disables persistence — any other value means default-save.
- [ ] **14.1.6** Length-cap every value at parse time (~2 KB each) so a hostile mile-long fragment is rejected before any allocation-heavy work.
- [ ] **14.1.7** Ignore unknown parameter *names* with a diagnostic note (forward compatibility) while unknown *types* reject — document the deliberate asymmetry in the module.
- [ ] **14.1.8** Keep the parser pure and platform-free — no `location`, storage, or fetch imports — so 14.10 can fuzz it trivially.
- [ ] **14.1.9** Export `ConnectParams` as the single source-creation input type — 14.3's upsert and 14.6's generator both compile against it, guaranteeing round-trip symmetry.
- [ ] **14.1.10** Unit-test the acceptance grid: both valid types, every missing-required case, malformed URLs, and `save=0` vs `save=1` vs absent.

## Feature 14.2 — Boot-time fragment parsing before first render (order guaranteed ahead of any network request)

Consuming the fragment is the first thing the app does with its own logic: parse, upsert, and scrub complete before the router lands and before `core/http` is ever invoked — a structural guarantee, not a convention.

- [ ] **14.2.1** Insert the connect step at the top of the `src/main.ts` boot sequence — the fragment is inspected and consumed before `run()` and before `loadActiveSource()` or any other app-initiated request (§5.6 ordering).
- [ ] **14.2.2** Match only `#/connect?…` fragments into the connect path — the hash router handles every other fragment normally with no false positives on `#/favorites` and friends.
- [ ] **14.2.3** Await the full flow — parse → upsert (14.3) → scrub (14.4) — before the router resolves the landing view, so the app boots directly into the new source's channel list.
- [ ] **14.2.4** Make the network embargo structural: `core/http` is simply not invoked until the connect step returns, asserted by the 14.10 ordering test rather than by code review.
- [ ] **14.2.5** Surface invalid params as a strings-module error banner after boot while still scrubbing — a broken link never strands credentials in the address bar while the user reads the error.
- [ ] **14.2.6** Fix the explicit order `createStorage()` → connect parse/upsert/scrub → boot `getMany` hydration → `run()` — the upserted source is already in the hydrated sources list on first render.
- [ ] **14.2.7** Handle in-session entry: navigating to a `#/connect?…` link in a running app routes through the same handler (parse, upsert, scrub, activate) — one code path, not a boot special case.
- [ ] **14.2.8** Confine the raw fragment string to the handler's scope — never logged, never stored, never passed further than the parser.
- [ ] **14.2.9** Unit-test the ordering with instrumented stubs: the connect step resolves before the first `core/http` call and before `run()`.
- [ ] **14.2.10** Manual smoke on the built `dist/`: open a valid m3u connect link cold — the app boots straight into that source's list with a clean address bar.

## Feature 14.3 — Idempotent source upsert (match on type+url+user → update; else create)

A bookmark is visited many times on many days. Every consume converges on exactly one source row: matched sources update in place, unmatched create — and content fetching stays someone else's job.

- [ ] **14.3.1** Implement `upsertSourceFromParams(params)` in `src/core/connect/upsert.ts` — match key exactly `type+url+user` (§5.6): matched sources update, unmatched create.
- [ ] **14.3.2** Define update semantics: provided `name`, `pass`, and `epg` overwrite; absent optionals leave existing values untouched — a re-visit with a rotated password just works.
- [ ] **14.3.3** Define create semantics: a generated id, the params' fields, `lastRefresh: 0`, and empty ETag/Last-Modified validators — Phase 15's refresh sees a never-fetched source.
- [ ] **14.3.4** Activate the upserted source and land the router on its channel list — the "one visit configures a device" promise realized.
- [ ] **14.3.5** Write through the StorageAdapter `playlists` store on the current tier — on partial, source definitions are precisely the small-valuable data that tier exists to keep.
- [ ] **14.3.6** Prove idempotency: consuming the identical link N times leaves exactly one source row with a stable id — TV bookmark re-visits must not accumulate duplicates.
- [ ] **14.3.7** Treat the same `type+url` with a different `user` as a distinct subscription creating a second source — the match key is deliberately three-part; document with an example.
- [ ] **14.3.8** Keep the upsert fetch-free — content loading belongs to `loadActiveSource()` after boot completes (14.2 ordering); the upsert touches storage only.
- [ ] **14.3.9** Unit-test the match/create/update matrix, including optional-field preservation and the different-user case.
- [ ] **14.3.10** Unit-test id stability: two consecutive upserts of one link return the same source id and leave one storage row.

## Feature 14.4 — Credential scrub via history.replaceState (bookmark keeps secret, address bar does not)

The bookmark's job is to hold the secret; the address bar's job is to never show it again. One synchronous `replaceState` on every consume outcome, before storage writes and categorically before any network activity.

- [ ] **14.4.1** Implement the scrub as `history.replaceState(null, '', location.pathname + location.search + '#/')` — preserving the GitHub Pages subpath and benign query while removing the fragment (§5.6 shape).
- [ ] **14.4.2** Time it synchronously: the scrub executes immediately after the params object is captured — before the upsert's storage writes and categorically before any network activity.
- [ ] **14.4.3** Leave the bookmark itself untouched by design — `replaceState` rewrites only the address bar and current history entry; the bookmark keeps the secret, which is its job (plan §7).
- [ ] **14.4.4** Scrub on every consume outcome — valid, invalid, and unknown-type paths all pass through a single return path whose first act is the scrub.
- [ ] **14.4.5** Point the post-scrub fragment at the landing view (`#/` or the source's list route) so back/forward navigation never resurrects a credentialed URL from the session history.
- [ ] **14.4.6** Use `replaceState`, never `pushState` — Back leaves the app rather than stepping onto a credentialed entry; assert this in tests.
- [ ] **14.4.7** Give in-session connect links (14.2.7) the identical guarantee — navigation-triggered consumes scrub exactly like boot consumes.
- [ ] **14.4.8** Coordinate with the hash router so the pre-scrub fragment is processed exactly once — consume-then-scrub completes before the router's change listener can double-fire, verified with an instrumented router stub.
- [ ] **14.4.9** Unit-test with jsdom history/location: the address bar is credential-free after each outcome path, with exactly one `replaceState` call per consume.
- [ ] **14.4.10** Manual smoke: open a connect link, inspect the address bar, press Back, reopen from the bookmark — the bar is clean every time and the bookmark still works.

## Feature 14.5 — save=0 session-only mode (credentials never written to any storage tier)

For shared machines: the link works, the session works, and nothing survives. One `ephemeral` flag checked at a single persistence choke point — including the sneaky paths through favorites, recent, and refresh metadata.

- [ ] **14.5.1** Represent session-only sources as `ephemeral: true` on the in-memory source object — one flag, consulted at every persistence boundary.
- [ ] **14.5.2** Filter ephemeral sources out of every snapshot write at the single persistence choke point (the `src/state/persist.ts` glue) — not per call-site.
- [ ] **14.5.3** Apply the rule on every tier without exception — ephemeral means skipped on full, partial, and any future tier; the semantics live above the StorageAdapter.
- [ ] **14.5.4** Close the derived-data leak: favorites/recent snapshots from an ephemeral source carry credential-bearing URLs (the Xtream URL shape, §6.8) — mark them session-only, filter them at the same choke point, and hint it in the UI when starring.
- [ ] **14.5.5** Keep ETag/refresh metadata for ephemeral sources in memory — the Phase 15 refresh path must not slip validators into storage as a side channel.
- [ ] **14.5.6** Show a session-only badge on the source (sources view and settings) via a strings-module label — the user can see the mode they asked for.
- [ ] **14.5.7** Make reload behavior honest: the source is gone after reload by design, landing on the normal empty/landing state with no error surface.
- [ ] **14.5.8** Decide the collision case: an ephemeral consume matching a *persisted* source updates only the in-memory copy for this session, leaving the stored row unmodified — shared-machine semantics, recorded as a decision note.
- [ ] **14.5.9** Unit-test the choke point: with an ephemeral source active, run favorites/recent/settings writes, then dump every tier — zero occurrences of user, pass, or the source URL.
- [ ] **14.5.10** Unit-test reload semantics: the ephemeral source is absent after a simulated reboot while persisted sources are unaffected.

## Feature 14.6 — Bookmark link generator in settings (per source, correct encoding)

Generation is the other half of the contract: every source can emit the exact link the parser accepts, encoded correctly for hostile passwords, copied to the clipboard from Settings → Streaming.

- [ ] **14.6.1** Implement `generateConnectUrl(source, opts)` in `src/core/connect/generate.ts` — assembling `location.origin + location.pathname + '#/connect?' + new URLSearchParams(...)`, the exact inverse of 14.1's parser.
- [ ] **14.6.2** Emit per-type payloads: m3u includes `type,url,name,epg`; xtream includes `type,url,user,pass,name` — only fields with values, keeping links short.
- [ ] **14.6.3** Rely on `URLSearchParams` end-to-end for encoding — spaces, `&`, `+`, non-ASCII names, and port-carrying URLs survive the round trip; no hand-rolled `encodeURIComponent` chains.
- [ ] **14.6.4** Add the per-source "Copy bookmark link" action in Settings → Streaming — `navigator.clipboard.writeText` with a select-on-focus readonly-input fallback when the Clipboard API is denied.
- [ ] **14.6.5** Offer a `save=0` toggle in the generator UI — "don't keep credentials on the device that opens this" — appending `&save=0` when checked.
- [ ] **14.6.6** Derive the link base from `location` so the same build works on Pages subpaths, and hide the action when `location.protocol === 'file:'` (a `file://` connect link is meaningless in Electron) — decision-noted.
- [ ] **14.6.7** Property-test the round trip: for a corpus of sources, `parseConnectParams(generateConnectUrl(s))` reproduces the source-defining fields exactly.
- [ ] **14.6.8** Never log the produced link — clipboard and the visibly revealed input are the only outputs; the redaction rule applies to our own diagnostics too.
- [ ] **14.6.9** Allow ephemeral (14.5) sources to generate links too — the link is where those credentials legitimately live; the badge copy makes the distinction clear.
- [ ] **14.6.10** Manual smoke: copy a link for an Xtream source with a `+` in the password, open it in a private window, land connected.

## Feature 14.7 — Credential warning UX (plain-words warning at generation time)

The security posture is stated honestly, in plain words, at the moment it matters: the link is a password, sync spreads it, and the UI claims exactly what the code guarantees — no more, no less.

- [ ] **14.7.1** Write the warning copy in the central strings module, plain words: "This link contains your username and password. Anyone who has it can use your subscription. Treat it like a password."
- [ ] **14.7.2** Render the warning inline, directly above the copy action, always visible while the generator is open — not a dismissable toast, not hidden behind an info icon.
- [ ] **14.7.3** Add the bookmark-sync consequence line — "Browser bookmark sync will store this link on every synced device" — surfacing the plan's stated residual-risk tradeoff honestly.
- [ ] **14.7.4** Explain the `save=0` checkbox's half of the tradeoff in its label copy: the opening device won't keep the credentials, but the link itself still carries them.
- [ ] **14.7.5** Give credential-less m3u links a milder, distinct string (URL-only exposure) — the warning is truthful per type, not one-size-fits-all scary.
- [ ] **14.7.6** Inherit the same warning block above the QR display (14.9) — a scannable secret is still a secret.
- [ ] **14.7.7** Keep it static text in the settings-panel flow — no modal, no animation, per the no-transitions rule.
- [ ] **14.7.8** Review the copy against the masterplan §7 obligations (fragment-only transport, immediate scrub, no logging, no pre-scrub third-party requests) — the UI claims exactly what the code guarantees.
- [ ] **14.7.9** Unit-test string selection: xtream sources get the credential warning, m3u sources the URL-only variant, and both include the sync line.
- [ ] **14.7.10** Manual read-through on the built app at 320 px width — the warning is legible, unclipped, and precedes the copy control in tab order.

## Feature 14.8 — CORS interplay messaging (web target: classified error but source still saved)

On the plain web target most providers block cross-origin fetches — but the bookmark did its job. The source is saved first, the failure is classified and explained, and Electron makes the whole surface disappear.

- [ ] **14.8.1** Route the first post-connect content fetch through `classifiedFetch` (§5.2) — a `cors-or-network` result with `crossOrigin: true` renders the specific CORS explanation, never a generic failure.
- [ ] **14.8.2** State the saved guarantee explicitly in the UI — "Your subscription was saved — this browser just can't fetch it directly" — the 14.3 upsert already committed before any fetch ran.
- [ ] **14.8.3** List the real alternatives in order as affordances, not prose: download-and-upload the M3U, configure a proxy in Settings → Streaming, or use the desktop app.
- [ ] **14.8.4** Gate the messaging on `capabilities.corsUnrestricted` — the Electron adapter (Phase 28) flips it and this entire surface disappears with no changes here.
- [ ] **14.8.5** Probe Xtream connects against `player_api.php` the same way — a CORS-blocked probe still saves the source, shows the classified state, and notes that stream segments are CORS-bound on the web too (plan §8 expectation-setting).
- [ ] **14.8.6** Pre-check mixed content: an `http://` source URL on the `https://` Pages origin short-circuits to the mixed-content explanation (§5.9) instead of running a doomed fetch.
- [ ] **14.8.7** Land the failed source in the Phase 15 health model as `cors-blocked` so the sources view shows the same classification with a retry affordance — one taxonomy end to end.
- [ ] **14.8.8** Apply a configured proxy template automatically: the connect-triggered fetch goes through the `http` adapter's proxy path, and the messaging is skipped on success.
- [ ] **14.8.9** Unit-test with a stubbed http adapter: a CORS-shaped rejection yields source persisted + `cors-blocked` health + the correct strings key; the success path yields no messaging.
- [ ] **14.8.10** Manual smoke on real GitHub Pages: a known CORS-less M3U URL in a connect link saves the source, shows the explanation, and the file-upload fallback works.

## Feature 14.9 — QR code rendering of the connect link (tiny dependency-free generator, stretch)

The phone-to-TV handoff without typing: render the connect link as a locally generated QR code — no dependencies, no network, lazily loaded — and defer without guilt if budgets object; this is explicitly stretch.

- [ ] **14.9.1** Implement `src/ui/qr.ts` — a dependency-free byte-mode QR encoder (fixed error level M, versions sized for ~1 KB URLs) rendering to inline SVG, targeting ≤300 lines.
- [ ] **14.9.2** Evaluate vendoring a single-file MIT QR module instead of writing one — pick whichever lands under the line and size budgets, and record the decision note.
- [ ] **14.9.3** Lazy-load the module with `import()` from the generator UI only — QR bytes never enter the initial bundle; the ≤~60 KB budget owes nothing to a stretch feature.
- [ ] **14.9.4** Render crisp SVG modules with a proper quiet zone at ~min(60vw, 280 px) — scannable from a couch, which is the entire use case.
- [ ] **14.9.5** Place the QR beside the copy action with the 14.7 warning block above it, generated on demand per click rather than eagerly for every source.
- [ ] **14.9.6** Cap input length and show a strings-module notice when a link exceeds the supported QR version capacity instead of rendering garbage.
- [ ] **14.9.7** Guarantee zero network involvement — no external image service, ever; pure local computation, consistent with the fragment-never-leaves-the-browser posture.
- [ ] **14.9.8** Unit-test the encoder against known byte-mode QR vectors (or the vendored module's own vectors) using URL-typical characters.
- [ ] **14.9.9** Run the phone-to-TV manual test: generate on desktop, scan with a phone camera, open on the phone — lands connected; note the result.
- [ ] **14.9.10** Apply stretch discipline: if the encoder busts budgets or timelines, defer behind a decision note and ship the phase without it — the phase's verification does not depend on this feature.

## Feature 14.10 — Connect flow tests (schema fuzzing, scrub timing, idempotency, save=0 leak check)

The connect flow handles secrets at boot time — the two things hardest to verify by eye. This suite makes every guarantee mechanical: the parser can't be crashed, the scrub can't be reordered, and `save=0` provably leaks nothing.

- [ ] **14.10.1** Fuzz the schema with property-based hostile fragments — random params, truncated pairs, repeated keys, 100 KB values, exotic encodings — asserting the parser always returns a typed result and never throws.
- [ ] **14.10.2** Lock 14.1's valid/invalid matrix as table-driven regression cases so any schema drift breaks a named test.
- [ ] **14.10.3** Test scrub ordering with instrumented `history`, `core/http`, and storage stubs — parse → scrub → upsert-write → (later) first fetch; any reordering fails the suite.
- [ ] **14.10.4** Test scrub completeness: every handler outcome (valid m3u, valid xtream, invalid, unknown type) ends with a credential-free `location` in jsdom.
- [ ] **14.10.5** Test idempotency through the public boot handler, not internals: N replays of one link produce one source row with a stable id, and a changed `pass` updates in place.
- [ ] **14.10.6** Sweep for `save=0` leaks at integration level: run the full flow plus favoriting and recent-recording, then string-scan every tier's serialized contents for user/pass/URL material — zero hits required.
- [ ] **14.10.7** Round-trip generate → parse across the source corpus, including the `+`/space/non-ASCII password cases from 14.6.
- [ ] **14.10.8** Guard against router double-consume: assert the connect fragment is processed exactly once per navigation event (14.4.8) under both boot and in-session entry.
- [ ] **14.10.9** Run the schema and flow suites through the 13.10 tier-matrix harness — connect behavior must be tier-independent apart from what persists.
- [ ] **14.10.10** Wire every suite into `npm test`, keep the local run under a few seconds, and record the fuzz iteration count and runtime in the phase notes.
