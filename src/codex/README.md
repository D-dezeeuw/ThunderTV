# The Codex (`src/codex/`)

What this device has worked out, as a file the user owns — Vision 3.0's
stone 4, landed in Phase 34.

The vision's framing: everything the app learns should be *"a signed,
versioned, mergeable, human-readable artifact that the user owns outright.
Not a cache. Not a sync account. A file."* This module is v0 of that file.

## Modules

| File         | Responsibility |
| ------------ | -------------- |
| `format.ts`  | The document shape, canonical (key-sorted) serialization, and structural validation of an untrusted file. |
| `signing.ts` | ECDSA P-256 via WebCrypto: this device's identity, signing, verification, author fingerprints. |
| `build.ts`   | Collecting local knowledge into a document. |
| `merge.ts`   | The CRDT join — every *ordering* decision lives here. |
| `trust.ts`   | How much of a stranger's file to believe — every *weight* decision lives here. |
| `blocklist.ts` | Who this device has stopped believing. |
| `knowledge.ts` | The storage boundary: read local state into claim shape, write merged claims back. |
| `apply.ts`   | One document in: parse → verify → trust → join → commit. |
| `library.ts` | Following published Codexes: fetch, retain, refresh, rebuild. |

State surface: `src/state/codex.ts`/`codex.actions.ts` (export/import) and
`codex-library.ts`/`codex-library.actions.ts` (subscriptions and trust).


## What a Codex contains — and what it must never contain

Two claim kinds today:

- **identity** — which provider channel key maps to which EPG catalog id
  (Phase 31's matcher output).
- **health** — how well each feed actually plays (Phase 33's decayed
  evidence).

Both are credential-free **by construction, not by redaction**: identity
claims are catalog ids and normalized names with no URL anywhere, and
health is already keyed on `src/health/stream-key.ts`'s masked fingerprint.

**This is the constraint to preserve.** Favorites, sources and recents are
deliberately excluded, and must stay excluded, because they carry raw
stream URLs with the account's username and password in the path. A file
the product actively encourages people to hand around cannot be one
password rotation away from leaking an account. Anything added to
`build.ts` later has to clear that bar first.

## What the signature does and does not prove

It proves a Codex has not been altered since whoever holds that key wrote
it, and that two files carrying the same author id came from the same
keypair. **It proves nothing about whether that author is right or worth
believing.** The UI copy says exactly this, and it should stay that way:
presenting a valid signature as "verified" would claim a trust property
the cryptography does not provide. The trust model — evidence weight,
retroactive pruning of a bad contributor — is stone 10.

A file that fails verification is rejected outright rather than imported
with a warning, because an unsigned or tampered Codex has no author to
hold responsible, which is precisely what that future pruning depends on.

The private key never leaves the device: nothing exports it, and no
document contains it (there is a test asserting the JWK's private `d`
parameter is absent from an exported file).

## The merge rule (Phase 36, stone 6)

`merge.ts` is a CRDT: the merge function is a **join**, so it is
commutative, associative and idempotent. That is not decoration — those
three properties are exactly what makes import order stop mattering, which
is what lets people trade Codexes with no server, no sync protocol and no
coordination and still end up agreeing. All three are asserted directly in
`merge.spec.ts` against randomised claim sets.

- **health** is grow-only in every component: weights and `observedAt` join
  with `max`, `ttffMs` with `min` over the measurements that exist, and the
  contributing authors with set union. Nothing anyone learned is ever
  erased. It deliberately does not *sum* — summing is neither idempotent
  (re-importing the same file would inflate it) nor honest.
- **identity** is a last-writer-wins register over a *total* order:
  `(observedAt, method strength, method, authorId, catalogId)`. A local
  mapping newer than the imported claim still wins, so importing never
  undoes something this device has since re-derived.

Two things that look like over-engineering and are not, both caught by the
randomised sweep rather than by inspection:

- The comparator has to be total **over the claims**, not just their
  metadata. Two claims naming different `catalogId`s with otherwise equal
  fields compared 0, and "keep whichever is already in the map" put import
  order straight back in.
- `ttffMs` cannot use "the newest observation's value, or the other side's
  if it has none". That rule is commutative but **not associative** — the
  fallback lets a merged value carry a startup time that outranks a
  genuinely newer null, and which one survives depends on the merge order.

## Provenance, and what pruning can actually do

Merged claims carry who contributed them, persisted alongside the data the
app already reads (`streamHealth` rows gain `authors`, mapping entries gain
`observedAt`/`authorId`) rather than in a parallel store. `'local'` stands
for this device's own observations; it can never collide with a real author
id, and it never leaves the device — an exported claim is attributed to
whoever signs the file, which is all a single-signature format can honestly
say.

`pruneAuthors()` operating on merged knowledge alone is therefore **exact
for identity and best-effort for health**. An identity claim has one author,
so dropping theirs is clean. A health claim several people contributed to
keeps its `max`-joined weights, which cannot be unwound from the merged
value.

That is why `library.ts` retains every document it fetches. Pruning does not
try to subtract; it **rebuilds** — start from this device's own evidence
(`streamHealth.local`, maintained by `observe()`) and re-fold the Codexes
the user still trusts. The result is not a repair, it is the exact state
this device would have had if the pruned author's file had never existed,
and it is only correct because the join is associative.

## Following published Codexes (Phase 37, stone 10)

Four verbs, and only three of them are code.

**Publish** is deliberately not implemented. A Codex is already a signed
JSON file; publishing means putting it somewhere with a URL. Building an
upload path would mean operating the service this entire pillar exists to
avoid, and would fail the vision's disappearance test the day it stopped
being paid for.

**Discover** is a list of URLs the user chose, re-checked once a day —
conditional on ETag, sequential, spaced, TTL-gated, exactly as
`src/epg/feed-fetch.ts` treats the upstream EPG feeds, and for the same
reason: these are other people's servers.

**Merge** is `merge.ts` bounded by `trust.ts`. **Prune** is the rebuild
above.

## The poisoning vector, and what closes it

Phase 36's grow-only join is right between people who trust each other and
wrong on a file published to strangers: a hostile Codex can claim
`failWeight: 1e9` for a competitor's feeds, and `max` never goes down.
Signature verification does not help — the file is *authentically* signed by
a liar.

`trust.ts` clamps **on ingest, never in the join**, so the lattice stays
pure and the rebuild stays exact:

- a remote claim contributes at most `REMOTE_WEIGHT_CEILING` to either
  weight, which — because the score is a ratio — means a feed the user has
  actually watched cannot be talked into looking dead, while a feed they
  have never tried still takes the community's word for it;
- `observedAt` is clamped to now, so nobody can date a claim into the future
  to freeze a record's decay or win every tie forever;
- blocked authors are dropped entirely.

Identity needs less defending than health because a poisoned mapping is
self-healing — the local matcher re-derives it on the next catalog refresh.
Health is accumulated evidence that cannot be recomputed from anything,
which is why the ceiling exists for one and not the other.

## Format versioning

`format: 1` is checked strictly on import — a document from a future format
is rejected rather than partially understood. Validation is deliberately
strict about *types* and lenient about *values*: an unfamiliar `method`
string or country token is fine (a newer or third-party Codex may know
things this build does not), but a wrong type is a corrupt file.
