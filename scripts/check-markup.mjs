#!/usr/bin/env node
// Source-level markup size fence (UPGRADES U8, step 3).
//
// `index.html` is the only major artifact in this repo with no size limit,
// and it has behaved exactly as that predicts: 2,366 lines at the AUDIT,
// 3,560 by the time U5 landed, +50% over a window in which the entry chunk
// — which *does* have a fence — got 53% smaller. Every byte of it is on the
// critical path, and gzipped it is now larger than the JS chunk beside it.
//
// So this is a ratchet, not a target. The cap is the current size, which
// means the file can shrink and can never grow. When it shrinks, lower the
// cap in the same commit; that is the whole mechanism.
//
// Deliberately *not* a 400-line cap matching the TypeScript ceiling: that
// would land `verify` red today with no way to get it green short of U8's
// full partials split, and a permanently-red gate teaches everyone to skip
// the gate. Cap-at-today makes the number monotonic now, and the split can
// pull it down when someone does it.
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * One entry per uncapped markup file. `maxLines`/`maxBytes` are ratchets:
 * lower them when the file shrinks. Raising one is not forbidden, but it is
 * meant to be *hard to do by accident* — that is the entire point of the
 * mechanism. If you are raising it, the reason belongs in the commit
 * message, and the first question to answer is why the markup could not go
 * into a component instead (UPGRADES U8's split plan).
 *
 * Raised twice so far, both for genuinely new UI with nowhere else to live
 * until the partials split lands: +6 lines / +962 B for the Feature 21.6
 * next-episode offer, and +2 lines / +275 B for the Feature 25.8.5
 * screen-reader announcement region.
 *
 * The "search all" sweep modal paid for itself instead of raising these: it
 * reuses `.wizard-modal`/`.download-progress__bar` verbatim (no new CSS), and
 * ten of the file's longest comment blocks were condensed — same findings,
 * tighter prose — to cover its ~30 lines.
 */
const BUDGETS = [
    { path: 'index.html', maxLines: 3553, maxBytes: 246_445 },
];

let failed = false;

for (const budget of BUDGETS) {
    const full = `${repoRoot}${budget.path}`;
    const bytes = statSync(full).size;
    // Newline count, so this agrees with `wc -l` — the number anyone
    // checking the file by hand will see.
    const lines = readFileSync(full, 'utf8').split('\n').length - 1;

    for (const [label, actual, limit, unit] of [
        ['lines', lines, budget.maxLines, ''],
        ['bytes', bytes, budget.maxBytes, ' B'],
    ]) {
        if (actual > limit) {
            console.error(
                `check-markup: ${budget.path} grew to ${actual.toLocaleString()}${unit} ${label} (cap ${limit.toLocaleString()}${unit}).`,
            );
            console.error(
                '  This file is entirely on the critical path. Extract markup into a partial or a',
            );
            console.error(
                '  component rather than raising the cap — see UPGRADES.md U8 for the split plan.',
            );
            failed = true;
        } else if (actual < limit) {
            console.log(
                `check-markup: ${budget.path} is ${(limit - actual).toLocaleString()}${unit} under its ${label} cap — lower maxLines/maxBytes in scripts/check-markup.mjs to lock the win in.`,
            );
        }
    }
}

if (failed) process.exit(1);
console.log('check-markup: OK — no markup file is over its ratchet.');
