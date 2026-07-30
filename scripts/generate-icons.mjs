#!/usr/bin/env node
// Regenerates the full ThunderTV icon set from the one committed master
// PNG (`assets/branding/thundertv-icon-master.png`, >=1024x1024, AI-
// generated — see that directory's neighboring splash master for the
// matching launch-screen source). Run this any time the master art
// direction changes instead of re-prompting the image model from scratch:
//
//   node scripts/generate-icons.mjs
//
// Outputs:
//   public/icons/favicon-*.png, apple-touch-icon.png  — web favicon/PWA set
//   public/splash.png                                 — Electron launch screen (copied from the splash master, unresized)
//   build/icon.ico                                    — Windows electron-builder icon
//   build/icon.icns                                   — macOS electron-builder icon
//   build/icons/*.png                                 — Linux electron-builder icon set (16..512)
//   webos/icon.png, webos/largeIcon.png                — webOS appinfo.json icon/largeIcon (80/130, LG's required sizes)
//
// Pure-JS pipeline (sharp for resizing, icon-gen for .ico/.icns
// packaging) — no ImageMagick/native tooling required.
import { mkdir, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import iconGen from 'icon-gen';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const masterIcon = path.join(rootDir, 'assets/branding/thundertv-icon-master.png');
const masterSplash = path.join(rootDir, 'assets/branding/thundertv-splash-master.png');
const publicIconsDir = path.join(rootDir, 'public/icons');
const buildDir = path.join(rootDir, 'build');
const buildIconsDir = path.join(buildDir, 'icons');
const webosDir = path.join(rootDir, 'webos');

// Web favicon/PWA sizes (masterplan/phases/phase-24-pwa-and-offline-shell.md
// Feature 24.1 names 192/512 for the manifest; 16/32/48/180 cover the
// classic <link rel="icon">/apple-touch-icon needs this task also asks for).
const FAVICON_SIZES = [16, 32, 48, 192, 512];
const APPLE_TOUCH_SIZE = 180;

// Linux electron-builder expects a directory of square PNGs at these sizes.
const LINUX_SIZES = [16, 32, 48, 64, 128, 256, 512];

// LG's appinfo.json schema names these exact sizes for `icon`/`largeIcon`.
const WEBOS_ICON_SIZE = 80;
const WEBOS_LARGE_ICON_SIZE = 130;

// The master has no alpha channel — its rounded-corner tile sits on a plain
// white square canvas, which reads as ugly white corners on webOS's dark
// launcher tiles (favicon/electron consumers don't show this: browser tabs
// and OS icon frames already crop/mask square art). Sampled directly from
// the master's background fill (a flat vector edge, confirmed pixel-by-pixel
// with no antialiasing gradient to blend), so this threshold swap has no
// visible seam.
const NAVY_CORNER_FILL = { r: 27, g: 41, b: 56 };
const WHITE_CORNER_THRESHOLD = 150; // navy channels top out ~57; corner whites sample 248+

// Sizes icon-gen needs pre-rendered on disk (as `<size>.png`) to assemble
// the Windows .ico and macOS .icns containers.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

async function writePng(size, outFile) {
    await sharp(masterIcon).resize(size, size).png().toFile(outFile);
}

/** The master, re-encoded with its white corner fill swapped for the tile's own navy — see WHITE_CORNER_THRESHOLD's comment. */
async function navyCorneredMaster() {
    const { data, info } = await sharp(masterIcon).raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    for (let i = 0; i < width * height; i++) {
        const o = i * channels;
        if (data[o] > WHITE_CORNER_THRESHOLD && data[o + 1] > WHITE_CORNER_THRESHOLD && data[o + 2] > WHITE_CORNER_THRESHOLD) {
            data[o] = NAVY_CORNER_FILL.r;
            data[o + 1] = NAVY_CORNER_FILL.g;
            data[o + 2] = NAVY_CORNER_FILL.b;
        }
    }
    return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function main() {
    await mkdir(publicIconsDir, { recursive: true });
    await mkdir(buildIconsDir, { recursive: true });
    await mkdir(webosDir, { recursive: true });

    // Web favicon/PWA set.
    for (const size of FAVICON_SIZES) {
        await writePng(size, path.join(publicIconsDir, `favicon-${size}.png`));
    }
    await writePng(APPLE_TOUCH_SIZE, path.join(publicIconsDir, 'apple-touch-icon.png'));

    // Linux electron-builder set.
    for (const size of LINUX_SIZES) {
        await writePng(size, path.join(buildIconsDir, `${size}.png`));
    }

    // webOS appinfo.json icon/largeIcon — from the navy-cornered master, not
    // the plain one every other output above uses.
    const navyMaster = await navyCorneredMaster();
    await sharp(navyMaster).resize(WEBOS_ICON_SIZE, WEBOS_ICON_SIZE).png().toFile(path.join(webosDir, 'icon.png'));
    await sharp(navyMaster)
        .resize(WEBOS_LARGE_ICON_SIZE, WEBOS_LARGE_ICON_SIZE)
        .png()
        .toFile(path.join(webosDir, 'largeIcon.png'));

    // Splash screen — copied as-is; it's already a finished composition.
    await copyFile(masterSplash, path.join(rootDir, 'public/splash.png'));

    // .ico / .icns via icon-gen, which needs a source directory of
    // pre-sized `<size>.png` files rather than a single input PNG.
    const workDir = await mkdtemp(path.join(tmpdir(), 'thundertv-icon-'));
    try {
        const sizes = [...new Set([...ICO_SIZES, ...ICNS_SIZES])];
        for (const size of sizes) {
            await writePng(size, path.join(workDir, `${size}.png`));
        }
        await iconGen(workDir, buildDir, {
            report: true,
            ico: { name: 'icon', sizes: ICO_SIZES },
            icns: { name: 'icon', sizes: ICNS_SIZES },
            favicon: false,
        });
    } finally {
        await rm(workDir, { recursive: true, force: true });
    }

    console.log('Icon set generated under public/icons, public/splash.png, build/.');
}

await main();
