# ThunderTV release checklist

Use this for a real release, not for every small push. GitHub's `CI`
workflow runs only when dispatched manually or when a `v*` tag is pushed;
the expensive desktop packaging matrix is manual-only.

## Automated gates

- Use Node 22.13 or newer.
- Run `npm ci --no-audit --no-fund`.
- Run `npm run verify`.
- Run `npm run bench:m3u`.
- Build and validate the webOS variant with `npm run build:lg` when LG's
  `ares-package` is installed.
- When dependencies change, run `npm audit` deliberately and review the
  vendored Spektrum hash.

## Browser smoke

- Complete first run through file, paste, M3U URL, and Xtream paths.
- Reload and confirm sources, settings, favorites, recent items, and resume
  positions persist.
- Exercise Live, Radio, Movies, Series, Guide, downloads, search, dialogs,
  keyboard navigation, and reduced-motion mode.
- Confirm DevTools reports no CSP violations during boot and navigation.
- Confirm HTTP, CORS/mixed-content, offline, bad-auth, storage-demotion, and
  player-failure messages are actionable.

## Electron smoke

- Package Linux; package Windows/macOS only when the manual workflow's
  `full_matrix` input is selected.
- Confirm renderer sandbox/isolation, popup/navigation denial, fullscreen,
  embedded proxy, and diagnostics.
- Download, cancel, retry, overwrite a chosen destination, and confirm no
  `.part` file remains after cancellation or failure.
- Decide signing/notarization for the intended audience before distribution.

## LG webOS smoke

- Test the oldest supported physical TV (webOS 6 / Chromium 87 floor), not
  only an emulator.
- Verify cold launch, D-pad focus, Back, 1080p layout, text-size mode,
  suspend/resume, storage persistence, and low-memory recovery.
- Play native, HLS, and MPEG-TS examples and exercise subtitles/audio tracks.
- Inspect startup for CSP errors and compare launch/memory behavior with
  `webos/PERFORMANCE-BUDGET.md`.

## Release

- Confirm package, desktop, webOS, and exported-settings versions agree.
- Review release notes and known limitations; connect bookmarks remain
  deliberately de-scoped from v1.
- Run the manual desktop workflow if installers are needed.
- Create the `v<version>` tag only after the relevant smoke rows pass.
