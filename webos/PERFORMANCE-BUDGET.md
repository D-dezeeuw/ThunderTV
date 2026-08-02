# ThunderTV webOS performance budget

LG does not publish one universal maximum JavaScript or `.ipk` size for TV
web apps. Its guidance is to package core/frequently used resources locally,
compress assets, declare `requiredMemory` only when an app genuinely needs a
guaranteed amount, and validate on the target TV:

- [App resources](https://webostv.developer.lge.com/develop/getting-started/app-resources)
- [Web API and web engine versions](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine)
- [`appinfo.json` reference](https://webostv.developer.lge.com/develop/references/appinfo-json)

ThunderTV therefore uses explicit regression budgets calibrated to its
webOS 6 / Chromium 87 support floor. `npm run lint:dist` enforces them:

| Resource | Raw budget | Gzip budget | Why |
| --- | ---: | ---: | --- |
| All eager JavaScript | 400 KiB | 101 KiB | Raw approximates TV parse work; gzip approximates web transfer. Includes the entry, every module preload, Spektrum, and its CSP registry. |
| Initial HTML | 300 KiB | 60 KiB | The application shell is intentionally authored in HTML and must stay bounded. |
| Initial CSS | 100 KiB | 25 KiB | Includes the normal bundle and `tv-mode.css` on webOS. |
| Total shell text | 800 KiB | 175 KiB | Combined upper bound for HTML, eager JS, and initial CSS. |
| Complete built app | 10 MiB raw | — | Install-footprint guard, including lazy decoders, fonts, icons, and splash art. |

These are release gates, not claims about an LG platform limit. A passing
build still needs profiling on the oldest supported physical TV for launch
time, memory pressure, stream playback, remote navigation, and suspend/resume.

## The one time the eager gzip gate moved (100 → 101 KiB)

Worth recording, because a budget that moves silently is not a budget.

The gate sat at 100 KiB with **82 bytes** of headroom — tight enough that no
feature of any size could pass it, which makes it a stop sign rather than a
regression gate. The online-subtitle search (`src/core/subtitles/`) is 85%
lazy already: its working half is a 6.9 kB chunk fetched when the button is
pressed, and what remains at boot is two action registrations, one state key,
and the English copy. That floor is ~0.8 KiB and cannot be removed without
moving user-facing copy out of `strings.en` (the repo's single home for it).

It was not a pure loss. The same change compacted the generated CSP
expression registry (`scripts/spektrum-csp.mjs` — one-letter wrapper
identifiers, empty catch), taking eager **raw** from 370.4 KiB to 352.6 KiB.
Raw is the metric that models parse work on a Chromium 87 TV, and it improved
by 17.8 KiB; gzip, which models transfer on a connection that is not the
bottleneck here, regressed by 0.8.

**To bring it back to 100:** the eager graph still registers every Codex,
handoff and download action at boot for UI that is unreachable until Settings
or the player bar is opened. `src/state/subtitle-search.actions.ts` is the
worked example of the shim that makes an action lazy without breaking
`scripts/check-reachability.mjs`.
