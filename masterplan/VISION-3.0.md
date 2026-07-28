# ThunderTV 3.0 — The Horizon Star

> A BHAG: Big Hairy Audacious Goal. Not a roadmap, not a backlog, and
> deliberately not achievable with the current architecture. A roadmap tells
> you the next step; a horizon star tells you which direction the steps
> should point.
>
> If this document is comfortable, it is wrong.

---

## The goal

> ## Make any IPTV subscription indistinguishable from a premium streaming service — with no server, ever.

Not "a good IPTV player." Not "Netflix for M3U." Something stranger and
harder: **a client so intelligent about television that the difference between
a €5/month grey-market playlist and a €20/month studio product disappears at
the glass** — while the app remains a static bundle of files with no backend,
no account, no telemetry endpoint, and nothing to shut down.

Every product that has solved catalog quality has solved it with a server.
Netflix has an ingest pipeline. Plex has a metadata service. Every IPTV app on
every store is a thin client over someone else's index. **ThunderTV 3.0 asserts
that the server was never the point — the index was.** And an index can live on
the device that needs it.

---

## Why this is nearly impossible

Because of the material. An IPTV subscription is not a catalog; it is
**90,000 rows of debris**:

```
NL| SBS 6 FHD ᴴᴰ                  4K NL: SBS6 (BACKUP 2)
nl sbs6 hd                        ##### NEDERLAND VOD #####
NL SBS 6 ᶠʰᵈ [MULTI]              SBS.6.nl
```

Six rows. One channel. Three of them are dead. One is 480p mislabelled as 4K.
None carries a `tvg-id` that matches any EPG. The provider will renumber every
`stream_id` next Tuesday without warning.

Today the user does this archaeology by hand, alone, over and over, and starts
from zero when they switch devices or providers. **Every ThunderTV user is
independently rediscovering the same facts about the same broken streams, and
none of that knowledge survives.**

3.0's bet: that knowledge is the product, it can be computed on-device, and it
can travel between people without ever touching a server we run.

---

## The five pillars

### I. The Resolver — television, understood

**Every stream resolves to a canonical entity, offline, in under a second, across 90,000 rows.**

Not fuzzy string matching — the current `src/search/fuzzy.ts` is a good
implementation of the wrong primitive for this. Semantic identity: an embedded
quantized model plus a compiled knowledge base that knows `NL| SBS 6 FHD ᴴᴰ`,
`sbs6 hd`, and `SBS.6.nl` are one broadcaster, that `Опенгеймер (2023)` and
`Oppenheimer 4K` are one film, and that `S02E07` and `2x07` and
`- Episode 7 -` are one episode of one series.

Everything downstream becomes trivial once identity exists: deduplication
becomes a group-by. EPG mapping stops depending on providers setting `tvg-id`
correctly — which they do not. Variants (SD/HD/FHD/4K, backup feeds) collapse
into one row with a quality selector. Cross-provider merge becomes possible:
two subscriptions, one library, no duplicates.

*Why it's hard:* it must run on a 2019 LG TV with 1.5 GB of RAM and no WebGPU,
inside a static bundle, entirely offline, over ten languages and three scripts,
in under a second, without breaking the 60 kB budget.

### II. Liveness — know before you click

**A dead stream is never rendered.**

The single largest quality gap between IPTV and streaming is not resolution or
catalog size. It is that **a third of what you click does not play**, and you
only learn that after the buffering spinner has had its ten seconds.

3.0 treats stream health as a continuously-estimated, decaying property of
every row: passive signal harvested from your own playback (time-to-first-frame,
rebuffer ratio, actual resolution vs. claimed, silent audio, frozen frames),
plus opportunistic background probing of neighbours during idle time, plus
whatever the Codex (III) brings from other devices.

The channel list shows what works. Variant selection picks the healthiest feed
automatically. A failing stream fails over mid-watch to a sibling variant
**without the user noticing** — the health model already knows which one to
reach for.

*Why it's hard:* honest probing without hammering the provider into rate-
limiting you or flagging the account. The health model has to be right often
enough to trust, and wrong cheaply enough to recover.

### III. The Codex — network effects with no network

**The hardest and most important pillar. This is the one that makes 3.0 a BHAG rather than a feature list.**

Everything the app learns — identity mappings, health history, EPG corrections,
curation, artwork — is a **signed, versioned, mergeable, human-readable artifact**
that the user owns outright. Not a cache. Not a sync account. A file.

A Codex can be exported to a USB stick, pasted into a gist, dropped in a shared
folder, handed device-to-device over the LAN, or embedded in a `#/connect`
bookmark. Two Codexes **merge deterministically** — CRDT semantics, conflict
resolution by evidence weight and recency, cryptographic provenance on every
claim so a bad contributor can be pruned retroactively without unpicking the
rest.

The consequence is the audacious part: **collaborative curation with no
collaboration server.** A family shares one Codex and everyone's channel list is
correct. A community publishes a Codex for a popular provider and a thousand
strangers get a clean 90,000-row catalog on first import — with no service to
operate, no account to create, nothing to subpoena, and nothing to shut down.
The knowledge outlives us; it lives in files the users hold.

*Why it's hard:* CRDT merge over a 90,000-entity graph on a TV. A trust model
that resists poisoning without a central authority. Making "here, take my
Codex" as easy as sending a link — which is a design problem far harder than
the cryptography.

### IV. The Continuum — time as an axis, not a mode

**Live, catch-up, recording, VOD, and resume are one navigable timeline.**

Today they are five separate concepts with five UIs. In 3.0 there is one
gesture — scrub — and it works everywhere. Scrub back from live into catch-up
without changing views. A programme you missed sits on the same axis as the
film you paused, at the same distance from your thumb.

"What's on" stops being a grid you read and becomes a question the app answers:
*this is what you'd want right now* — computed on-device from watch history,
never uploaded, because there is nowhere to upload it to.

*Why it's hard:* catch-up is a per-provider dialect of undocumented URL
templates. Unifying them behind one timeline means being right about a dozen
incompatible conventions, and degrading gracefully on the eleven providers that
implement none of them.

### V. One brain, every screen

**The same core, from a phone browser to a 2019 TV, with real handoff.**

The platform adapter already proves the architecture can do this. 3.0 finishes
it: true spatial D-pad navigation as a first-class input model rather than a
keyboard emulation; a 10-foot layout that is the same code as the 2-foot one;
and **session handoff over the local network only** — stand up in the living
room, open your phone, the episode continues at the frame you left, with the
Codex riding along.

No cloud in the path. Devices you own, talking on a network you control.

---

## The invariants

A BHAG needs constraints that cannot be traded away, or it degrades into a
feature list. These are the terms of the bet:

| Invariant | Number | Why it is non-negotiable |
| --- | --- | --- |
| **Static forever** | 0 servers, 0 accounts, 0 telemetry endpoints | The moment a backend exists, the project becomes something someone can take away. |
| **Cold start** | < 1 s to an interactive, restored session | Measured on the slowest supported TV, not a MacBook. |
| **Scale** | 90,000 rows, ≤ 40 DOM nodes, 60 fps | Already the standing bar. It does not move up because 3.0 got clever. |
| **App payload** | ≤ 60 kB gz, Resolver included | The Resolver must earn its bytes or ship as a lazy chunk. |
| **Privacy** | Nothing leaves the device unless the user hands over a file | The Codex is shared by explicit human act, never by sync. |
| **Offline** | Full function with the network gone, except playback | The index is local. Losing the internet loses streams, not the app. |

## The anti-goals

Naming what 3.0 refuses is as load-bearing as naming what it pursues:

- **No account. No cloud sync. No "sign in to continue."** The Codex is a file.
- **No hosted metadata service**, not even a free one. The moment there is a
  service, there is a thing to shut down, and pillar III is a lie.
- **No content hosting, no aggregation, no discovery of sources.** ThunderTV
  organises what a user already has access to. It never becomes the index of
  where to get it.
- **No telemetry.** Not anonymised, not opt-in. There is nowhere to send it.
- **No engagement metrics as a goal.** Success is the user finding what they
  wanted and the app getting out of the way — which looks like *less* time in
  the UI, not more.

---

## Would we know if it worked?

Vague visions cannot fail, which is why they are useless. Concrete tests:

1. **The 90,000 test.** Import a raw provider dump. Within 60 seconds, without
   a single user action, the Live list shows a clean, deduplicated,
   EPG-matched, dead-stream-free catalog. Today this takes a determined user
   an evening, and it does not survive a device change.
2. **The stranger test.** A user imports a provider they have never used, on a
   device that has never seen it, with a community Codex — and it is
   immediately correct.
3. **The click test.** 99% of clicked streams play within 2 seconds. Today,
   informally, it is nearer 70%.
4. **The grandmother test.** Someone who has never heard the words "M3U",
   "Xtream", or "tvg-id" uses it for a month and never encounters any of them.
5. **The unplug test.** Pull the ethernet cable. Everything except playback
   still works — catalog, guide, search, curation, resume.
6. **The disappearance test.** This repository goes offline tomorrow. Every
   installed copy keeps working, and every Codex keeps merging, forever.

Test 6 is the one that matters most. It is the difference between a product and
an artifact.

---

## What has to become true

Honest accounting of the gap between here and there:

- **A state architecture that can hold a knowledge graph.** Today the app has
  two state systems — Spektrum keys and ~40 undeclared module singletons
  ([`AUDIT.md`](./AUDIT.md) §4.4) — and neither can model an entity graph with
  provenance. The Resolver needs a real local store with indexes and
  transactions. This is the largest single rewrite 3.0 implies.
- **An identity model where the app currently has strings.** `ChannelRow` is a
  parsed M3U line. 3.0 needs a `Work` and a `Feed`, with the row demoted to
  evidence *about* an entity rather than the entity itself.
- **A UI layer that can render surfaces we have not designed yet.** A single
  2,366-line `index.html` (§4.8) — which grew 29% across two merges — cannot host a
  poster wall, a timeline scrubber, a merge-conflict resolver, and a 10-foot
  layout. It has to be composable before those exist.
- **Delivery that measures itself.** 3.0 is many times the surface area of
  anything shipped so far, and the audit caught the project in the act: one
  merge simultaneously **fixed** its largest reachability defect and **widened**
  the performance budget breach from 12% to 20%, with CI reporting green for
  both. **A project that cannot feel a 6% payload regression cannot hold a
  60 kB budget through a semantic resolver.** [`UPGRADES.md`](./UPGRADES.md)
  U1 and U4 are therefore not bug fixes; they are the instruments this vision
  is flown on.

---

## The stepping stones

Each is independently valuable, ships on its own, and bends the codebase toward
the star. None of them requires believing in the whole vision.

| # | Stone | Pillar | Why it stands alone |
| --- | --- | --- | --- |
| 1 | **Entity model** — introduce `Work`/`Feed`; `ChannelRow` becomes evidence | I | Fixes variant handling and dedup properly, today |
| 2 | **Local knowledge store** — indexed, transactional, versioned; absorb the shadow state | I, III | Closes §4.4; unblocks everything after |
| 3 | **Passive health signals** — harvest what the player already knows | II | Immediate win: stop showing dead channels |
| 4 | **Codex v0** — export/import the identity map as a signed file | III | The `#/connect` bookmark idea (Phase 14), generalised |
| 5 | **On-device Resolver** — offline semantic matching, lazily loaded | I | Makes EPG mapping work without provider `tvg-id` |
| 6 | **Codex merge** — CRDT semantics, two devices | III | Family sharing; the hard half of pillar III |
| 7 | **Timeline scrubber** — catch-up + EPG + resume on one axis | IV | Unifies three UIs into one gesture |
| 8 | **Spatial navigation** — real D-pad model | V | Unblocks the webOS target that Phase 30 already assumes |
| 9 | **Handoff** — LAN-only session continuity | V | The moment 3.0 stops feeling like a web app |
| 10 | **Community Codex** — publish, discover, merge, prune | III | The network effect, with nothing to operate |

Stones 1–4 are achievable with the current architecture. Stone 5 is where it
stops being an IPTV player. Stone 10 is where it stops being ours and starts
being the users'.

---

## The one sentence

**Every ThunderTV user is independently rediscovering the same facts about the
same broken streams, and none of that knowledge survives. 3.0 makes it survive
— and makes it portable — without ever building a server to keep it in.**

That is almost certainly too hard. It is exactly the right direction.
