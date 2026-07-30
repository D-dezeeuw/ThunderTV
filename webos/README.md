# webos/

The LG webOS TV target — no shell code, unlike `desktop/`. A packaged
webOS build is just the web app itself (`WebPlatform`, no new platform
adapter — see `src/core/platform/create-platform.ts`'s header comment)
plus this directory's `appinfo.json`/icons and two build-time swaps applied
to the built output: the vendored Spektrum copy (network-independent) and
an `es-module-shims` polyfill for TV engines under Chromium 89, which
predates native `<script type="importmap">` support. See
`masterplan/phases/phase-30-webos-target-and-release.md` for the full
epic this is one slice of.

## Building an `.ipk`

```bash
npm run build:lg
```

Runs `tsc --noEmit`, builds the app in webOS mode (`vite build --mode
webos`, output to `dist-webos/`, syntax floor Chromium 87 — see
`vite.config.ts`), applies the webOS-specific swaps
(`scripts/package-target.mjs webos`), then stages and packages
(`scripts/package-webos.mjs`). Output:
`release/thundertv-<version>-webos.ipk` (`release/` is gitignored).

This requires LG's `ares-package` CLI on `PATH` — see below. It does not
require a TV or emulator; that's only needed to install and run the result.

## Installing the ares-cli tools

```bash
npm install -g @webos-tools/cli
```

(This is LG's official webOS TV CLI, published on npm as
`@webos-tools/cli` — formerly `@webosose/ares-cli`. It's a large SDK-style
package with its own dependency tree, which is why it's not a project
devDependency here — the same reasoning `desktop/` uses Electron only from
its own `package.json`, not the root.)

## Installing on a TV

1. On the TV: **Settings → General → About This TV**, select the model
   name a few times to reveal Developer Mode, install the "Developer Mode"
   app from the LG Content Store, sign in with an LG Developer account, and
   turn Developer Mode on. **Sideloaded apps stop working ~48 hours after
   Developer Mode is enabled** unless you keep the Developer Mode app open
   and extend the session — expect to redo this periodically for ongoing
   testing.
2. Pair your machine with the TV (same network):
   ```bash
   ares-setup-device
   ```
   Follow the prompts — TV IP address, the passphrase shown on the TV's
   Developer Mode screen, and a name for the device profile (used as
   `<device>` below).
3. Install and launch:
   ```bash
   ares-install --device <device> release/thundertv-<version>-webos.ipk
   ares-launch --device <device> dev.thundertv.app
   ```
4. On-device devtools:
   ```bash
   ares-inspect --device <device> --app dev.thundertv.app --open
   ```

An emulator ships with LG's separate webOS TV SDK (not `ares-cli` itself)
if you want to test without hardware; `ares-setup-device`/`ares-install`
work the same way against it.

## Deliberately out of scope for this pass

- Everything requiring real TV/emulator hardware: on-device storage-tier,
  remote-navigation, and MSE/hls.js validation, TV performance
  measurement, and the security audit (masterplan Features 30.3–30.9) —
  this pass only covers producing the artifact.
- Samsung/Tizen. Its packaging model is different enough to be its own
  piece of work, not a variant of this one: a W3C widget `config.xml`
  instead of `appinfo.json`, Tizen Studio's `tizen` CLI instead of
  `ares-cli`, a `.wgt` instead of an `.ipk`, and — unlike webOS sideloading
  — Tizen requires at least a self-signed author certificate profile
  before `tizen package` will even run. Revisit if/when there's a Samsung
  TV to actually test against.
