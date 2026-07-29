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
| `apply.ts`   | Verifying and merging an imported document. |

State surface: `src/state/codex.ts` (feedback) and `codex.actions.ts` (the
export/import buttons).

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

## v0's merge rule, and why it is not yet a CRDT

- **identity** — newest observation wins per channel key, and a local
  mapping *newer* than the imported claim is left alone. Importing a Codex
  must never undo something this device has since re-derived.
- **health** — the maximum of each side's decayed weights, not a
  replacement. Two people's independent evidence about the same feed
  genuinely is more evidence, and replacing would discard whichever half
  arrived first.

This is not convergent: import order can still matter in edge cases. Real
CRDT semantics — merge by evidence weight with provenance per claim, so two
devices agree regardless of order — is stone 6 (Phase 36). What v0
guarantees is that the *shape* it reads and writes is the shape that merge
will need (every claim carries its own `observedAt` and is addressed by a
stable key, never by array position), so adopting it is not a format break.

## Format versioning

`format: 1` is checked strictly on import — a document from a future format
is rejected rather than partially understood. Validation is deliberately
strict about *types* and lenient about *values*: an unfamiliar `method`
string or country token is fine (a newer or third-party Codex may know
things this build does not), but a wrong type is a corrupt file.
