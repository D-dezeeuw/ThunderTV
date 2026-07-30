import { describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { coerceEpgEntry, decodeMaybeBase64, epochMsFrom, getShortEpg, getXmltvGuide, xmltvUrl } from './epg';
import { apiUrl } from './urls';
import type { XtreamSource } from './types';

/**
 * The provider's own guide. Everything hostile here is real panel behaviour
 * rather than invented: base64 that is sometimes applied and sometimes not,
 * three different spellings of the timestamp pair, `epg_listings` versus a
 * bare array, and an empty guide as a legitimate answer.
 */
const SOURCE: XtreamSource = { url: 'http://panel.test', user: 'bob', pass: 's3cret' };

/** The exact URLs the client builds — routed through the real builders so a URL-shape change fails here rather than silently missing the fake's route table. */
const SHORT_EPG_URL = apiUrl(SOURCE, 'get_short_epg', '&stream_id=1359&limit=12');
const GUIDE_URL = xmltvUrl(SOURCE);

function b64(text: string): string {
    const bytes = new TextEncoder().encode(text);
    return btoa(String.fromCharCode(...bytes));
}

describe('decodeMaybeBase64()', () => {
    it('decodes base64, as UTF-8 rather than Latin-1', () => {
        expect(decodeMaybeBase64(b64('Journaal — Tweede Kamerdebat'))).toBe('Journaal — Tweede Kamerdebat');
    });

    it('passes plain text through when the panel did not encode it', () => {
        expect(decodeMaybeBase64('NOS Journaal')).toBe('NOS Journaal');
    });

    it('is empty-safe', () => {
        expect(decodeMaybeBase64('')).toBe('');
    });
});

describe('epochMsFrom()', () => {
    it('prefers a numeric unix-seconds field', () => {
        expect(epochMsFrom({ start_timestamp: 1_780_000_000 }, 'start_timestamp', 'start')).toBe(1_780_000_000_000);
    });

    it('accepts unix seconds sent as a string, which panels do', () => {
        expect(epochMsFrom({ start: '1780000000' }, 'start_timestamp', 'start')).toBe(1_780_000_000_000);
    });

    it('falls back to the "YYYY-MM-DD HH:mm:ss" form, read as UTC', () => {
        expect(epochMsFrom({ start: '2026-07-30 20:00:00' }, 'start')).toBe(Date.UTC(2026, 6, 30, 20, 0, 0));
    });

    it('reports null rather than NaN when nothing usable is present', () => {
        expect(epochMsFrom({ start: '' }, 'start')).toBeNull();
        expect(epochMsFrom({}, 'start')).toBeNull();
    });
});

describe('coerceEpgEntry()', () => {
    const base = {
        epg_id: 'npo1.nl',
        title: b64('NOS Journaal'),
        description: b64('Het nieuws van vandaag'),
        start_timestamp: 1_780_000_000,
        stop_timestamp: 1_780_003_600,
    };

    it('decodes and converts a well-formed row', () => {
        expect(coerceEpgEntry(base, 'fallback')).toEqual({
            channelId: 'npo1.nl',
            start: 1_780_000_000_000,
            stop: 1_780_003_600_000,
            title: 'NOS Journaal',
            description: 'Het nieuws van vandaag',
        });
    });

    it('falls back to the row id the caller already knows when the panel omits one', () => {
        const withoutId: Record<string, unknown> = { ...base };
        delete withoutId['epg_id'];
        expect(coerceEpgEntry(withoutId, 'npo2.nl')?.channelId).toBe('npo2.nl');
    });

    it('drops a row with no title rather than storing a blank programme', () => {
        expect(coerceEpgEntry({ ...base, title: '' }, 'x')).toBeNull();
    });

    it('drops a row whose bounds are inverted or zero-length', () => {
        expect(coerceEpgEntry({ ...base, stop_timestamp: base.start_timestamp }, 'x')).toBeNull();
        expect(coerceEpgEntry({ ...base, stop_timestamp: 1 }, 'x')).toBeNull();
    });

    it('keeps a missing description as null, not an empty string', () => {
        expect(coerceEpgEntry({ ...base, description: '' }, 'x')?.description).toBeNull();
    });
});

describe('getShortEpg()', () => {
    it('reads the documented epg_listings envelope', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(SHORT_EPG_URL).reply({ kind: 'ok', body: JSON.stringify({ epg_listings: [{ epg_id: 'npo1.nl', title: b64('Nieuws'), start_timestamp: 1_780_000_000, stop_timestamp: 1_780_003_600 }] }) });
            const result = await getShortEpg(SOURCE, 1359, 'npo1.nl');
            expect(result.ok).toBe(true);
            if (result.ok) expect(result.data.map((e) => e.title)).toEqual(['Nieuws']);
        });
    });

    it('also reads the bare-array shape some panels send instead', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(SHORT_EPG_URL).reply({ kind: 'ok', body: JSON.stringify([{ title: 'Nieuws', start: '1780000000', end: '1780003600' }]) });
            const result = await getShortEpg(SOURCE, 1359, 'npo1.nl');
            expect(result.ok).toBe(true);
            if (result.ok) expect(result.data[0]?.channelId).toBe('npo1.nl');
        });
    });

    it('treats an empty guide as a real answer, not a failure', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(SHORT_EPG_URL).reply({ kind: 'ok', body: JSON.stringify({ epg_listings: [] }) });
            const result = await getShortEpg(SOURCE, 1359, 'npo1.nl');
            expect(result.ok).toBe(true);
            if (result.ok) expect(result.data).toEqual([]);
        });
    });

    it('reports a login page as auth-failed rather than parsing it', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(SHORT_EPG_URL).reply({ kind: 'ok', body: '<html><body><form id="login"></form></body></html>' });
            const result = await getShortEpg(SOURCE, 1359, 'npo1.nl');
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error.kind).toBe('auth-failed');
        });
    });
});

describe('getXmltvGuide()', () => {
    it('builds the xmltv.php URL with credentials as query parameters', () => {
        expect(xmltvUrl(SOURCE)).toBe('http://panel.test/xmltv.php?username=bob&password=s3cret');
    });

    it('returns the raw XML for the existing parser', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(GUIDE_URL).reply({ kind: 'ok', body: '<?xml version="1.0"?><tv><channel id="a"/></tv>' });
            const result = await getXmltvGuide(SOURCE);
            expect(result.ok).toBe(true);
            if (result.ok) expect(result.data).toContain('<tv>');
        });
    });

    it('rejects a body that is not XMLTV at all', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(GUIDE_URL).reply({ kind: 'ok', body: 'Access denied' });
            const result = await getXmltvGuide(SOURCE);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error.kind).toBe('bad-payload');
        });
    });
});

/**
 * `atob` is not a base64 test: it strips whitespace and tolerates a ragged
 * final chunk, so plain titles used to decode into mojibake. These are the
 * shapes that actually appear as programme titles.
 */
describe('decodeMaybeBase64() against plain titles that look base64-ish', () => {
    for (const title of ['Football', 'NOS Journaal', 'Nieuws', 'EenVandaag', 'Studio Sport', 'Test', 'ABCD']) {
        it(`leaves "${title}" alone`, () => {
            const decoded = decodeMaybeBase64(title);
            expect(decoded === title || decoded === title.trim()).toBe(true);
        });
    }

    it('still decodes a real encoded title', () => {
        expect(decodeMaybeBase64(b64('Studio Sport'))).toBe('Studio Sport');
    });
});

describe('getXmltvGuide() body classification', () => {
    it('accepts XMLTV even though it opens with <?xml, which the JSON login heuristic would reject', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(GUIDE_URL).reply({ kind: 'ok', body: '<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="panel">\n</tv>' });
            const result = await getXmltvGuide(SOURCE);
            expect(result.ok).toBe(true);
        });
    });

    it('calls an actual HTML login page auth-failed', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(GUIDE_URL).reply({ kind: 'ok', body: '<!DOCTYPE html><html><body>Login</body></html>' });
            const result = await getXmltvGuide(SOURCE);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error.kind).toBe('auth-failed');
        });
    });
});
