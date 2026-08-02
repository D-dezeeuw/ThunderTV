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
//   public/splash.webp                                — Electron launch screen (desktop/splash.html)
//   src/styles/boot-wallpaper.webp                    — boot-overlay.css background
//   build/icon.ico                                    — Windows electron-builder icon
//   build/icon.icns                                   — macOS electron-builder icon
//   build/icons/*.png                                 — Linux electron-builder icon set (16..512)
//   webos/icon.png, webos/largeIcon.png                — webOS appinfo.json icon/largeIcon (80/130, LG's required sizes)
//
// Pure-JS pipeline (sharp for resizing, icon-gen for .ico/.icns
// packaging) — no ImageMagick/native tooling required.
//
// Every shipped derivative is compressed here rather than committed as the
// 8-bit RGB PNG sharp emits by default, because these files *are* the install
// footprint: unoptimised they were 2.6 MiB of dist/'s 4.4 MiB.
//   * Flat/branded artwork quantises almost losslessly, so the icon set and
//     the webOS icons are palette PNGs — still PNG, which is what the web
//     manifest, apple-touch-icon and LG's appinfo.json all require.
//   * The two large photographic-ish compositions (boot wallpaper, splash)
//     are WebP: Chrome 32+, so safe on the webOS 6 / Chromium 87 floor, in
//     Electron, and in every browser this app claims to support. Their only
//     consumers are a CSS `background: url(...)` and one <img> in an Electron
//     BrowserWindow — neither needs PNG.
// Masters under assets/ are inputs and stay untouched.
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import iconGen from 'icon-gen';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const masterIcon = path.join(rootDir, 'assets/branding/thundertv-icon-master.png');
const masterSplash = path.join(rootDir, 'assets/branding/thundertv-splash-master.png');
const masterWallpaper = path.join(rootDir, 'assets/store/wallpapers/thundertv-wallpaper-1920x1080.png');
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

// Sizes icon-gen needs pre-rendered on disk (as `<size>.png`) to assemble
// the Windows .ico and macOS .icns containers.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

// Quality 90 on this artwork is visually indistinguishable from the 8-bit RGB
// original at every size and costs an order of magnitude fewer bytes
// (favicon-512: 141.2 -> 16.9 KiB). `effort: 10` is encode-time only.
const PALETTE_PNG = { palette: true, quality: 90, effort: 10 };
const WEBP = { quality: 90 };

/** Shipped icon: palette PNG. */
async function writePng(size, outFile) {
    await sharp(masterIcon).resize(size, size).png(PALETTE_PNG).toFile(outFile);
}

/**
 * Scratch input for icon-gen's .ico/.icns packaging. Plain 8-bit RGB on
 * purpose: these never ship (they live in a temp dir and are re-encoded into
 * the containers), and the container formats are fussier than a browser.
 */
async function writeContainerSourcePng(size, outFile) {
    await sharp(masterIcon).resize(size, size).png().toFile(outFile);
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

    // webOS appinfo.json icon/largeIcon.
    await writePng(WEBOS_ICON_SIZE, path.join(webosDir, 'icon.png'));
    await writePng(WEBOS_LARGE_ICON_SIZE, path.join(webosDir, 'largeIcon.png'));

    // Splash screen — the master composition, re-encoded (671.6 KiB PNG ->
    // ~15 KiB WebP). desktop/splash.html renders it at 320 CSS px inside an
    // Electron BrowserWindow, so the full 1024² is already generous.
    await sharp(masterSplash).webp(WEBP).toFile(path.join(rootDir, 'public/splash.webp'));

    // Boot overlay wallpaper (src/styles/boot-overlay.css). 1803.8 KiB PNG ->
    // ~60 KiB WebP; it is a full-bleed 1920x1080 background, by far the
    // largest thing in the install.
    await sharp(masterWallpaper).webp(WEBP).toFile(path.join(rootDir, 'src/styles/boot-wallpaper.webp'));

    // .ico / .icns via icon-gen, which needs a source directory of
    // pre-sized `<size>.png` files rather than a single input PNG.
    const workDir = await mkdtemp(path.join(tmpdir(), 'thundertv-icon-'));
    try {
        const sizes = [...new Set([...ICO_SIZES, ...ICNS_SIZES])];
        for (const size of sizes) {
            await writeContainerSourcePng(size, path.join(workDir, `${size}.png`));
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

    console.log('Icon set generated under public/icons, public/splash.webp, src/styles/, build/.');
}

await main();
