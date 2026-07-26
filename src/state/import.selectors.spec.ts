import { appState, resetState, tick } from 'spektrum';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
    IMPORT_ERROR_KIND,
    IMPORT_ERROR_MESSAGE,
    IMPORT_STATE,
    IMPORT_SUMMARY,
    IMPORT_WRITTEN,
    type ImportSummaryView,
} from './import';
import { registerImportSelectors } from './import.selectors';
import { SETTINGS_PROXY_TEMPLATE } from './settings';
import { set } from './typed';

function summary(overrides: Partial<ImportSummaryView> = {}): ImportSummaryView {
    return {
        sourceId: 's1',
        total: 10,
        groupCount: 2,
        radioCount: 0,
        drmCount: 0,
        skipped: 0,
        detectedEpgUrlCount: 0,
        updated: false,
        ...overrides,
    };
}

describe('import selectors (Feature 07.5/07.6)', () => {
    beforeAll(() => {
        registerImportSelectors();
    });

    afterEach(() => {
        resetState();
    });

    describe('importBusy', () => {
        it.each(['fetching', 'reading', 'parsing', 'writing'])('is true while %s', (stage) => {
            set(IMPORT_STATE, stage);
            tick();
            expect(appState['importBusy']).toBe(true);
        });

        it.each(['idle', 'done', 'error'])('is false while %s', (stage) => {
            set(IMPORT_STATE, stage);
            tick();
            expect(appState['importBusy']).toBe(false);
        });
    });

    describe('importHasError', () => {
        it('is true only in the error stage', () => {
            set(IMPORT_STATE, 'error');
            tick();
            expect(appState['importHasError']).toBe(true);

            set(IMPORT_STATE, 'idle');
            tick();
            expect(appState['importHasError']).toBe(false);
        });
    });

    describe('importDone', () => {
        it('is true only in the done stage', () => {
            set(IMPORT_STATE, 'done');
            tick();
            expect(appState['importDone']).toBe(true);

            set(IMPORT_STATE, 'idle');
            tick();
            expect(appState['importDone']).toBe(false);
        });
    });

    describe('importStageLabel', () => {
        it.each([
            ['fetching', 'Fetching…'],
            ['reading', 'Reading…'],
            ['parsing', 'Parsing…'],
            ['writing', 'Saving…'],
        ])('labels %s as %s', (stage, label) => {
            set(IMPORT_STATE, stage);
            tick();
            expect(appState['importStageLabel']).toBe(label);
        });

        it('falls back to the parsing label for an unrecognized stage', () => {
            set(IMPORT_STATE, 'idle');
            tick();
            expect(appState['importStageLabel']).toBe('Parsing…');
        });
    });

    describe('importRowsReadout', () => {
        it('is empty until at least one row has been written', () => {
            set(IMPORT_WRITTEN, 0);
            tick();
            expect(appState['importRowsReadout']).toBe('');
        });

        it('interpolates the written count once rows have landed', () => {
            set(IMPORT_WRITTEN, 12400);
            tick();
            expect(appState['importRowsReadout']).toBe('12400 channels…');
        });
    });

    describe('importErrorMessage', () => {
        it('resolves an http.failure key to its static string', () => {
            set(IMPORT_ERROR_KIND, 'httpNotFound');
            tick();
            expect(appState['importErrorMessage']).toContain('URL');
        });

        it('resolves invalidM3u to its dedicated string', () => {
            set(IMPORT_ERROR_KIND, 'invalidM3u');
            tick();
            expect(appState['importErrorMessage']).toBe('This does not look like an M3U playlist.');
        });

        it('resolves the m3u kind from the dynamic errorMessage, not a static string', () => {
            set(IMPORT_ERROR_KIND, 'm3u');
            set(IMPORT_ERROR_MESSAGE, 'Playlist has no #EXTM3U header — nothing to import.');
            tick();
            expect(appState['importErrorMessage']).toBe('Playlist has no #EXTM3U header — nothing to import.');
        });

        it('resolves the duplicate kind by interpolating the matched source name', () => {
            set(IMPORT_ERROR_KIND, 'duplicate');
            set(IMPORT_ERROR_MESSAGE, 'My Playlist');
            tick();
            expect(appState['importErrorMessage']).toContain('My Playlist');
            expect(appState['importErrorMessage']).toContain('import anyway');
        });

        it('resolves largeConfirm to its dedicated confirm-prompt string', () => {
            set(IMPORT_ERROR_KIND, 'largeConfirm');
            tick();
            expect(appState['importErrorMessage']).toBe('This is a large paste and may take a moment to parse.');
        });

        it('is empty when there is no error kind', () => {
            set(IMPORT_ERROR_KIND, null);
            tick();
            expect(appState['importErrorMessage']).toBe('');
        });
    });

    describe('showDuplicateConfirm / showLargeConfirm / showRetry / showRetryViaProxy', () => {
        it('each gate is true only for its own error kind', () => {
            set(IMPORT_ERROR_KIND, 'duplicate');
            tick();
            expect(appState['showDuplicateConfirm']).toBe(true);
            expect(appState['showLargeConfirm']).toBe(false);
            expect(appState['showRetry']).toBe(false);

            set(IMPORT_ERROR_KIND, 'largeConfirm');
            tick();
            expect(appState['showDuplicateConfirm']).toBe(false);
            expect(appState['showLargeConfirm']).toBe(true);

            set(IMPORT_ERROR_KIND, 'timeout');
            tick();
            expect(appState['showLargeConfirm']).toBe(false);
            expect(appState['showRetry']).toBe(true);
        });

        it('showRetryViaProxy requires both a CORS-classified kind and a configured proxy template', () => {
            set(IMPORT_ERROR_KIND, 'corsOrNetwork');
            set(SETTINGS_PROXY_TEMPLATE, null);
            tick();
            expect(appState['showRetryViaProxy']).toBe(false);

            set(SETTINGS_PROXY_TEMPLATE, 'https://proxy.example/{url}');
            tick();
            expect(appState['showRetryViaProxy']).toBe(true);

            set(IMPORT_ERROR_KIND, 'httpNotFound');
            tick();
            expect(appState['showRetryViaProxy']).toBe(false);

            set(IMPORT_ERROR_KIND, 'mixedContent');
            tick();
            expect(appState['showRetryViaProxy']).toBe(true);
        });
    });

    describe('importSummaryHeading', () => {
        it('is the plain heading for a new source', () => {
            set(IMPORT_SUMMARY, summary({ updated: false }));
            tick();
            expect(appState['importSummaryHeading']).toBe('Import complete');
        });

        it('is the updated heading for an upsert', () => {
            set(IMPORT_SUMMARY, summary({ updated: true }));
            tick();
            expect(appState['importSummaryHeading']).toBe('Playlist updated');
        });
    });

    describe('importSummaryLines', () => {
        it('is empty when there is no summary', () => {
            set(IMPORT_SUMMARY, null);
            tick();
            expect(appState['importSummaryLines']).toEqual([]);
        });

        it('always includes channel/group counts, pluralized correctly', () => {
            set(IMPORT_SUMMARY, summary({ total: 1, groupCount: 1 }));
            tick();
            expect(appState['importSummaryLines']).toEqual(['1 channel', '1 group']);
        });

        it('hides zero-radio and zero-skipped lines entirely', () => {
            set(IMPORT_SUMMARY, summary({ total: 10, groupCount: 2, radioCount: 0, skipped: 0 }));
            tick();
            expect(appState['importSummaryLines']).toEqual(['10 channels', '2 groups']);
        });

        it('shows radio/skipped/drm/epg lines when non-zero', () => {
            set(
                IMPORT_SUMMARY,
                summary({ total: 100, groupCount: 5, radioCount: 3, skipped: 1, drmCount: 2, detectedEpgUrlCount: 1 }),
            );
            tick();
            expect(appState['importSummaryLines']).toEqual([
                '100 channels',
                '5 groups',
                '3 radio stations',
                '1 unreadable entry skipped',
                '2 DRM-protected channels detected (not playable yet)',
                '1 EPG source detected',
            ]);
        });
    });
});
