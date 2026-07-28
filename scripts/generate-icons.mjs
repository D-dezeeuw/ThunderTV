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

// Web favicon/PWA sizes (masterplan/phases/phase-24-pwa-and-offline-shell.md
// Feature 24.1 names 192/512 for the manifest; 16/32/48/180 cover the
// classic <link rel="icon">/apple-touch-icon needs this task also asks for).
const FAVICON_SIZES = [16, 32, 48, 192, 512];
const APPLE_TOUCH_SIZE = 180;

// Linux electron-builder expects a directory of square PNGs at these sizes.
const LINUX_SIZES = [16, 32, 48, 64, 128, 256, 512];

// Sizes icon-gen needs pre-rendered on disk (as `<size>.png`) to assemble
// the Windows .ico and macOS .icns containers.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

async function writePng(size, outFile) {
    await sharp(masterIcon).resize(size, size).png().toFile(outFile);
}

async function main() {
    await mkdir(publicIconsDir, { recursive: true });
    await mkdir(buildIconsDir, { recursive: true });

    // Web favicon/PWA set.
    for (const size of FAVICON_SIZES) {
        await writePng(size, path.join(publicIconsDir, `favicon-${size}.png`));
    }
    await writePng(APPLE_TOUCH_SIZE, path.join(publicIconsDir, 'apple-touch-icon.png'));

    // Linux electron-builder set.
    for (const size of LINUX_SIZES) {
        await writePng(size, path.join(buildIconsDir, `${size}.png`));
    }

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
