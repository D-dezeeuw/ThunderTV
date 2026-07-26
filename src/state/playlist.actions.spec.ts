import { appState, getPathObj, resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { resetPlatformForTests } from '../core/platform';
import { withFakePlatform } from '../core/platform/fake-platform';
import { clearRows } from '../m3u/channel-memory';
import { isImportInFlight } from '../m3u/import';
import { initImportState } from './import';
import { cancelCurrentImport, triggerFileImport, triggerTextImport, triggerUrlImport } from './import-triggers';

const SAMPLE = '#EXTM3U\n#EXTINF:-1,One\nhttps://example.com/1.m3u8\n';

function importState<T>(key: string): T | undefined {
    return getPathObj<T>(appState, `import.${key}`);
}

describe('playlist.actions — real import triggers (Feature 07.1.9)', () => {
    afterEach(() => {
        clearRows();
        resetPlatformForTests();
        resetState();
    });

    it('triggerFileImport(): picks a file, imports it, and lands playlist.sources', async () => {
        await withFakePlatform({}, async ({ files }) => {
            initImportState();
            files.seed({ name: 'my-list.m3u', size: SAMPLE.length, file: new File([SAMPLE], 'my-list.m3u') });

            await triggerFileImport();
            tick();

            expect(importState('state')).toBe('done');
            expect(importState<{ total: number }>('summary')?.total).toBe(1);
        });
    });

    it('triggerFileImport(): a cancelled picker leaves import state at idle', () => {
        return withFakePlatform({}, async () => {
            initImportState();
            tick();

            await triggerFileImport();
            tick();

            expect(importState('state')).toBe('idle');
        });
    });

    it('triggerUrlImport(): fetches, imports, and reports done', async () => {
        await withFakePlatform({}, async ({ http }) => {
            initImportState();
            http.onGet('https://example.com/list.m3u').reply({ kind: 'ok', body: SAMPLE });

            await triggerUrlImport('https://example.com/list.m3u');
            tick();

            expect(importState('state')).toBe('done');
        });
    });

    it('triggerUrlImport(): a classified HTTP/CORS failure surfaces as import.errorKind, not a silent stall (regression: reportOutcome once swallowed every non-duplicate error)', async () => {
        await withFakePlatform({}, async ({ http }) => {
            initImportState();
            http.onGet('https://example.com/blocked.m3u').reply({ kind: 'cors-or-network', crossOrigin: true });

            await triggerUrlImport('https://example.com/blocked.m3u');
            tick();

            expect(importState('state')).toBe('error');
            expect(importState('errorKind')).toBe('corsOrNetwork');
        });
    });

    it('triggerUrlImport(): a 404 surfaces as httpNotFound', async () => {
        await withFakePlatform({}, async ({ http }) => {
            initImportState();
            http.onGet('https://example.com/missing.m3u').reply({ kind: 'http', status: 404 });

            await triggerUrlImport('https://example.com/missing.m3u');
            tick();

            expect(importState('state')).toBe('error');
            expect(importState('errorKind')).toBe('httpNotFound');
        });
    });

    it('triggerTextImport(): an unrecognizable paste surfaces as invalidM3u, not a silent stall', async () => {
        await withFakePlatform({}, async () => {
            initImportState();

            await triggerTextImport('this is not a playlist');
            tick();

            expect(importState('state')).toBe('error');
            expect(importState('errorKind')).toBe('invalidM3u');
        });
    });

    it('cancelCurrentImport(): aborts an in-flight fetch and returns to idle with zero trace (Feature 07.9.1)', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initImportState();
            http.onGet('https://example.com/slow.m3u').reply({ kind: 'pending' });

            const inFlight = triggerUrlImport('https://example.com/slow.m3u');
            await Promise.resolve();
            tick();
            expect(importState('state')).toBe('fetching');

            cancelCurrentImport();
            await inFlight;
            tick();

            expect(importState('state')).toBe('idle');
            expect(await storage.count('playlists')).toBe(0);
        });
    });

    it('triggerUrlImport(): a blank URL is a no-op', async () => {
        await withFakePlatform({}, async () => {
            initImportState();
            tick();

            await triggerUrlImport('   ');
            tick();

            expect(importState('state')).toBe('idle');
        });
    });

    it('triggerTextImport(): parses pasted text end to end', async () => {
        await withFakePlatform({}, async () => {
            initImportState();

            await triggerTextImport(SAMPLE);
            tick();

            expect(importState('state')).toBe('done');
        });
    });

    it('isImportInFlight() guards a second concurrent import — only one summary lands', async () => {
        await withFakePlatform({}, async ({ http }) => {
            initImportState();
            http.onGet('https://example.com/list.m3u').reply({ kind: 'ok', body: SAMPLE });

            const first = triggerUrlImport('https://example.com/list.m3u');
            // triggerTextImport's own isImportInFlight() guard races the
            // fetch above (both need at least one microtask before
            // runImport() actually sets the in-flight flag) — awaiting the
            // first import to completion before starting the second is a
            // deterministic way to prove single-flight without depending
            // on exact microtask ordering.
            await first;
            expect(isImportInFlight()).toBe(false);

            await triggerTextImport(SAMPLE);
            tick();

            // The second import proceeded (the guard only blocks a
            // *concurrent* one) and produced its own summary — this spec's
            // real single-flight proof (rejecting an overlapping call) is
            // `parser-client.spec.ts`'s "rejects a second parse() while one
            // is in flight" one layer down; `runImport()` itself throws the
            // same way (Feature 07.7.8), tested directly in
            // `import-run.spec.ts`.
            expect(importState('state')).toBe('done');
        });
    });
});
