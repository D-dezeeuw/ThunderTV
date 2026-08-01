import { setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { mountTemplate } from '../shared/testing/bind-dom';
import {
    clearDebugLog,
    DEBUG_ENTRIES,
    DEBUG_ERROR_COUNT,
    DEBUG_OPEN,
    DEBUG_SNAPSHOT,
    debugReportText,
    installDebugCapture,
    refreshDebugSnapshot,
    resetDebugForTests,
    type DebugEntry,
    type DebugSnapshot,
} from './debug';
import { toggleDebugPanel } from './debug.actions';
import { PLAYLIST_ACTIVE_SOURCE_ID, PLAYLIST_SOURCES, type PlaylistSourceSummary } from './playlist';
import { get } from './typed';
import { UI_ACTIVE_VIEW } from './ui';

/**
 * The panel exists because ThunderTV runs where devtools do not — a phone,
 * a TV, a packaged Electron window. Its job is to answer "why is this view
 * blank?" in one screenshot, so the specs are about exactly that: does it
 * catch the error, and does it name the inconsistency.
 */

const SOURCE: PlaylistSourceSummary = {
    id: 'src-1',
    type: 'xtream',
    name: 'Provider',
    url: 'http://provider.test',
    channelCount: 26232,
    groupCount: 721,
    radioCount: 131,
    drmCount: 0,
    skipped: 0,
    importDate: 0,
    lastRefresh: null,
    needsReupload: false,
};

const snapshot = (): DebugSnapshot | undefined => get<DebugSnapshot>(DEBUG_SNAPSHOT);
const entries = (): DebugEntry[] => get<DebugEntry[]>(DEBUG_ENTRIES) ?? [];

afterEach(() => {
    resetDebugForTests();
});

describe('capture', () => {
    it('records console errors and still calls the real console', () => {
        const mounted = mountTemplate('<div></div>');
        const seen: unknown[][] = [];
        const original = console.error;
        console.error = (...args: unknown[]) => seen.push(args);

        installDebugCapture();
        console.error('stream died', new Error('boom'));
        tick();

        expect(entries().at(-1)?.text).toBe('stream died Error: boom');
        expect(entries().at(-1)?.level).toBe('error');
        expect(get<number>(DEBUG_ERROR_COUNT)).toBe(1);
        // Observing, not replacing: the real console still got the call.
        expect(seen).toHaveLength(1);

        console.error = original;
        clearDebugLog();
        mounted.cleanup();
    });

    it('survives arguments that cannot be stringified', () => {
        const mounted = mountTemplate('<div></div>');
        const original = console.warn;
        console.warn = () => undefined;

        installDebugCapture();
        const circular: Record<string, unknown> = {};
        circular['self'] = circular;
        expect(() => {
            console.warn('odd', circular, document.body);
        }).not.toThrow();
        tick();
        expect(entries().at(-1)?.text).toContain('odd');

        console.warn = original;
        clearDebugLog();
        mounted.cleanup();
    });

    it('redacts credentials before they reach the log or the copy button', () => {
        // This panel exists to be screenshotted, and a failed request is
        // exactly what gets logged with its URL attached.
        const mounted = mountTemplate('<div></div>');
        const original = console.error;
        console.error = () => undefined;

        installDebugCapture();
        console.error('load failed', 'http://h:8080/live/bob/s3cret/42.ts?token=abc123');
        tick();

        const text = entries().at(-1)?.text ?? '';
        expect(text).toContain('load failed');
        expect(text).toContain('REDACTED');
        expect(text).not.toContain('s3cret');
        expect(text).not.toContain('abc123');
        expect(debugReportText()).not.toContain('s3cret');

        console.error = original;
        clearDebugLog();
        mounted.cleanup();
    });

    it('installs only once, however many times bootstrap runs', () => {
        const mounted = mountTemplate('<div></div>');
        const original = console.error;
        console.error = () => undefined;

        installDebugCapture();
        const wrapped = console.error;
        installDebugCapture();
        expect(console.error).toBe(wrapped);

        console.error = original;
        clearDebugLog();
        mounted.cleanup();
    });
});

describe('diagnosis — the line that explains a blank view', () => {
    const withState = (sources: PlaylistSourceSummary[], activeId: string | null): void => {
        setValue(PLAYLIST_SOURCES, sources);
        setValue(PLAYLIST_ACTIVE_SOURCE_ID, activeId);
        setValue(UI_ACTIVE_VIEW, 'live');
        tick();
        refreshDebugSnapshot();
        tick();
    };

    it('names an id that points at a source no longer in storage', () => {
        const mounted = mountTemplate('<div></div>');
        withState([SOURCE], 'src-gone');

        expect(snapshot()?.diagnosis).toContain('not in storage');
        expect(snapshot()?.activeSourceResolved).toBe('(not found)');

        mounted.cleanup();
    });

    it('distinguishes "nothing imported" from "nothing selected"', () => {
        const mounted = mountTemplate('<div></div>');

        withState([], null);
        expect(snapshot()?.diagnosis).toContain('No sources imported');

        withState([SOURCE], null);
        expect(snapshot()?.diagnosis).toContain('No source selected');

        mounted.cleanup();
    });

    it('reports a healthy-but-unloaded source as exactly that', () => {
        const mounted = mountTemplate('<div></div>');
        withState([SOURCE], 'src-1');

        // Nothing has loaded rows into module memory in a spec, which is the
        // same state a failed load leaves behind.
        expect(snapshot()?.diagnosis).toContain('no channel rows are loaded');
        expect(snapshot()?.activeSourceResolved).toContain('Provider');

        mounted.cleanup();
    });
});

describe('the panel itself', () => {
    it('opens and closes, and refreshes the snapshot on open', () => {
        const mounted = mountTemplate('<div data-if="debug.open" data-testid="panel"></div>');
        const panel = (): string | undefined => mounted.query('[data-testid="panel"]')?.style.display;

        setValue(PLAYLIST_SOURCES, [SOURCE]);
        setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'src-gone');
        tick();
        expect(panel()).toBe('none');

        toggleDebugPanel();
        tick();
        tick();
        expect(get<boolean>(DEBUG_OPEN)).toBe(true);
        expect(panel()).toBe('');
        expect(snapshot()?.diagnosis).toContain('not in storage');

        toggleDebugPanel();
        tick();
        expect(panel()).toBe('none');

        mounted.cleanup();
    });

    it('produces a copyable report carrying both the state and the log', () => {
        const mounted = mountTemplate('<div></div>');
        const original = console.error;
        console.error = () => undefined;
        installDebugCapture();
        console.error('boom');
        setValue(PLAYLIST_SOURCES, [SOURCE]);
        setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'src-gone');
        tick();

        const report = debugReportText();
        expect(report).toContain('ThunderTV debug report');
        expect(report).toContain('not in storage');
        expect(report).toContain('[error] boom');

        console.error = original;
        clearDebugLog();
        mounted.cleanup();
    });

    it('clearing empties the log and the error count', () => {
        const mounted = mountTemplate('<div></div>');
        const original = console.error;
        console.error = () => undefined;
        installDebugCapture();
        console.error('one');
        console.error('two');
        tick();
        expect(entries()).toHaveLength(2);

        clearDebugLog();
        tick();
        expect(entries()).toEqual([]);
        expect(get<number>(DEBUG_ERROR_COUNT)).toBe(0);

        console.error = original;
        mounted.cleanup();
    });
});
