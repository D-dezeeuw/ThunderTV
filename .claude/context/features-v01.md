# Feature ideas — v01

An idea backlog, not planned work: things that could enhance or expand the
viewer's experience with the app. Brainstormed 2026-08-02. Excludes work
already in flight at that date (search-all for movies/TV, free subtitles,
sources editing via the wizard, the AC-3/DTS desktop audio path, radio
search, Top 100 ordering) and recording, which was researched and
deliberately dropped (webOS has no storage story, the web version would be
hostage to tab lifetime and quotas, and most Xtream lines' one-connection
cap guts the "record another channel" case).

## Watching

1. **Catch-up / replay scrubber** — watch the last N days on channels with
   archive support; the URL groundwork (`src/m3u/catchup.utils.ts`) already
   exists. The app's biggest unbuilt promise.
2. **Picture-in-picture** — keep the stream in a floating mini-window while
   browsing other tabs or other apps.
3. **Channel zapping overlay** — up/down zap + number entry with a now/next
   banner, like a real TV remote experience.
4. **Last-channel toggle** — one key to bounce between the two channels you
   are switching between (classic remote behavior).
5. **Sleep timer** — stop playback after X minutes or at the end of the
   current programme.
6. **Multi-view mosaic** — 2–4 muted streams side by side for sports days
   (connection-limit-aware).
7. **Auto-failover mid-watch** — when a stream dies, silently jump to the
   healthiest variant; the health ranking exists (`src/health/`), the
   mechanism doesn't.
8. **Audio/subtitle track picker** — clean UI for multi-language streams.

## Guide & discovery

9. **Programme reminders** — "notify me when this starts," straight from
   the Guide.
10. **Follow a show** — star a *programme title*; it lights up anywhere it
    airs, on any channel.
11. **"On now" view** — what's playing right now across starred channels,
    grouped by genre.
12. **Prime-time jump** — one tap to tonight 20:00 in the Guide.
13. **Recently added shelf** — new movies/episodes since the last visit.
14. **Home dashboard** — continue-watching, starred now/next, and recents
    in one landing view.

## Organization & family

15. **Custom lineups** — user-made channel groups ("Sports weekend",
    "Kids"), drag to reorder.
16. **Parental controls** — PIN-locked groups and an adult-content filter.
17. **Profiles** — per-viewer lineups and resume positions (a kids profile
    being the obvious first).

## Cross-device

18. **Connect URLs** — bookmarkable setup links that onboard a new device
    in one paste (Phase 14, still unbuilt).
19. **PWA / installable app** — offline shell, home-screen icon (Phase 24,
    still unbuilt).
20. **QR handoff of the Codex** — move a whole setup to the TV by scanning
    a code.
21. **Chromecast / AirPlay casting.**

## Radio

22. **Now-playing song metadata** (ICY tags) on radio streams.
23. **Radio alarm & sleep timer** — wake to a station.

## Quality of life

24. **Media-session integration** — lock-screen/hardware media keys,
    artwork, now-playing in the OS.
25. **Stream stats overlay** — bitrate, codec, dropped frames, for
    diagnosing bad feeds.
26. **Theme options** — OLED-black, accent colors.
27. **Shortcut cheat-sheet** — `?` overlay listing every keyboard/remote
    binding.
28. **Viewing stats** — most-watched channels, hours per genre, purely
    local.
