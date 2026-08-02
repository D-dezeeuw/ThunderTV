# Packaged vs. source divergence

The dominant fatal-bug class in Electron, and the reason a dev-mode launch
is not evidence of anything. The app's own source is identical in both
cases; what changes is the filesystem around it, and main-process code is
full of paths.

## The layout

With electron-builder's default `directories.app` (or an explicit one like
`desktop/`), that directory becomes **the root of `app.asar`**. So a repo
that looks like this:

```
repo/
├── desktop/          <- directories.app
│   ├── main.mjs
│   └── preload.cjs
├── scripts/
│   └── proxy-server.mjs
└── dist/
```

packages to this:

```
resources/
├── app.asar/               <- everything in `files:`
│   ├── main.mjs
│   ├── preload.cjs
│   └── dist/               <- because `files: [{from: ../dist, to: dist}]`
└── scripts/                <- only via `extraResources:`
    └── proxy-server.mjs
```

Note what moved relative to `main.mjs`:

| Specifier in `main.mjs` | Resolves in a checkout to | Resolves when packaged to |
| --- | --- | --- |
| `./x` | `desktop/x` | `app.asar/x` |
| `../scripts/x` | `repo/scripts/x` ✔ | `resources/scripts/x` — **only if `extraResources` put it there** |
| `../dist/index.html` | `repo/dist/index.html` ✔ | `resources/dist/index.html` — **wrong**, `files:` puts it at `app.asar/dist/` |

Both of the real bugs in this repo were one row of that table.

## The two directions, and the two fixes

**A path that needs to stay outside the asar** — `extraResources:` writes
into `resources/`, which is exactly where `app.asar/../` points. So the
single static specifier stays correct in both layouts and the code needs no
`app.isPackaged` branch:

```yaml
extraResources:
  - from: ../scripts/proxy-server.mjs
    to: scripts/proxy-server.mjs
```

This is the better fix when it applies, because it keeps the import
statically analyzable — a lint can see it, and a reader can follow it.

**A path that lives inside the asar but at a different depth** — there is no
config trick; the two layouts genuinely differ. Use a candidate list and
pick the first that exists, and throw a diagnosable error if none do:

```js
const INDEX_HTML_CANDIDATES = [
    path.join(appDir, 'dist', 'index.html'),        // packaged
    path.join(appDir, '..', 'dist', 'index.html'),  // npm start
];
```

Read these through `fs`, not a bare path test — Electron patches Node's
`fs` to see inside `app.asar`, so `fs.existsSync` works in the archive and
naive alternatives don't.

Prefer a candidate list over `if (app.isPackaged)`: it degrades gracefully
if a third layout appears, and it is honest that the code is *looking* for a
file rather than asserting where it is.

## Default-deny allowlists

`files:` is default-deny once you write it explicitly. A new
`desktop/helper.mjs` that nobody adds to the list is simply absent from the
package — no build error, no warning, a runtime failure only in a
distributed build. Same for the second hop: packaging `a.mjs` but not the
`b.mjs` it imports fails exactly as hard as packaging neither. The import
graph has to travel whole.

## Static checking

Walk the module graph from the real entry points (`package.json`'s `main`,
plus the preload — the preload is named as a *path* in `webPreferences`, not
imported, so a graph walk that only follows imports misses it), resolve each
relative specifier **in packaged coordinates**, and check it against the
layout the config produces.

The coordinate translation is the whole trick, and it is off-by-one-prone in
both directions: get it wrong one way and the check passes the bug, get it
wrong the other and it fails a correct config. Worth a few unit tests of its
own — see `scripts/check-desktop-package.spec.mts` in this repo.

Bare specifiers (`electron`, `node:fs`) are not this check's business.
Negations in the allowlist (`'!foo/**'`) only subtract, so treating them as
absent is the safe direction for a check asking "is this present?".

## Verifying a fix for real

`--dir` output is what an AppImage/NSIS/DMG is built from, so smoking it
tests the same file tree without mounting a FUSE image or installing
anything:

```sh
electron-builder --config ../electron-builder.yml --linux dir
node scripts/smoke-desktop.mjs --packaged release/linux-unpacked/<binary>
```

Check the produced binary's name rather than assuming it matches
`productName` — electron-builder derives the executable name from
`package.json`'s `name` in some configurations, and guessing wrong yields a
confusing `not found` that looks like a packaging failure.

## A false alarm to not chase

`node --check some-classic-script.js` reports a syntax error for perfectly
valid classic-script constructs (`with`, for instance) when the nearest
`package.json` has `"type": "module"` — Node parses it as ESM, which is
strict mode. A browser loading the same file via `<script src>` (no
`type="module"`) is not in strict mode and runs it fine. Don't "fix" the
file; check it the way it is actually loaded.
