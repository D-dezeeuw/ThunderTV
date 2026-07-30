import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTvWebview } from './tv-webview';
import { webDownloadSupport } from './web-downloads';

/**
 * Downloads are gated on a *capability*, never on an environment check in
 * the UI (`capabilities.ts`'s own rule). A TV is the first host that really
 * reports `downloads: 'none'`: it has no File System Access API, and the
 * `'handoff'` fallback describes a browser download manager a TV webview
 * does not have.
 */
function withUserAgent(ua: string, run: () => void): void {
    const original = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
    try {
        run();
    } finally {
        if (original) Object.defineProperty(navigator, 'userAgent', original);
    }
}

const LG = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0 Safari/537.36 WebAppManager';
const TIZEN = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.0 TV Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

describe('isTvWebview()', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('recognizes webOS by its user agent — Web0S really is spelled with a zero', () => {
        withUserAgent(LG, () => {
            expect(isTvWebview()).toBe(true);
        });
    });

    it('recognizes Tizen', () => {
        withUserAgent(TIZEN, () => {
            expect(isTvWebview()).toBe(true);
        });
    });

    it('recognizes a webOS webview by its injected global before any UA match', () => {
        vi.stubGlobal('webOSSystem', {});
        withUserAgent(DESKTOP, () => {
            expect(isTvWebview()).toBe(true);
        });
    });

    it('does not mistake a desktop browser for a TV', () => {
        withUserAgent(DESKTOP, () => {
            expect(isTvWebview()).toBe(false);
        });
    });
});

describe('webDownloadSupport()', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("reports 'none' on a TV, so the UI drops the control instead of offering a dead one", () => {
        withUserAgent(LG, () => {
            expect(webDownloadSupport()).toBe('none');
        });
    });

    it("still reports a real capability off a TV", () => {
        withUserAgent(DESKTOP, () => {
            expect(webDownloadSupport()).not.toBe('none');
        });
    });
});
