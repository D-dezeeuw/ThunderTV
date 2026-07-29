# Handoff (`src/handoff/`)

Carrying a session to another screen — Vision 3.0's stone 9, landed in
Phase 38.

The vision: *"stand up in the living room, open your phone, the episode
continues at the frame you left, with the Codex riding along. No cloud in
the path."*

## Modules

| File         | Responsibility |
| ------------ | -------------- |
| `session.ts` | What a handoff *is* — the payload, its validation, and how stale is too stale. |
| `link.ts`    | How it travels: base64url in a URL fragment. |
| `resolve.ts` | Building one from what is playing, and turning one back into something playable. |

Position tracking lives in `src/player/position.ts` — it sits on the
`<video>` element beside `stream-health.ts`, because that is the one place
every engine converges. State surface: `src/state/handoff.ts` /
`handoff.actions.ts`.

## The transport, stated honestly

The stone is named "LAN-only session continuity", and **the LAN half is not
built.** A static page in a browser cannot do it: there is no listening
socket, no mDNS, no way to be discovered by a peer, and WebRTC needs a
signalling server — the exact thing the "static forever, 0 servers"
invariant forbids. A real LAN transport needs a host that can listen, which
means the Electron main process. That is the seam it should land behind when
it is built; nothing here pretends it already exists.

What *is* built is the part every host can do, and it is not a consolation
prize: the session travels in a URL fragment the user hands over themselves.
Everything after `#` stays in the browser — never in a request, never in a
proxy log — which for a payload describing what someone is watching is the
difference between a private handoff and a broadcast one. It also works
between two devices that cannot see each other on any network at all, which
the LAN version by definition cannot.

## The rule the format exists to keep

**A handoff never carries a stream URL.** Every provider URL in this app has
the account's username and password in its path, and a handoff link will end
up in a chat app, a note, or a browser history. So a session names the feed
by `src/health/stream-key.ts`'s masked fingerprint — the same
credential-free identifier the Codex uses — and the receiving device
resolves it against its own copy of the source.

The consequence is deliberate: **a handoff only works on a device that
already has that source configured.** It cannot hand someone an account they
do not have, and it is not a sharing mechanism. `sessionFor()` returns
`null` rather than guessing when the masker does not recognise a URL, on the
principle that a URL it cannot parse is one it cannot promise to have
cleaned.

## Why the masked key and not the channel id

`makeChannelRowId()` is `playlistId:index` — a *position in a parse*. Two
devices that imported the same playlist a week apart disagree about it the
moment the provider reorders a row, and the handoff would then resume the
wrong programme with no way to notice. The masked key survives both
reordering and a password rotation, which is exactly why Phase 33 derived it
that way. Name matching is the last resort, for a provider that has
re-pathed its whole catalog.

## Resume is one mechanism, not two

An arriving handoff writes its position into the same store a local resume
reads (`src/player/position.ts`), so the engine has no "this one came from
elsewhere" branch. That store is also what gives ordinary local resume for
free — a thing the app simply did not have before this phase, and without
which "continues at the frame you left" was not implementable at all.

Positions are recorded only for seekable media with a finite duration. A
live feed's `currentTime` is an offset into whatever the buffer holds, not a
place in a programme, and storing it would produce a number that means
something different every time it is read.
