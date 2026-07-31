# ThunderTV — Masterplan

**30 phases (epics) × 10 features (stories) × 10 to-do items (tasks) = the full
road from empty repo to a 1.0 release on web, desktop, and TV.**

This masterplan operationalizes the architecture plan in
[`architecture-plan.md`](./architecture-plan.md). The plan says _what and
why_; this document and the phase files under [`phases/`](./phases/) say
_in which order, in which branch, and down to which task_.

---

## 1. What this project is about

**ThunderTV** is a compact, fast IPTV player, distributed as a static
GitHub Pages web app (no GitHub Actions, one local deploy command) and later
packaged unchanged for Electron (Windows/macOS/Linux) and LG webOS TVs.

Core principles:

- **Minimalistic by default, all information on demand.** A 56 px icon rail, a
  channel list, a player dock. Detail (EPG, metadata, settings) appears only
  when asked for.
- **Performance is the feature.** At most ~40 channel rows in the DOM at any
  time (windowed virtual list over 90 000+ channels). One global 30 s tick for
  all progress bars. Heavy caching: parse once in a worker, boot from
  structured storage, never re-parse. *(This principle originally read "no CSS
  transitions or animations." That ban was **retired** with the theme refresh —
  motion is part of the design language now, gated by `prefers-reduced-motion`
  in `base.css` rather than forbidden, and `check-css.mjs` records the
  decision where the guard used to live.)*
- **Reactivity via [Spektrum](https://github.com/D-dezeeuw/spektrum)** (npm
  `spektrum`, ~13 KB min, zero deps), loaded from a pinned CDN import map with
  a vendored fallback for packaged targets. Spektrum is both the binding layer
  (`{{expr}}`, `data-each`, `data-action`, `data-model`) and the state layer
  (`setValue`, `computed`, `defineFn`) — including **state caching**: the
  last-watched channel, zap history, and per-view UI state live in Spektrum
  state and are snapshotted to storage, so a reboot restores the session
  instantly (channel row rendered and playable before any playlist re-parse).
- **Tiered storage.** A boot probe selects IndexedDB (full) → localStorage
  (small valuable data only) → in-memory (session). The in-memory array is the
  query layer on _every_ tier; tiers only decide what survives a reload. The
  app is always fully functional.
- **Honest about the web's limits.** CORS and mixed content are designed-in UX
  (classified errors, optional proxy, file/paste imports first-class), not
  bugs discovered late. Electron/webOS packaging removes those limits.
- **Bookmarkable subscriptions.** A hash-fragment connect URL
  (`#/connect?type=xtream&url=…&user=…&pass=…`) fully configures a device in
  one visit — fragments never reach a server, and the address bar is scrubbed
  after import. **Designed, not built** — Phase 14 is the one unstarted item
  on the 1.0 road; `src/core/connect/` holds only the dedup key today.

Sources: M3U/M3U8 (file, paste, URL) and Xtream Codes; XMLTV EPG. Playback:
hls.js / mpegts.js / native `<video>`, lazy-loaded per stream type.

---

## 2. How to read this masterplan

| Agile term | Here                                           | Numbering           |
| ---------- | ---------------------------------------------- | ------------------- |
| Epic       | **Phase** — one markdown file under `phases/`  | `NN` (01–30)        |
| Story      | **Feature** — a `##` section in the phase file | `NN.F` (F = 1–10)   |
| Task       | **To-do** — a checkbox line under the feature  | `NN.F.T` (T = 1–10) |

Every phase file follows the same template:

```markdown
# Phase NN — Title

> Epic goal: one or two sentences.
> Verification: what "done and verified" means for this phase.
> **Status:** `shipped` · tracker: `current` — what actually shipped.

Intro paragraph: what exists before this phase, what exists after.

## Feature NN.1 — Title

One–two sentence description of the story and why it matters.

- [ ] **NN.1.1** Task title — short description.
- [ ] … (10 tasks)
```

Boxes have three states: `[ ]` open, `[x]` done, and `[~]` **closed with a
documented divergence** — deferred on purpose, or built under a different
name, with the reason on the line itself. Reach for `[~]` rather than
silently ticking something you built differently; that note is the only
record of why, and §4's table counts it separately from `[x]`.

**The `> **Status:**` line is the phase's real verdict**, and the one thing
that must stay true. Its grammar is fixed, because
`scripts/gen-phase-status.mjs` parses it:

```
> **Status:** `<shipped|partial|not-started|superseded>` · tracker: `<current|not-maintained>` — <prose>
```

`tracker: current` promises the boxes below match the code. Set
`not-maintained` the moment that stops being true — an honest "not tracked"
in the summary is worth more than a stale count, and §4 explains what
happened when 22 phases claimed the opposite.

---

## 3. Way of working

> **This section describes phase-sized work, which is no longer how most
> changes arrive.** The project is past its build-out: work now lands as
> scoped changes against a shipped app, and
> [`.claude/AGENTS.md`](../.claude/AGENTS.md) is the authority on branching,
> testing depth and landing — including that you merge to `main` yourself
> rather than parking a draft PR. The `feature/phase-NN-<slug>` convention
> below was abandoned after Phase 08; branches are named for the change now.
> What still holds from this section is the **autonomy rule** and the
> **standing verification checklist**, which `npm run verify` now enforces
> as one command.

The loop, per phase (epic):

1. **Read the full phase** file before writing any code — features in a phase
   are ordered but interdependent; the intro states what must exist at the end.
2. **Create a new feature branch** from `main`:
   `feature/phase-NN-<slug>` (e.g. `feature/phase-04-tiered-storage-engine`).
3. **Implement all the features, all the to-dos** — in order, checking off
   tasks in the phase file as part of the same commits.
4. **Verify the implementation (successfully)** — the phase's own
   `> Verification:` line plus the standing checklist below. Do not proceed on
   red.
5. **Merge the feature branch to `main` and push.** `main` is always
   releasable; deploy to Pages (`npm run deploy`) after merge whenever the
   phase changes user-visible behavior.
6. **Pick up the next phase.**

**Autonomy rule:** work autonomously. When a question comes up, investigate
(the plan, this document, the referenced thunder-tv sources, the library docs),
pick the recommended solution, note the decision in the phase file next to the
relevant task, and keep moving. Only a genuine product decision (not a
technical one) is worth stopping for.

**Standing verification checklist — now one command: `npm run verify`.**

Most of this list is machine-enforced, which is the point: AUDIT §5 found that
every rule enforced by a script held and every rule enforced by a README
drifted. `verify` runs typecheck, ESLint (max-lines ≤ 400, target ≤ 300), the
CSS/file-access/import-map/reachability fences, the full test suite, a
production build, and `check-dist` — which fails on an entry chunk over
200 kB raw or 60 kB gzipped. CI is `workflow_dispatch`-only on purpose, so
`verify` is not *a* definition of green, it is *the* definition.

What a machine still cannot check, and you must:

- **Manual smoke on the built `dist/`** (not just the dev server): import a
  playlist, scroll, search, play a channel, reload (session restore), on the
  storage tier(s) the change touches.
- **The budgets with no script yet:** cold start < 1 s with a cached
  playlist, 100 k-channel import < 5 s, scroll ≤ ~40 DOM rows, search
  < 50 ms. Phase 26 owns closing that gap.
- **Credential hygiene:** none in logs, none in query strings, none in
  exception messages.
- **Asset weight.** `check-dist` polices JavaScript and nothing else. Images,
  fonts and CSS are unmeasured, and the boot wallpaper is currently **1.85 MB**
  — roughly 24× the entire first-load JS payload, fetched eagerly because the
  splash is in the initial DOM. Weigh anything you add to the boot path
  yourself; no script will.
- **The docs that describe what you changed** — the module README from
  `CLAUDE.md`'s table, `src/state/README.md`'s ownership table for a new key,
  and the phase's `> **Status:**` line if the change moves it. Regenerate
  derived docs with `node scripts/gen-state-keys.mjs` and
  `node scripts/gen-phase-status.mjs`; both have a `--check` mode that
  `verify` runs, so drift fails the build rather than accumulating.

**Definition of done:** verification green, docs updated, merged to `main`,
pushed, and (when user-visible) deployed.

---

## 4. The 30-phase vision

Rough arc: **01–05** foundations → **06–09** M3U browsing → **10–12** playback
→ **13–15** daily driver → **16–18** EPG → **19–21** Xtream → **22–27**
product hardening → **28–30** desktop and TV. Phases past 30 are not part of
the 1.0 road; they execute [`VISION-3.0.md`](./VISION-3.0.md)'s stepping
stones with the same phase template.

**Read the Status column, not the checkboxes.** Per-task boxes were kept
current through Phase 08 and again in Phase 31; across 09–30 the habit was
abandoned while the code shipped anyway, so those boxes report a phase as
unstarted when it is done — the inversion AUDIT §3.2 named. Rather than
retro-tick ~2 000 boxes nobody verified, each phase file now carries a
`> **Status:**` line stating what actually shipped, what did not, and where
the divergences are; `tracker: not-maintained` marks the files whose boxes
are stale, and the table below reports their task count as *not tracked*
rather than as a number. **For any phase, the live reference is the module
README named in `CLAUDE.md`'s table** — the phase file is history plus this
status line.

<!-- BEGIN generated: phase-status (node scripts/gen-phase-status.mjs) -->

> Generated by `node scripts/gen-phase-status.mjs` from each phase file's `> **Status:**` line.
> Do not hand-edit this table — edit the phase file and regenerate.

| #   | Phase | Status | Tasks |
| --- | ----- | ------ | ----- |
| 01 | [Foundation & Tooling](./phases/phase-01-foundation-and-tooling.md) | `shipped` | 100/100 |
| 02 | [App Shell & Design System](./phases/phase-02-app-shell-and-design-system.md) | `shipped` | 99/100 |
| 03 | [Platform Adapter Layer](./phases/phase-03-platform-adapter-layer.md) | `shipped` | 100/100 |
| 04 | [Tiered Storage Engine](./phases/phase-04-tiered-storage-engine.md) | `shipped` | 100/100 |
| 05 | [Spektrum State Architecture](./phases/phase-05-spektrum-state-architecture.md) | `shipped` | 100/100 |
| 06 | [M3U Parsing Engine](./phases/phase-06-m3u-parsing-engine.md) | `shipped` | 100/100 |
| 07 | [Playlist Import Flows](./phases/phase-07-playlist-import-flows.md) | `shipped` | 98/100 · 6 noted |
| 08 | [Channel List & Virtual Scrolling](./phases/phase-08-channel-list-virtual-scrolling.md) | `shipped` | 100/100 |
| 09 | [Search & Filtering](./phases/phase-09-search-and-filtering.md) | `partial` | not tracked |
| 10 | [Playback Foundation](./phases/phase-10-playback-foundation.md) | `shipped` | not tracked |
| 11 | [HLS & MPEG-TS Engines](./phases/phase-11-hls-and-mpegts-engines.md) | `shipped` | not tracked |
| 12 | [Player UI: Dock & Theater](./phases/phase-12-player-ui-dock-and-theater.md) | `partial` | not tracked |
| 13 | [Favorites & Recent](./phases/phase-13-favorites-and-recent.md) | `partial` | not tracked |
| 14 | [Connect Bookmark URLs](./phases/phase-14-connect-bookmark-urls.md) | `not-started` | not tracked |
| 15 | [Multi-Playlist Management](./phases/phase-15-multi-playlist-management.md) | `partial` | not tracked |
| 16 | [EPG Ingestion](./phases/phase-16-epg-ingestion.md) | `superseded` | not tracked |
| 17 | [EPG Display](./phases/phase-17-epg-display.md) | `superseded` | not tracked |
| 18 | [EPG Guide & Mapping](./phases/phase-18-epg-guide-and-mapping.md) | `superseded` | not tracked |
| 19 | [Xtream API Client](./phases/phase-19-xtream-api-client.md) | `shipped` | not tracked |
| 20 | [Xtream Live](./phases/phase-20-xtream-live.md) | `shipped` | not tracked |
| 21 | [Xtream VOD & Series](./phases/phase-21-xtream-vod-and-series.md) | `shipped` | not tracked |
| 22 | [Settings & Personalization](./phases/phase-22-settings-and-personalization.md) | `shipped` | not tracked |
| 23 | [Resilience & Error Surfaces](./phases/phase-23-resilience-and-error-surfaces.md) | `partial` | not tracked |
| 24 | [PWA & Offline Shell](./phases/phase-24-pwa-and-offline-shell.md) | `not-started` | not tracked |
| 25 | [Accessibility & Input](./phases/phase-25-accessibility-and-input.md) | `partial` | not tracked |
| 26 | [Performance Hardening](./phases/phase-26-performance-hardening.md) | `partial` | not tracked |
| 27 | [Testing Infrastructure](./phases/phase-27-testing-infrastructure.md) | `partial` | not tracked |
| 28 | [Electron Shell](./phases/phase-28-electron-shell.md) | `shipped` | not tracked |
| 29 | [Desktop Packaging & Distribution](./phases/phase-29-desktop-packaging-and-distribution.md) | `shipped` | not tracked |
| 30 | [webOS Target & 1.0 Release](./phases/phase-30-webos-target-and-release.md) | `partial` | not tracked |
| 31 | [EPG Country Catalog (Vision 3.0 stepping stone)](./phases/phase-31-epg-country-catalog.md) | `partial` | 78/100 |
| 32 | EPG Display & Timeline — see [`src/epg/README.md`](../src/epg/README.md) | `shipped` | Now/next on Live rows and the Guide timeline, superseding Phase 17. |
| 33 | Passive Health Signals — see [`src/health/README.md`](../src/health/README.md) | `shipped` | Decaying per-feed score from real playback outcomes; dead feeds never render. |
| 34 | Codex v0 — Export & Import — see [`src/codex/README.md`](../src/codex/README.md) | `shipped` | The signed, portable knowledge file the user owns. |
| 35 | Spatial Navigation — see [`src/ui/spatial/README.md`](../src/ui/spatial/README.md) | `shipped` | Geometry-based D-pad focus — the input model Phase 25 left unbuilt and Phase 30 needs. |
| 36 | Codex Merge (CRDT) — see [`src/codex/README.md`](../src/codex/README.md) | `shipped` | A grow-only join, so convergence needs no sync server. |
| 37 | Community Codex — see [`src/codex/README.md`](../src/codex/README.md) | `partial` | Discover, merge and prune ship, bounded by `trust.ts`'s ingest clamp. **Publish is deliberately not implemented** — it would mean operating the service this pillar exists to avoid. |
| 38 | Handoff — see [`src/handoff/README.md`](../src/handoff/README.md) | `partial` | The link-based handoff ships. **The LAN transport is deliberately not built** — it needs a host that can listen, which means the Electron main process. |

**Totals:** 21 shipped · 12 partial · 2 not started · 3 superseded.

<!-- END generated: phase-status -->

Phase 31 has a full phase file. Phases 32 onward are documented in the
module README each one created or owns — that is where a change to them
starts, so a separate phase file would be a second copy to keep honest.

---

## 5. Common pitfalls (with code)

### 5.1 Feature detection lies — probe storage with a real round-trip

`window.indexedDB` exists in browsers where `open()` then fails (private
modes, some TV webviews). Never branch on presence; branch on a probe.

```ts
// core/storage/probe.ts
export async function probeIndexedDb(): Promise<boolean> {
    try {
        const db = await new Promise<IDBDatabase>((res, rej) => {
            const req = indexedDB.open('__probe__', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('t');
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
            req.onblocked = () => rej(new Error('blocked'));
        });
        // A write must succeed too — some engines open read-only.
        await new Promise<void>((res, rej) => {
            const tx = db.transaction('t', 'readwrite');
            tx.objectStore('t').put(1, 'k');
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        });
        db.close();
        indexedDB.deleteDatabase('__probe__');
        return true;
    } catch {
        return false;
    }
}
```

### 5.2 `fetch` hides the reason — classify CORS-shaped failures

A CORS block, DNS failure, and offline all reject with the same opaque
`TypeError`. Don't show "network error" for what is almost certainly CORS.

```ts
export type FetchFailure = 'cors-or-network' | 'http' | 'timeout';

export async function classifiedFetch(url: string, init?: RequestInit) {
    try {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return { kind: 'http' as const, status: res.status };
        return { kind: 'ok' as const, res };
    } catch (e) {
        if (e instanceof DOMException && e.name === 'TimeoutError')
            return { kind: 'timeout' as const };
        // TypeError here: offline, DNS, *or CORS*. If navigator.onLine and the
        // URL is cross-origin, present the CORS explanation + alternatives
        // (download-and-upload, proxy setting) — not a generic error.
        return {
            kind: 'cors-or-network' as const,
            crossOrigin: new URL(url, location.href).origin !== location.origin,
        };
    }
}
```

### 5.3 Player engines leak on channel zap — destroy before create

Every hls.js/mpegts.js instance holds a MediaSource, XHRs, and timers. Zapping
100 channels without teardown is a guaranteed memory leak and eventual tab
crash. One engine instance may exist at a time, enforced in one place.

```ts
// player/engine-host.ts
let current: PlayerEngine | null = null;

export async function playChannel(url: string, video: HTMLVideoElement) {
    current?.destroy(); // hls.destroy() / mpegts player.destroy()
    current = null; // …even if the next line throws
    video.removeAttribute('src');
    video.load(); // release the previous MediaSource
    current = await selectEngine(url); // lazy import inside
    await current.attach(video, url);
}
```

### 5.4 Don't push 90 000 rows through DOM state

Spektrum reconciles what you hand to `data-each`. Handing it the full channel
array makes every keystroke a 90 k-row diff. Only the windowed slice is DOM
state; the full array stays a plain module-level variable.

```ts
// ui/virtual-list.ts
let allRows: Channel[] = []; // plain memory — NOT Spektrum state

export function setRows(rows: Channel[]) {
    allRows = rows;
    publishWindow();
}

function publishWindow() {
    const first = Math.floor(scrollTop / ROW_H);
    const slice = allRows.slice(first - OVERSCAN, first + visibleCount + OVERSCAN);
    setValue('list.visibleRows', slice); // ≤ ~40 rows ever hit data-each
    setValue('list.padTop', Math.max(0, first - OVERSCAN) * ROW_H);
    setValue('list.padBottom', (allRows.length - first - visibleCount - OVERSCAN) * ROW_H);
}
```

### 5.5 Per-row timers kill idle CPU — one global tick

EPG progress bars per visible row must not each own an interval. One 30 s tick
re-enriches the visible slice; everything else derives from it.

```ts
setInterval(() => {
    const now = Date.now();
    setValue('epg.tick', now); // computed() values depending on the
}, 30_000); // tick recalc; rows re-render only if
// their now/next actually changed
```

### 5.6 Credentials in the query string leak — fragment only

`https://site/?user=x&pass=y` is sent to the server (GitHub Pages logs,
proxies, referrers). `#/connect?…` never leaves the browser. And scrub after
consuming — the bookmark keeps the secret, the address bar must not.

```ts
const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
if (params.get('type')) {
    await upsertSourceFromParams(params); // idempotent: keyed on type+url+user
    history.replaceState(null, '', location.pathname + '#/'); // scrub BEFORE any 3rd-party request
}
```

### 5.7 localStorage throws when full — every write goes through a guard

On the partial tier, a `QuotaExceededError` mid-write must demote gracefully,
never white-screen the app.

```ts
function guardedSet(key: string, value: string): boolean {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        // Quota or privacy mode. Demote this session to the memory tier,
        // surface the one-line storage notice, keep running.
        storageTier.demote('none');
        return false;
    }
}
```

### 5.8 Unbounded time-travel history — cap it, and bypass it for bulk data

Spektrum records mutations for `replay(n)`. A 100 k-channel import recorded
mutation-by-mutation is a memory bomb. Bulk data flows through the storage
layer and module memory (see 5.4); only compact UI state is recorded, and
production caps or disables history.

```ts
// state/history-policy.ts — dev keeps replay for debugging; prod does not pay for it
if (import.meta.env.PROD) configureHistory({ limit: 0 });
else configureHistory({ limit: 200 });
// Rule of thumb: if a value can exceed ~1000 items, it does not belong in
// recorded state — keep it in module memory and publish derived slices.
```

### 5.9 Mixed content is blocked _silently_ — detect and say it

An `https://` page cannot load `http://` streams; the browser just fails.
Detect it before the player does and explain, including that the desktop app
does not have this limit.

```ts
export function mixedContentBlocked(streamUrl: string): boolean {
    return location.protocol === 'https:' && new URL(streamUrl).protocol === 'http:';
}
```

### 5.10 Worker results as one giant message — chunk them

`postMessage` with 90 k rows structured-clones tens of MB in one go and
freezes the main thread on receive. Stream chunks with progress; write each
chunk to storage as it arrives.

```ts
// m3u/parser.worker.ts
const CHUNK = 5_000;
for (let i = 0; i < channels.length; i += CHUNK) {
    postMessage({
        type: 'chunk',
        rows: channels.slice(i, i + CHUNK),
        done: i + CHUNK >= channels.length,
    });
}
postMessage({ type: 'summary', total: channels.length, groups });
```

---

## 6. Tips for the complex pieces (with code)

### 6.1 Windowing math — fixed heights, no measuring, ever

The whole virtual list stays trivial _because_ row height is a constant per
density mode. Two spacer divs + one `data-each` container:

```html
<div class="list" data-action="scroll:onListScroll">
    <div class="pad" :style="'height:' + list.padTop + 'px'"></div>
    <div class="rows" data-each="list.visibleRows"><!-- row template --></div>
    <div class="pad" :style="'height:' + list.padBottom + 'px'"></div>
</div>
```

```ts
const ROW_H = density === 'compact' ? 32 : 44; // changing density = one re-publish
const OVERSCAN = 8;
// onListScroll → publishWindow() from pitfall 5.4; rAF-throttled:
let scheduled = false;
function onListScroll(e: Event) {
    scrollTop = (e.target as HTMLElement).scrollTop;
    if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            publishWindow();
        });
    }
}
```

### 6.2 Tier selection — one probe, one factory, one interface

```ts
// core/storage/index.ts
export async function createStorage(): Promise<StorageAdapter> {
    if (await probeIndexedDb()) return new IdbStorage(); // tier: full
    if (probeLocalStorage()) return new LocalStorageStorage(); // tier: partial
    return new MemoryStorage(); // tier: none
}
// MemoryStorage is the reference implementation: the other two must pass the
// exact same test suite (the storage test matrix runs all tiers).
```

### 6.3 Persistence through the action layer — no framework introspection

Rather than hooking Spektrum internals, every mutation goes through a
`defineFn` action, and actions that touch persisted keys schedule a debounced
snapshot. Deterministic, testable, and it survives library upgrades.

```ts
// state/persist.ts
const dirty = new Set<string>();
let timer: number | undefined;

export function persist(key: string) {
    dirty.add(key);
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
        const batch = [...dirty];
        dirty.clear();
        await storage.setMany(batch.map((k) => [k, snapshot(k)]));
    }, 500);
}

// state/player.actions.ts
defineFn('setActiveChannel', (ch: Channel) => {
    setValue('player.active', ch);
    setValue('player.zapHistory', pushCapped(get('player.zapHistory'), ch.id, 20));
    persist('player.active');
    persist('player.zapHistory');
});
```

### 6.4 Spektrum state as the channel cache — instant session restore

The point of state caching: on boot, the last session's channel (a
denormalized snapshot: name, stream URL, logo, group) is rehydrated into
Spektrum state _before_ any playlist loads. The UI renders it immediately and
it is playable; the full list streams in behind it.

```ts
// main.ts boot order
const storage = await createStorage();
const saved = await storage.getMany([
    'settings',
    'player.active',
    'player.zapHistory',
    'favorites',
]);
for (const [key, value] of saved) if (value !== undefined) setValue(key, value);
run(); // bind DOM — last channel + favorites visible NOW
void loadActiveSource(); // heavy path: cached rows (full tier) or re-parse
```

On the partial/none tiers this is what keeps the app feeling instant: the
snapshot rows (active channel, zap history, favorites) are small enough for
localStorage and carry everything needed to render and play.

### 6.5 Lazy engine selection — the browse UI never pays for players

```ts
// player/select-engine.ts
export async function selectEngine(url: string): Promise<PlayerEngine> {
    const u = url.split('?')[0].toLowerCase();
    if (u.endsWith('.m3u8')) {
        if (nativeHlsSupported()) return new NativeEngine(); // Safari
        const { HlsEngine } = await import('./engines/hls'); // its own chunk
        return new HlsEngine();
    }
    if (u.endsWith('.ts')) {
        const { MpegtsEngine } = await import('./engines/mpegts');
        return new MpegtsEngine();
    }
    return new NativeEngine(); // mp4/webm/unknown
}
```

### 6.6 Conditional refresh — let `304` skip the whole parse

```ts
async function refreshPlaylist(src: PlaylistSource) {
    const headers: Record<string, string> = {};
    if (src.etag) headers['If-None-Match'] = src.etag;
    else if (src.lastModified) headers['If-Modified-Since'] = src.lastModified;

    const r = await http.get(src.url, { headers });
    if (r.status === 304) return { unchanged: true }; // no parse, no writes
    await parseInWorker(await r.text(), src.id); // chunked, §5.10
    await storage.updateSource(src.id, {
        etag: r.headers.get('etag') ?? undefined,
        lastModified: r.headers.get('last-modified') ?? undefined,
        lastRefresh: Date.now(),
    });
}
```

### 6.7 Now/next lookup — binary search the sorted program index

Per channel, programs are stored sorted by start time. Now/next for the
visible slice is 40 binary searches per tick — microseconds, no index rebuild.

```ts
export function nowNext(programs: EpgProgram[], now: number) {
    let lo = 0,
        hi = programs.length - 1,
        idx = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (programs[mid].start <= now) {
            idx = mid;
            lo = mid + 1;
        } else hi = mid - 1;
    }
    const cur = idx >= 0 && programs[idx].stop > now ? programs[idx] : undefined;
    return { now: cur, next: programs[idx + 1] };
}
```

### 6.8 Xtream URL construction — one module owns every URL shape

Ported from thunder-tv's `xtream-url.service.ts`; nothing else in the app
string-concatenates provider URLs (that is how credential-leaking log lines
happen).

```ts
const api = (s: XtreamSource, action: string, extra = '') =>
    `${s.url}/player_api.php?username=${encodeURIComponent(s.user)}&password=${encodeURIComponent(s.pass)}&action=${action}${extra}`;

export const liveStreamUrl = (s: XtreamSource, id: number, ext = 'm3u8') =>
    `${s.url}/live/${encodeURIComponent(s.user)}/${encodeURIComponent(s.pass)}/${id}.${ext}`;
// vod: `${s.url}/movie/user/pass/${id}.${containerExt}`
// series episode: `${s.url}/series/user/pass/${episodeId}.${containerExt}`
// Log these ONLY through the redacting logger (Phase 23).
```

### 6.9 Chunked worker protocol — typed on both sides

```ts
// m3u/worker-protocol.ts — imported by worker AND main thread
export type WorkerIn = { type: 'parse'; text: string; sourceId: string };
export type WorkerOut =
    | { type: 'progress'; parsed: number }
    | { type: 'chunk'; rows: Channel[]; done: boolean }
    | { type: 'summary'; total: number; groups: GroupMeta[] }
    | { type: 'error'; message: string };
// Main thread: write each chunk to the storage tier as it arrives, update a
// Spektrum progress value; publish the list window only on 'summary'.
```

### 6.10 The import-map swap — CDN on web, vendored when packaged

```html
<!-- index.html (web / GitHub Pages) -->
<script type="importmap">
    { "imports": { "spektrum": "https://unpkg.com/spektrum@1.1.0/spektrum.min.js" } }
</script>
```

```js
// scripts/package-target.mjs — run before electron-builder / ares-package:
// rewrites the built dist/index.html import map to the local copy.
html = html.replace(/"spektrum":\s*"[^"]+"/, '"spektrum": "./vendor/spektrum.min.js"');
```

Old TV browsers (< Chromium 89) get `es-module-shims` injected in the webOS
package only — the web build assumes evergreen browsers.

---

## 7. Standing conventions

- **TypeScript files ≤ 300 lines** (hard max 400, ESLint-enforced). Split
  before you exceed, not after.
- **Motion is allowed, and gated.** The original "no CSS transitions or
  animations" ban is retired; use motion where it carries meaning, always
  behind `prefers-reduced-motion` (`base.css`). What has *not* changed is the
  reason the ban existed: never animate anything on the channel-list scroll
  path.
- **No direct platform APIs outside `src/core/`** (`fetch`, `indexedDB`,
  `localStorage`, file inputs) — ESLint `no-restricted-globals` fences.
- **Workers parse; the main thread queries memory; storage persists.** Never
  blur these roles.
- **Credentials:** fragment-only in URLs, redacted in every log line, never in
  exception messages.
- **English strings via the central strings module** — hardcoded UI literals
  are a review reject (keeps i18n possible without committing to it).
- **Every phase updates its own phase file** (checkboxes + decision notes) in
  the same branch as the code.
