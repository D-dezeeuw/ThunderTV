#!/usr/bin/env node
// Generates the phase-status table in masterplan/MASTERPLAN.md §4 from the
// `> **Status:**` line each phase file carries (UPGRADES U5). Run manually,
// committed output, no Actions — same convention as gen-state-keys.mjs.
//
// Usage:
//   node scripts/gen-phase-status.mjs [--check]
//
// --check   regenerate to memory, diff against the committed MASTERPLAN.md,
//           exit nonzero on drift. Wired into `npm run verify` as
//           `lint:phase-status`.
//
// Why generated: AUDIT §3.2 found the tracker reporting 0/100 for 22 phases
// that shipped, because a hand-maintained summary and a hand-maintained
// detail can rot in opposite directions and nothing notices. A derived table
// can only be wrong if its source is, so there is one place to fix.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const phasesDir = `${repoRoot}masterplan/phases`;
const outPath = `${repoRoot}masterplan/MASTERPLAN.md`;
const checkOnly = process.argv.includes('--check');

const BEGIN = '<!-- BEGIN generated: phase-status (node scripts/gen-phase-status.mjs) -->';
const END = '<!-- END generated: phase-status -->';

const VALID_STATUS = new Set(['shipped', 'partial', 'not-started', 'superseded']);
const VALID_TRACKER = new Set(['current', 'not-maintained']);

/**
 * Phases past 31 have no phase file on purpose — each is documented in the
 * module README it created, so a phase file would be a second copy to keep
 * honest (MASTERPLAN §4). They still belong in the status table, so their
 * row is declared here and their README existence is verified.
 */
const README_OWNED = [
    ['32', 'EPG Display & Timeline', 'src/epg/README.md', 'shipped', 'Now/next on Live rows and the Guide timeline, superseding Phase 17.'],
    ['33', 'Passive Health Signals', 'src/health/README.md', 'shipped', 'Decaying per-feed score from real playback outcomes; dead feeds never render.'],
    ['34', 'Codex v0 — Export & Import', 'src/codex/README.md', 'shipped', 'The signed, portable knowledge file the user owns.'],
    ['35', 'Spatial Navigation', 'src/ui/spatial/README.md', 'shipped', 'Geometry-based D-pad focus — the input model Phase 25 left unbuilt and Phase 30 needs.'],
    ['36', 'Codex Merge (CRDT)', 'src/codex/README.md', 'shipped', 'A grow-only join, so convergence needs no sync server.'],
    [
        '37',
        'Community Codex',
        'src/codex/README.md',
        'partial',
        'Discover, merge and prune ship, bounded by `trust.ts`\'s ingest clamp. **Publish is deliberately not implemented** — it would mean operating the service this pillar exists to avoid.',
    ],
    [
        '38',
        'Handoff',
        'src/handoff/README.md',
        'partial',
        'The link-based handoff ships. **The LAN transport is deliberately not built** — it needs a host that can listen, which means the Electron main process.',
    ],
];

const STATUS_RE = /^> \*\*Status:\*\* `([a-z-]+)` · tracker: `([a-z-]+)` — /;

function parsePhaseFiles() {
    const rows = [];
    for (const file of readdirSync(phasesDir).sort()) {
        if (!file.endsWith('.md')) continue;
        const text = readFileSync(`${phasesDir}/${file}`, 'utf8');
        const lines = text.split('\n');

        const title = lines[0].match(/^# Phase (\d+) — (.+)$/);
        if (!title) throw new Error(`${file}: first line is not a "# Phase NN — Title" heading`);

        const statusLine = lines.find((l) => l.startsWith('> **Status:**'));
        if (!statusLine) throw new Error(`${file}: no "> **Status:**" line. Every phase file needs one — see MASTERPLAN §4.`);
        const parsed = statusLine.match(STATUS_RE);
        if (!parsed) throw new Error(`${file}: malformed Status line. Expected: > **Status:** \`<status>\` · tracker: \`<tracker>\` — <prose>`);

        const [, status, tracker] = parsed;
        if (!VALID_STATUS.has(status)) throw new Error(`${file}: unknown status "${status}" (want one of ${[...VALID_STATUS].join(', ')})`);
        if (!VALID_TRACKER.has(tracker)) throw new Error(`${file}: unknown tracker "${tracker}" (want one of ${[...VALID_TRACKER].join(', ')})`);

        // Three box states, all pre-existing conventions in these files:
        // `[ ]` open, `[x]` done, `[~]` closed with a documented divergence
        // (deferred on purpose, or built under a different name — the note on
        // the line says which). `[~]` counts as closed, but is reported
        // separately so "done" never quietly absorbs "done differently".
        const total = (text.match(/^\s*- \[[ x~]\]/gm) ?? []).length;
        const done = (text.match(/^\s*- \[[x~]\]/gm) ?? []).length;
        const noted = (text.match(/^\s*- \[~\]/gm) ?? []).length;

        rows.push({ num: title[1], name: title[2], file, status, tracker, done, total, noted });
    }
    return rows;
}

function tasksCell(row) {
    // A `not-maintained` tracker's box count is noise — reporting "0/100" next
    // to a shipped phase is exactly the inversion AUDIT §3.2 found. Say so
    // instead of implying a number nobody kept true.
    if (row.tracker === 'not-maintained') return 'not tracked';
    const count = `${String(row.done)}/${String(row.total)}`;
    return row.noted > 0 ? `${count} · ${String(row.noted)} noted` : count;
}

function render(rows) {
    const counts = { shipped: 0, partial: 0, 'not-started': 0, superseded: 0 };
    for (const r of rows) counts[r.status] += 1;
    for (const [, , , status] of README_OWNED) counts[status] += 1;

    const out = [];
    out.push(BEGIN);
    out.push('');
    out.push(`> Generated by \`node scripts/gen-phase-status.mjs\` from each phase file's \`> **Status:**\` line.`);
    out.push('> Do not hand-edit this table — edit the phase file and regenerate.');
    out.push('');
    out.push('| #   | Phase | Status | Tasks |');
    out.push('| --- | ----- | ------ | ----- |');
    for (const r of rows) {
        out.push(`| ${r.num} | [${r.name}](./phases/${r.file}) | \`${r.status}\` | ${tasksCell(r)} |`);
    }
    for (const [num, name, readme, status, note] of README_OWNED) {
        if (!existsSync(`${repoRoot}${readme}`)) throw new Error(`phase ${num}: declared README ${readme} does not exist`);
        out.push(`| ${num} | ${name} — see [\`${readme}\`](../${readme}) | \`${status}\` | ${note} |`);
    }
    out.push('');
    out.push(
        `**Totals:** ${String(counts.shipped)} shipped · ${String(counts.partial)} partial · ` +
            `${String(counts['not-started'])} not started · ${String(counts.superseded)} superseded.`,
    );
    out.push('');
    out.push(END);
    return out.join('\n');
}

let rows;
let block;
try {
    rows = parsePhaseFiles();
    block = render(rows);
} catch (error) {
    // A lint script's job is to name the problem, not to hand back a stack.
    console.error(`gen-phase-status: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}

const committed = readFileSync(outPath, 'utf8');
const begin = committed.indexOf(BEGIN);
const end = committed.indexOf(END);
if (begin === -1 || end === -1) {
    console.error(`gen-phase-status: ${outPath} is missing the generated-block markers. Add them back around the §4 status table.`);
    process.exit(1);
}
const updated = committed.slice(0, begin) + block + committed.slice(end + END.length);

if (checkOnly) {
    if (committed !== updated) {
        console.error(`gen-phase-status: --check failed — MASTERPLAN.md's status table is out of date with masterplan/phases/*.md. Regenerate with \`node scripts/gen-phase-status.mjs\`.`);
        process.exit(1);
    }
    console.log(`gen-phase-status: OK — MASTERPLAN.md matches masterplan/phases/*.md (${String(rows.length)} phase files + ${String(README_OWNED.length)} README-owned)`);
} else {
    writeFileSync(outPath, updated);
    console.log(`gen-phase-status: wrote MASTERPLAN.md (${String(rows.length)} phase files + ${String(README_OWNED.length)} README-owned)`);
}
