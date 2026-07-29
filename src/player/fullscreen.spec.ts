import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    currentFullscreenElement,
    requestElementFullscreen,
    requestVideoFullscreen,
} from './fullscreen';

/**
 * The TV bug: `Element.requestFullscreen` does not exist on webOS/Tizen and
 * older WebKit, which ship only `webkitRequestFullscreen`. The original
 * implementation called the standard API and silently did nothing when it
 * was absent, so the button was simply dead on a TV. These specs pin the
 * vendor fallback and the toggle-to-exit behavior (a TV remote has no
 * dependable Escape key).
 */

function stubFullscreenElement(value: Element | null): void {
    Object.defineProperty(document, 'fullscreenElement', {
        value,
        configurable: true,
        writable: true,
    });
}

afterEach(() => {
    stubFullscreenElement(null);
    vi.restoreAllMocks();
});

describe('requestElementFullscreen', () => {
    it('uses the standard API when the browser has it', () => {
        const el = document.createElement('div');
        const standard = vi.fn(() => Promise.resolve());
        (el as unknown as Record<string, unknown>)['requestFullscreen'] = standard;
        stubFullscreenElement(null);

        requestElementFullscreen(el);
        expect(standard).toHaveBeenCalledOnce();
    });

    it('falls back to webkitRequestFullscreen when the standard API is missing', () => {
        const el = document.createElement('div');
        const webkit = vi.fn(() => undefined);
        (el as unknown as Record<string, unknown>)['webkitRequestFullscreen'] = webkit;
        stubFullscreenElement(null);

        requestElementFullscreen(el);
        expect(webkit).toHaveBeenCalledOnce();
    });

    it('exits instead of entering when something is already fullscreen', () => {
        const el = document.createElement('div');
        const request = vi.fn(() => Promise.resolve());
        (el as unknown as Record<string, unknown>)['requestFullscreen'] = request;
        const exit = vi.fn(() => Promise.resolve());
        Object.defineProperty(document, 'exitFullscreen', { value: exit, configurable: true });
        stubFullscreenElement(document.createElement('div'));

        requestElementFullscreen(el);
        expect(request).not.toHaveBeenCalled();
        expect(exit).toHaveBeenCalledOnce();
    });

    it('does not throw when the browser exposes no fullscreen API at all', () => {
        stubFullscreenElement(null);
        expect(() => requestElementFullscreen(document.createElement('div'))).not.toThrow();
    });

    it('swallows a rejected request rather than surfacing an unhandled rejection', () => {
        const el = document.createElement('div');
        (el as unknown as Record<string, unknown>)['requestFullscreen'] = () =>
            Promise.reject(new Error('denied'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        stubFullscreenElement(null);
        expect(() => requestElementFullscreen(el)).not.toThrow();
    });
});

describe('requestVideoFullscreen', () => {
    it("falls back to iOS Safari's video-only webkitEnterFullscreen", () => {
        const video = document.createElement('video');
        const enter = vi.fn();
        (video as unknown as Record<string, unknown>)['webkitEnterFullscreen'] = enter;
        stubFullscreenElement(null);

        requestVideoFullscreen(video);
        expect(enter).toHaveBeenCalledOnce();
    });

    it('prefers a real element-level API over the iOS video fallback', () => {
        const video = document.createElement('video');
        const webkitRequest = vi.fn(() => undefined);
        const enter = vi.fn();
        (video as unknown as Record<string, unknown>)['webkitRequestFullscreen'] = webkitRequest;
        (video as unknown as Record<string, unknown>)['webkitEnterFullscreen'] = enter;
        stubFullscreenElement(null);

        requestVideoFullscreen(video);
        expect(webkitRequest).toHaveBeenCalledOnce();
        expect(enter).not.toHaveBeenCalled();
    });
});

describe('currentFullscreenElement', () => {
    it('reads the vendor-prefixed property when the standard one is absent', () => {
        const el = document.createElement('div');
        Object.defineProperty(document, 'fullscreenElement', {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(document, 'webkitFullscreenElement', {
            value: el,
            configurable: true,
        });
        expect(currentFullscreenElement()).toBe(el);
        Object.defineProperty(document, 'webkitFullscreenElement', {
            value: null,
            configurable: true,
        });
    });
});
