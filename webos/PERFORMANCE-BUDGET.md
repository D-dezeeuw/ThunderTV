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
| All eager JavaScript | 400 KiB | 100 KiB | Raw approximates TV parse work; gzip approximates web transfer. Includes the entry, every module preload, Spektrum, and its CSP registry. |
| Initial HTML | 300 KiB | 60 KiB | The application shell is intentionally authored in HTML and must stay bounded. |
| Initial CSS | 100 KiB | 25 KiB | Includes the normal bundle and `tv-mode.css` on webOS. |
| Total shell text | 800 KiB | 175 KiB | Combined upper bound for HTML, eager JS, and initial CSS. |
| Complete built app | 10 MiB raw | — | Install-footprint guard, including lazy decoders, fonts, icons, and splash art. |

These are release gates, not claims about an LG platform limit. A passing
build still needs profiling on the oldest supported physical TV for launch
time, memory pressure, stream playback, remote navigation, and suspend/resume.
