import { describe, expect, it } from 'vitest';
import type { ChannelRow } from '../m3u/types';
import type { ActiveChannelSnapshot } from '../state/records';
import { decodeHandoff, encodeHandoff, handoffFromHash, handoffUrl } from './link';
import { resolveHandoff, sessionFor } from './resolve';
import { HANDOFF_POSITION_TTL_MS, isHandoffSession, resumePositionFor, type HandoffSession } from './session';

const NOW = 1_700_000_000_000;
/** A real provider shape: the credentials sit in the path, which is exactly what must never travel. */
const STREAM = 'http://panel.example:8080/live/alice/s3cret/12345.ts';

function snapshot(over: Partial<ActiveChannelSnapshot> = {}): ActiveChannelSnapshot {
    return { id: 'src-1:7', sourceId: 'src-1', name: 'NPO 1', streamUrl: STREAM, logo: null, group: 'NL', ...over };
}

function row(over: Partial<ChannelRow> = {}): ChannelRow {
    return { id: 'src-1:7', name: 'NPO 1', url: STREAM, logo: null, group: 'NL', tvgId: null, radio: false, ...over };
}

describe('what a handoff carries', () => {
    it('never contains the credentials the stream URL is full of', () => {
        const session = sessionFor(snapshot(), 0, NOW)!;
        const link = handoffUrl(session, 'https://tv.example/app/');

        // The encoded payload is what actually travels, so check that, not
        // just the object it came from.
        expect(link).not.toContain('alice');
        expect(link).not.toContain('s3cret');
        expect(JSON.stringify(session)).not.toContain('s3cret');
        expect(decodeHandoff(link.split('h=')[1]!)).toEqual(session);
    });

    it('refuses to build one for a URL the masker does not recognise', () => {
        // Not a URL at all: `streamKey` cannot promise it removed anything,
        // so the honest answer is no handoff rather than a risky one.
        expect(sessionFor(snapshot({ streamUrl: 'not-a-url' }), 0, NOW)).toBeNull();
    });

    it('carries no position for live, which has none to carry', () => {
        expect(sessionFor(snapshot(), 900, NOW)?.positionSec).toBe(0);
        expect(sessionFor(snapshot({ kind: 'vod' }), 900, NOW)?.positionSec).toBe(900);
    });
});

describe('the link', () => {
    it('round-trips through a URL fragment', () => {
        const session = sessionFor(snapshot({ kind: 'vod' }), 612, NOW)!;
        expect(handoffFromHash(new URL(handoffUrl(session, 'https://tv.example/')).hash)).toEqual(session);
    });

    it('points at the app it was generated from, whatever address that is', () => {
        const session = sessionFor(snapshot(), 0, NOW)!;
        expect(handoffUrl(session, 'file:///opt/thundertv/index.html#/live')).toMatch(/^file:\/\/\/opt\/thundertv\/index\.html#\/handoff\?h=/);
        expect(handoffUrl(session, 'http://192.168.1.9:8080/')).toMatch(/^http:\/\/192\.168\.1\.9:8080\/#\/handoff\?h=/);
    });

    it('returns null for anything that is not a handoff, without throwing', () => {
        expect(handoffFromHash('#/live')).toBeNull();
        expect(handoffFromHash('#/handoff')).toBeNull();
        expect(handoffFromHash('#/handoff?h=')).toBeNull();
        expect(handoffFromHash('#/handoff?h=not-base64!!')).toBeNull();
        expect(handoffFromHash(`#/handoff?h=${encodeHandoff({ hello: 'world' } as unknown as HandoffSession)}`)).toBeNull();
        expect(handoffFromHash('#/connect?x=1')).toBeNull();
    });

    it('rejects a payload from a format this build does not know', () => {
        const future = { ...sessionFor(snapshot(), 0, NOW)!, v: 99 };
        expect(isHandoffSession(future)).toBe(false);
    });
});

describe('resuming', () => {
    it('uses the position it was handed', () => {
        const session = sessionFor(snapshot({ kind: 'vod' }), 612, NOW)!;
        expect(resumePositionFor(session, NOW + 60_000)).toBe(612);
    });

    it('starts from the top when the link has gone stale', () => {
        // A link found in a chat thread the next day must not yank the
        // receiving device into the middle of something.
        const session = sessionFor(snapshot({ kind: 'vod' }), 612, NOW)!;
        expect(resumePositionFor(session, NOW + HANDOFF_POSITION_TTL_MS + 1)).toBe(0);
    });

    it('never seeks a live feed', () => {
        const live: HandoffSession = { ...sessionFor(snapshot(), 0, NOW)!, positionSec: 900 };
        expect(resumePositionFor(live, NOW)).toBe(0);
    });
});

describe('resolving on the receiving device', () => {
    const session = sessionFor(snapshot(), 0, NOW)!;

    it('finds the feed even though the other device signs in with different credentials', () => {
        // The whole reason the masked key is the identity: same feed, same
        // account, different password after a rotation.
        const rotated = row({ url: 'http://panel.example:8080/live/alice/newpassword/12345.ts' });
        const resolved = resolveHandoff(session, [rotated], 'src-1');
        expect(resolved.ok && resolved.snapshot.streamUrl).toBe(rotated.url);
    });

    it('survives the playlist being reordered, which a channel id would not', () => {
        const moved = row({ id: 'src-1:412' });
        const resolved = resolveHandoff(session, [row({ id: 'src-1:3', url: 'http://panel.example:8080/live/alice/s3cret/99.ts', name: 'Other' }), moved], 'src-1');
        expect(resolved.ok && resolved.snapshot.id).toBe('src-1:412');
    });

    it('falls back to the name when the provider has re-pathed its catalog', () => {
        const rePathed = row({ url: 'http://panel.example:8080/live/alice/s3cret/98765.ts' });
        const resolved = resolveHandoff(session, [rePathed], 'src-1');
        expect(resolved.ok && resolved.snapshot.name).toBe('NPO 1');
    });

    it('says which failure it is — a missing source is not a missing channel', () => {
        expect(resolveHandoff(session, [row()], 'a-different-source')).toEqual({ ok: false, failure: 'wrong-source' });
        expect(resolveHandoff(session, [row({ url: 'http://elsewhere.example/x.ts', name: 'Nope' })], 'src-1')).toEqual({
            ok: false,
            failure: 'not-found',
        });
    });

    it('carries the kind through, so a film lands in the right player mode', () => {
        const vod = sessionFor(snapshot({ kind: 'vod' }), 100, NOW)!;
        const resolved = resolveHandoff(vod, [row()], 'src-1');
        expect(resolved.ok && resolved.snapshot.kind).toBe('vod');
    });

    it('sends a station back to Radio', () => {
        const resolved = resolveHandoff(session, [row({ radio: true })], 'src-1');
        expect(resolved.ok && resolved.snapshot.radio).toBe(true);
    });
});
