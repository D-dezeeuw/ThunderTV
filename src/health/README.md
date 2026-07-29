# Stream health (`src/health/`)

Which feeds actually play, learned from your own playback — Vision 3.0's
stone 3 ("a dead stream is never rendered"), landed in Phase 33.

The premise from `masterplan/VISION-3.0.md`: the biggest quality gap
between IPTV and streaming isn't resolution or catalog size, it's that a
third of what you click doesn't play, and you only find out after ten
seconds of spinner. This module is the cheapest honest version of fixing
that — no probing, no server, purely what the player already knows.

## Modules

| File            | Responsibility | Pure? |
| --------------- | -------------- | ----- |
| `stream-key.ts` | A stable, credential-free fingerprint for one feed. | Yes |
| `score.ts`      | The decaying evidence model: `recordSuccess`/`recordFailure`, `healthScore`, `isLikelyDead`, `compareForPlayback`. | Yes |
| `store.ts`      | The `streamHealth` table plus the synchronous in-memory mirror every consumer reads. | No — storage |

State-layer surface: `src/state/health.ts` (Settings readout counts) and
`src/state/health.actions.ts` (the forget button).

## Where the evidence comes from

Nothing here probes anything. Every observation is a by-product of playback
the user asked for:

- **Success + time-to-first-frame** — `src/player/stream-health.ts`'s
  monitor already sits on the `<video>` element for every engine, and
  already knows when the attach started. Its first `playing` event of an
  attach is the success signal. Only the *first* is counted: later ones are
  recoveries from a stall, and counting them would let a flaky stream
  outrank a solid one purely by stalling more.
- **Failure** — `src/state/player.actions.ts`'s `reportPlaybackError()`, the
  single funnel every engine's fatal path already goes through. Recording
  there means no engine needs its own health wiring.

A failure is ignored once the attach has already produced a picture: a
stream that played for twenty minutes and then dropped is not the same
evidence as one that never started, and treating them alike would punish
long viewing sessions.

## Why the key is not the URL

An Xtream stream URL embeds the account's username and password in its path
(`{base}/live/{user}/{pass}/{id}.ts`). This data is persisted, and is a
Codex export candidate (stone 4) — storing raw URLs would put credentials
in a file users are encouraged to share. `streamKey()` masks the credential
segments and credential-shaped query parameters instead.

That choice pays for itself twice: the key also **survives a password
rotation**, so a feed keeps its accumulated history instead of silently
starting from zero the day the provider resets the account.

## The model, and its deliberate limits

Evidence decays with a one-week half-life — long enough to remember a truly
dead stream across sessions, short enough to believe a provider fixing
something within a day or two. A feed with *no* evidence scores `null`, not
zero: "never tried" and "always fails" must never rank the same, or every
channel the user hasn't clicked yet would look broken.

**Health is advisory everywhere it is used.** A likely-dead row gets a
marker (`ChannelRow.unhealthy`, rendered as a small warning glyph) and
sorts last among a channel's variants — it is never removed from the list.
The model is a guess from a handful of samples; being wrong has to cost the
user one click, not a channel they can no longer find. That is why there is
no automatic hiding, and why the Settings surface offers *forget* rather
than *rebuild* (health can only be relearned by actually playing streams —
a "refresh" button would be lying).

## Not built here

- **Opportunistic background probing** of neighbouring streams during idle
  time (the vision's other health input). Doing it politely, without
  tripping a provider's connection cap or flagging the account, is a real
  design problem — and the passive signal above costs nothing and carries
  no such risk, so it comes first.
- **Automatic mid-watch failover** to a healthier variant. The ranking that
  would drive it now exists (`compareForPlayback`); the failover mechanism
  itself belongs with the player's engine chain, not here.
