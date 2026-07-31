# Phase 29 — Desktop Packaging & Distribution

> **Epic goal:** Turn the working Electron shell into installable, portable desktop artifacts for Windows, macOS, and Linux — built entirely locally, reproducible, size-disciplined, and documented down to the unsigned-app caveats.
> **Verification:** `npm run package` produces `thundertv-<version>-<os>-<arch>` artifacts on the locally-buildable targets with the vendored-Spektrum swap verified inside the packaged `app.asar`; each artifact passes the per-OS manual QA checklist; a rehearsal 0.x GitHub release with artifacts, checksums, and changelog exists — created with zero GitHub Actions.
> **Status:** `shipped` · tracker: `not-maintained` — `electron-builder.yml` plus per-OS `package:*` scripts and `package-target.mjs`'s import-map swap. Code signing and an auto-update story are deliberately absent rather than missed: `publish: null` and the file's own header record the "built and uploaded by a human, never auto-published" decision, per this phase's zero-Actions rule.

Before this phase the Electron shell runs from a local build directory (Phase 28) but nothing is installable and nothing is published. After this phase electron-builder produces Windows portable+NSIS, macOS DMG, and Linux AppImage artifacts through a pipeline that bakes in the `scripts/package-target.mjs` import-map swap; icons, metadata, size budgets, a documented (deliberately unsigned) signing posture, a manual update story, a no-telemetry diagnostics posture, per-OS QA, and a rehearsed manual release procedure are all in place — leaving Phase 30 to add the TV target and cut 1.0.

## Feature 29.1 — electron-builder configuration

electron-builder is configured for exactly three OS targets and nothing more — no publish config, no auto-anything: releases are files produced on a local machine and uploaded by a human.

- [ ] **29.1.1** Add electron-builder — pinned devDependency with configuration in `electron-builder.yml`; the config-location decision noted in this phase file.
- [ ] **29.1.2** Targets — win: `portable` + `nsis`; mac: `dmg`; linux: `AppImage`; x64 first, arm64 where the local machine can actually build it — the honest matrix documented.
- [ ] **29.1.3** Files allowlist — only `dist/**`, `electron/dist/**`, and `package.json` enter the package; everything else excluded by default-deny.
- [ ] **29.1.4** No publish config — the `publish` field explicitly absent/null with a comment stating releases are manual local uploads, per the no-CI rule.
- [ ] **29.1.5** npm scripts — `npm run package` for all locally-buildable targets plus `package:win`/`package:mac`/`package:linux` variants.
- [ ] **29.1.6** Pre-pack guard — a `beforePack` hook fails the run unless the dist is freshly built and the import-map swap (Feature 29.2) has been applied.
- [ ] **29.1.7** Output layout — artifacts land in a gitignored `release/` directory with per-target subfolders.
- [ ] **29.1.8** NSIS specifics — per-user install, user-selectable directory, no custom scripts; the portable build verified to run zero-install from a folder.
- [ ] **29.1.9** Linux desktop metadata — category, `StartupWMClass`, and the generated `.desktop` entry verified correct in the AppImage.
- [ ] **29.1.10** First full run — build every locally-possible artifact, launch each, and record results and cross-build limitations in this phase file.

## Feature 29.2 — Import-map swap automation

The §6.10 swap — CDN Spektrum on web, vendored copy in packages — becomes an unforgettable pipeline step: wired into the packaging chain, self-verifying, and checked again inside the final artifact.

- [ ] **29.2.1** Pipeline order — `npm run package` chains `vite build` → `node scripts/package-target.mjs electron` → `electron-builder` as one script so the swap cannot be skipped.
- [ ] **29.2.2** Target argument — `package-target.mjs` takes `electron|webos` and applies target-specific rewrites (Electron: vendored Spektrum + packaged CSP; webOS additions arrive in Phase 30).
- [ ] **29.2.3** Idempotence — running the swap twice yields identical output and a fresh unswapped build always succeeds; both directions covered by the regex specs.
- [ ] **29.2.4** Post-swap assertion — the script greps the final `dist/index.html` for `unpkg`/`jsdelivr` origins and fails if any remain.
- [ ] **29.2.5** In-artifact verification — an `afterPack` hook lists the packaged `app.asar` and asserts the swapped `index.html` plus `vendor/spektrum.min.js` are present inside.
- [ ] **29.2.6** Vendored-hash check — the swap verifies `public/vendor/spektrum.min.js` SHA-256 against the expected hash recorded beside the version pin.
- [ ] **29.2.7** Dist-only writes — the swap mutates only `dist/`, never the source `index.html`; a guard errors if pointed at the source tree.
- [ ] **29.2.8** Script specs — export the rewrite and verification functions from the `.mjs` and cover them with Vitest.
- [ ] **29.2.9** Web deploy unaffected — assert the `npm run deploy` path never invokes the swap, so the Pages build keeps its pinned CDN import map.
- [ ] **29.2.10** Documentation — a packaging README section explaining what the swap does, why packaged targets need it, and the failure modes it guards against.

## Feature 29.3 — App icons and metadata

The artifact identity work: one master icon derived into every per-OS format by a local script, and product metadata (appId, productName, copyright, version) flowing from a single source of truth.

- [ ] **29.3.1** Master icon — a 1024×1024 source (SVG plus exported PNG) committed under a `build/icon/` directory.
- [ ] **29.3.2** Derivation script — `scripts/gen-icons.mjs` generates `icon.icns` (mac), `icon.ico` (win), and the Linux PNG set from the master; regenerable, never hand-managed.
- [ ] **29.3.3** appId and productName — a stable reverse-DNS `appId` and productName "ThunderTV" set in the builder config, with a note that changing appId later breaks userData continuity.
- [ ] **29.3.4** Version single-source — electron-builder reads the version from `package.json`; a verify-time grep asserts no duplicated version string exists anywhere else.
- [ ] **29.3.5** Legal fields — copyright line, author, and homepage filled; Linux maintainer metadata set for the AppImage.
- [ ] **29.3.6** Runtime window icon — the `BrowserWindow` icon wired for unpackaged Linux dev runs, where the builder can't help.
- [ ] **29.3.7** About surface — the in-app About/Settings area shows productName and the version read via the bridge (`app.getVersion()`); no hardcoded version strings in the UI.
- [ ] **29.3.8** No file associations — deliberately skip `.m3u` association for v1; decision and revisit condition noted in this phase file.
- [ ] **29.3.9** macOS extras — `Info.plist` category (entertainment/video) and the minimum macOS version implied by the Electron release documented.
- [ ] **29.3.10** Small-size QA — check the icon renders legibly at 16/32 px in taskbars and file managers; adjust padding and regenerate if muddy.

## Feature 29.4 — Artifact size discipline

An app whose brand is "compact" cannot ship bloated installers: asar on, dev dependencies out, fixtures and tests excluded, and a per-artifact size budget enforced by the same budgets machinery as the web bundle.

- [ ] **29.4.1** Verify asar packaging — confirm the app loads fully from `app.asar`, explicitly including the Vite-emitted worker chunks (a classic asar gotcha).
- [ ] **29.4.2** Dependency audit — production dependencies should be near zero for a static app; verify `node_modules` contributes almost nothing to the package and demote anything misplaced to devDependencies.
- [ ] **29.4.3** Exclusion double-check — `test/`, `e2e/`, fixtures, `scripts/`, `masterplan/`, and source maps confirmed absent from the shipped artifact via an asar listing.
- [ ] **29.4.4** Per-artifact budgets — measured-first budgets (with headroom) recorded under an `artifacts` key in `budgets.json`, e.g. AppImage and NSIS ceilings.
- [ ] **29.4.5** Budget check mode — `scripts/check-budgets.mjs --artifacts` reads `release/` and fails any artifact over its ceiling.
- [ ] **29.4.6** Compression tuning — NSIS/DMG/AppImage compression options set to maximum where build time stays acceptable; before/after numbers compared.
- [ ] **29.4.7** Locale pruning — strip unused Chromium locales via `electronLanguages` (the app is English-only); the saving measured and noted.
- [ ] **29.4.8** Duplicate-asset check — assert the vendored Spektrum and dist assets are not packaged twice by overlapping file globs.
- [ ] **29.4.9** Size reporting — an artifact size table appended to `masterplan/perf-log.md` per release, beside the bundle sizes.
- [ ] **29.4.10** Electron-version tracking — document that the Electron runtime dominates artifact size and log artifact deltas whenever the Electron version bumps.

## Feature 29.5 — Code signing strategy

Signing is documented, not performed: v1 ships unsigned by explicit decision, with the mac notarization and Windows signing paths written down for later, the unsigned-app warnings catalogued, and checksums as the integrity story.

- [ ] **29.5.1** Document the macOS path — Developer ID certificate plus `notarytool` flow, with the electron-builder `afterSign`/notarize config sketched in `docs/distribution.md` and marked not-enabled for v1.
- [ ] **29.5.2** Document the Windows path — Authenticode options (OV vs EV) and where a certificate would slot into the builder config; not enabled for v1.
- [ ] **29.5.3** Record the rationale — cost and infrastructure vs benefit for a local-build personal project, plus the explicit revisit criteria, as the canonical decision note.
- [ ] **29.5.4** Unsigned UX inventory — capture the exact Gatekeeper and SmartScreen warnings current OS versions show for the artifacts, with screenshots for the docs.
- [ ] **29.5.5** Bypass instructions — precise per-OS steps (macOS right-click-Open / `xattr -dr com.apple.quarantine`; Windows "More info → Run anyway") written for the Feature 29.10 install docs.
- [ ] **29.5.6** Linux posture — document that AppImage needs `chmod +x` and that Linux integrity relies on checksums, not certificates.
- [ ] **29.5.7** Checksums pipeline — `scripts/release-checksums.mjs` emits a `SHA256SUMS` file over all artifacts as part of every release.
- [ ] **29.5.8** Config stubs — commented signing blocks left in the electron-builder config so enabling later is a credential drop-in, not a research project.
- [ ] **29.5.9** No secrets in repo — gitignore patterns for common certificate/provisioning files and a documented rule that signing material never enters the repository.
- [ ] **29.5.10** Docs linkage — `docs/distribution.md` cross-links the unsigned caveats into the README install section so users meet them before the OS warning does.

## Feature 29.6 — Update story

No auto-updater in v1 — deliberately: a user-initiated "check for updates" compares the running version against the latest GitHub release and links out, with the rationale written down and zero background phone-home.

- [ ] **29.6.1** Rationale doc — why v1 has no auto-updater (unsigned builds make update flows hostile on macOS, no server infra, no CI) recorded in `docs/distribution.md`.
- [ ] **29.6.2** Releases URL constant — a single constants module holds the GitHub releases URL used by the UI and the docs alike.
- [ ] **29.6.3** Check action — a user-initiated fetch of the latest-release tag through the platform `http` adapter, strictly on click; no startup or timer-driven checks, ever.
- [ ] **29.6.4** Semver compare — a tiny pure compare util (spec'd) against the bridge-reported app version, driving three UI states: up to date, newer available, check failed.
- [ ] **29.6.5** External open — "Get update" opens the releases page via `shell.openExternal` through the bridge.
- [ ] **29.6.6** Desktop-only surface — the update check renders only under the Electron adapter; the web build updates via Pages deploys and the Phase 24 SW flow instead.
- [ ] **29.6.7** Failure UX — an offline or rate-limited check shows a quiet classified error and never retries in a loop.
- [ ] **29.6.8** No-background-check proof — a spec asserts the check function has no callers outside the settings action, codifying the on-click-only posture.
- [ ] **29.6.9** Manual test — with a deliberately lowered local version, verify "newer available" and the external open on a packaged build.
- [ ] **29.6.10** User docs — README and the user guide explain update mechanics: desktop means download-and-install the new artifact; web updates itself on deploy.

## Feature 29.7 — Local crash/error posture

No telemetry — ever. Errors stay on the user's machine, and when they want help they export one redacted diagnostics file by hand: the app's only bug-reporting channel, by design.

- [ ] **29.7.1** No-telemetry statement — a `PRIVACY.md` declaring zero network calls except user-initiated content fetches and the on-click update check; no analytics, no crash upload.
- [ ] **29.7.2** Renderer capture — `window.onerror` and `unhandledrejection` feed the Phase 23 redacting diagnostics ring buffer, size-capped in memory.
- [ ] **29.7.3** Main-process capture — the Phase 28 main error log folded into the same diagnostics format with process tags (main/renderer/worker).
- [ ] **29.7.4** Export action — a Settings "Export diagnostics" writes one file via the save dialog: app version, OS/arch, storage tier, capability flags, and the recent redacted log ring.
- [ ] **29.7.5** Redaction guarantees — every export line passes the credential redactor (Xtream path-embedded creds, connect fragments, auth-style headers); a spec feeds hostile samples and asserts masked output.
- [ ] **29.7.6** Repro context, opt-in detail — the default export includes only counts and sizes (source type counts, playlist row counts); a labeled checkbox opts into including source URLs with a warning.
- [ ] **29.7.7** No-PII default — no hostnames, usernames, or file paths in the default export; the exact field list published in `PRIVACY.md`.
- [ ] **29.7.8** Crash-on-boot fallback — if boot fails before the UI exists, main writes a minimal crash file under `userData/logs` and shows one plain dialog pointing at it — the single acceptable modal.
- [ ] **29.7.9** Bug-report flow — a README "Reporting bugs" section: attach the diagnostics export, with an honest list of what it does and does not contain.
- [ ] **29.7.10** Tests — unit specs for ring-buffer capping and redactor integration; a manual export inspected during the Feature 29.8 QA pass.

## Feature 29.8 — Per-OS manual QA checklist

With no CI and no signing service, the QA checklist is the release gate: a documented install-to-uninstall pass per OS, executed against real artifacts and recorded with the artifact hash.

- [ ] **29.8.1** Author `docs/qa-desktop.md` — a per-OS table covering install, first run, import (file/URL/Xtream), playback, session restore, window-state restore, diagnostics export, and uninstall.
- [ ] **29.8.2** Install/uninstall specifics — NSIS install and uninstall (documenting what is removed vs what userData survives), portable run-from-folder, DMG drag-install, AppImage `chmod +x`.
- [ ] **29.8.3** Unsigned-warning walkthrough — QA explicitly exercises the Gatekeeper/SmartScreen bypass steps and confirms the docs match current OS behavior.
- [ ] **29.8.4** Upgrade-in-place — install version N over N−1 (and swap portable builds) verifying sources, favorites, and settings survive intact.
- [ ] **29.8.5** CORS capability row — a URL import known to fail on the web must succeed in every packaged build, proving `corsUnrestricted` end to end.
- [ ] **29.8.6** Playback matrix row — the stub stream plus one real HLS and one raw `.ts` stream verified per OS, with engine fallback observed working.
- [ ] **29.8.7** Keyboard row — the Phase 25 keyboard map spot-checked per OS, with media-key quirks noted.
- [ ] **29.8.8** Results template — each run records date, artifact SHA-256 (from `SHA256SUMS`), OS version, and pass/fail per row, appended under a runs section of the doc.
- [ ] **29.8.9** Blocker rule — a failed row blocks the release until fixed or explicitly waived with written rationale; the rule folded into the Feature 29.9 release procedure.
- [ ] **29.8.10** First execution — run the full checklist on every locally-available OS against the first real artifacts; file and fix findings before Phase 30 begins.

## Feature 29.9 — Versioning and release artifacts

Semver, a disciplined changelog, deterministic artifact names, and a scripted-but-manual release procedure — so every release is reproducible from a tag and no robot is ever involved.

- [ ] **29.9.1** Semver policy — pre-1.0 uses 0.x (minor for features, patch for fixes) with 1.0.0 reserved for Phase 30; documented in `docs/distribution.md`.
- [ ] **29.9.2** `CHANGELOG.md` — Keep-a-Changelog format with an Unreleased section; every merged phase or fix adds its entry in the same branch, enforced by review habit.
- [ ] **29.9.3** Artifact naming — the electron-builder `artifactName` template yields `thundertv-${version}-${os}-${arch}.${ext}`; every target verified to follow it.
- [ ] **29.9.4** Release script — `scripts/release.mjs` checks a clean tree, green `verify-report.json`, and an existing changelog entry, then bumps the version, tags `vX.Y.Z`, builds artifacts, and emits `SHA256SUMS`.
- [ ] **29.9.5** Manual upload procedure — documented `gh release create` (or web UI) steps attaching artifacts and checksums; explicitly no Actions, no publish automation.
- [ ] **29.9.6** Tag hygiene — the tag must point at the exact verified commit; `release.mjs` refuses dirty trees and unpushed state.
- [ ] **29.9.7** Version-stamp check — a spec asserts the About surface and the diagnostics export both report the `package.json` version, the single source.
- [ ] **29.9.8** Pages coordination — the procedure orders `npm run deploy` relative to artifact upload for releases that also change the web app.
- [ ] **29.9.9** Dry-run mode — `release.mjs --dry-run` prints every step without mutating anything; used for the first rehearsal.
- [ ] **29.9.10** Rehearsal release — cut a real 0.x release end to end (tag, artifacts, checksums, GitHub release, changelog) proving the pipeline before 1.0 depends on it.

## Feature 29.10 — Distribution documentation

Users meet the project through the install docs: per-OS instructions including the unsigned-app reality, checksum verification, a web-vs-desktop comparison, and links wired from the app and the Pages site.

- [ ] **29.10.1** README install section — per-OS instructions: Windows (NSIS/portable), macOS (DMG plus right-click-Open for unsigned), Linux (AppImage `chmod +x`), each with the exact caveat text from Feature 29.5.
- [ ] **29.10.2** System requirements — supported OS versions implied by the shipped Electron release, kept in sync when Electron bumps.
- [ ] **29.10.3** Checksum how-to — `sha256sum` / `shasum -a 256` / `CertUtil` commands per OS against the published `SHA256SUMS`.
- [ ] **29.10.4** Web vs desktop table — CORS behavior, storage durability, file dialogs, and update mechanism compared honestly, mirroring the capability flags.
- [ ] **29.10.5** Migration guide — moving from web to desktop via the Phase 22 settings/playlists JSON export-import, listing what carries over and what re-parses.
- [ ] **29.10.6** Update guidance — the Feature 29.6 mechanics explained from the user's side: check, download, install over.
- [ ] **29.10.7** Troubleshooting — Gatekeeper/SmartScreen, AppImage FUSE requirements, and antivirus false positives, each with resolution steps.
- [ ] **29.10.8** Pages link-up — the web app's About/footer links to the GitHub releases page for desktop downloads, ahead of the full Phase 30 landing page.
- [ ] **29.10.9** Privacy pointer — install docs link `PRIVACY.md` so the no-telemetry stance is discoverable before install.
- [ ] **29.10.10** Verbatim walkthrough — execute every documented step on a clean machine or VM per available OS, fix drift, and note completion in this phase file.
