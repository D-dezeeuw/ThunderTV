import type { ParsedChannelName } from './name-parse';

/**
 * Structural junk detection for provider catalogs. The dead weight in an
 * Xtream list is mostly *placeholder slots* rather than broken channels:
 * event/PPV brands ship 50-200 numbered entries (`VIAPLAY 01` … `VIAPLAY
 * 200`) that carry no programming outside a match window, plus explicit
 * dummy rows.
 *
 * Honest limitation: whether a stream is genuinely dead can only be known
 * by fetching it, and probing hundreds of URLs would be both slow and rude
 * to the provider. Everything here is therefore a *name-shape* judgement —
 * cheap, deterministic, and testable — not a liveness check. It errs
 * toward keeping things: a false positive silently hides a real channel,
 * which is far worse than one extra row.
 */

/** Brands that ship numbered event slots. A bare `<brand> <number>` from one of these is a placeholder, not a channel. */
const EVENT_SLOT_BRANDS = [
    'VIAPLAY',
    'ZIGGO SPORT EXTRA',
    'ESPN EXTRA',
    'SPORT EXTRA',
    'PPV',
    'EVENT',
    'EVENTS',
    'MATCH',
    'MATCHDAY',
];

/** `VIAPLAY 07`, `PPV 12`, `EVENT 3` — brand plus a bare number and nothing else. */
const EVENT_SLOT_PATTERN = new RegExp(`^(?:${EVENT_SLOT_BRANDS.join('|')})\\s*\\d{1,3}$`, 'i');

/** Rows the provider itself marks as non-content. */
const EXPLICIT_JUNK = /^(?:#{2,}|-{2,}|={2,}|\*{2,}|\.{3,}|NO\s+(?:EPG|NAME|CHANNEL)|DUMMY|TEST(?:\s*CHANNEL)?|PLACEHOLDER|INFO|UPDATE[SD]?|SERVER\s*\d*)$/i;

/** Separator/heading rows providers insert to visually group a list — never playable. */
const SEPARATOR_PATTERN = /^[\s\-=_*#.|~<>]+$/;

/** Adult content: excluded from the curated Dutch list by default (it has its own categories and is never what "Dutch TV" means here). */
const ADULT_PATTERN = /\b(?:XXX|ADULT|PORN|EROTI[CK]|18\+|SEX)\b/i;

export interface JunkVerdict {
    isJunk: boolean;
    /** Why — surfaced in the filter-stats readout so a wrongly-hidden channel is diagnosable rather than mysterious. */
    reason?: 'event-slot' | 'explicit-junk' | 'separator' | 'adult' | 'empty';
}

export function classifyJunk(parsed: ParsedChannelName): JunkVerdict {
    const base = parsed.base.trim();
    if (base.length === 0) return { isJunk: true, reason: 'empty' };
    if (SEPARATOR_PATTERN.test(base)) return { isJunk: true, reason: 'separator' };
    if (EXPLICIT_JUNK.test(base)) return { isJunk: true, reason: 'explicit-junk' };
    if (ADULT_PATTERN.test(base)) return { isJunk: true, reason: 'adult' };
    if (EVENT_SLOT_PATTERN.test(base)) return { isJunk: true, reason: 'event-slot' };
    return { isJunk: false };
}
