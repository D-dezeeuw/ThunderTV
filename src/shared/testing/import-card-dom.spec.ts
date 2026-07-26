import { appState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { resetPlatformForTests } from '../../core/platform';
import { withFakePlatform } from '../../core/platform/fake-platform';
import { clearRows } from '../../m3u/channel-memory';
import { PLAYLIST_SOURCES, type PlaylistSourceSummary } from '../../state/playlist';
import { set } from '../../state/typed';
import { mountTemplate } from './bind-dom';

const SAMPLE = '#EXTM3U\n#EXTINF:-1,One\nhttps://example.com/1.m3u8\n';

/**
 * Feature 07.1.10: a rendered-DOM smoke test of the first-run import card's
 * structure — the three import paths, the disabled Xtream stub, and the
 * connect hint are all present in the empty state, and the whole card is
 * gone once a source exists. A hand-authored fragment mirroring
 * `index.html`'s `data-testid`s and binding names, matching every other
 * `bind-dom`-based spec's "user-semantics level, not the literal file"
 * convention (`bind-dom-flagship.spec.ts`) rather than parsing the real
 * `index.html` file.
 */
const CARD_TEMPLATE = `
    <div class="import-card" data-if="!importDone && hasNoSources" data-testid="import-card">
        <button type="button" data-testid="import-file-btn" data-action="click" data-fn="playlist/importFile">
            {{ strings.emptyStates.firstRun.file }}
        </button>
        <textarea
            data-testid="paste-textarea"
            data-ref="pasteTextarea"
            data-action="keydown.enter"
            data-fn="playlist/handlePasteKeydown"
        ></textarea>
        <button type="button" data-testid="paste-submit-btn" data-action="click" data-fn="playlist/importText">
            {{ strings.emptyStates.firstRun.pasteSubmit }}
        </button>
        <input type="url" data-testid="url-input" data-ref="urlInput" />
        <button type="button" data-testid="url-submit-btn" data-action="click" data-fn="playlist/importUrl">
            {{ strings.emptyStates.firstRun.urlSubmit }}
        </button>
        <button type="button" data-testid="xtream-stub-btn" disabled>
            {{ strings.emptyStates.firstRun.xtreamComingSoon }}
        </button>
        <p data-testid="connect-hint">{{ strings.emptyStates.firstRun.note }}</p>
    </div>
    <ul data-testid="sources-list" data-if="!importDone && !hasNoSources" data-each="playlist.sources">
        <li>{{ item.name }}</li>
    </ul>
`;

describe('import card DOM structure (Feature 07.1.10)', () => {
    it('shows the file/paste/URL paths, the disabled Xtream stub, and the connect hint when there are no sources', () => {
        const mounted = mountTemplate(CARD_TEMPLATE);

        expect(mounted.query('[data-testid="import-card"]')?.style.display).not.toBe('none');
        expect(mounted.query('[data-testid="import-file-btn"]')).not.toBeNull();
        expect(mounted.query('[data-testid="paste-textarea"]')).not.toBeNull();
        expect(mounted.query('[data-testid="paste-submit-btn"]')).not.toBeNull();
        expect(mounted.query('[data-testid="url-input"]')).not.toBeNull();
        expect(mounted.query('[data-testid="url-submit-btn"]')).not.toBeNull();
        expect(mounted.query('[data-testid="xtream-stub-btn"]')?.hasAttribute('disabled')).toBe(true);
        expect(mounted.query('[data-testid="connect-hint"]')).not.toBeNull();
        expect(mounted.query('[data-testid="sources-list"]')?.style.display).toBe('none');

        mounted.cleanup();
    });

    it('hides the card and shows the sources list the moment a source exists', () => {
        const mounted = mountTemplate(CARD_TEMPLATE);

        const summary: PlaylistSourceSummary = {
            id: 's1',
            type: 'm3u-text',
            name: 'My Playlist',
            url: null,
            channelCount: 10,
            groupCount: 2,
            radioCount: 0,
            drmCount: 0,
            skipped: 0,
            importDate: Date.now(),
            lastRefresh: null,
            needsReupload: false,
        };
        set(PLAYLIST_SOURCES, [summary]);
        tick();

        expect(mounted.query('[data-testid="import-card"]')?.style.display).toBe('none');
        expect(mounted.query('[data-testid="sources-list"]')?.style.display).not.toBe('none');

        mounted.cleanup();
    });
});

describe('paste Ctrl/Cmd+Enter keyboard flow (Feature 07.3.10)', () => {
    afterEach(() => {
        clearRows();
        resetPlatformForTests();
    });

    it('submits the pasted playlist without a pointer, and plain Enter does not', async () => {
        await withFakePlatform({}, async () => {
            const mounted = mountTemplate(CARD_TEMPLATE);
            const textarea = mounted.query<HTMLTextAreaElement>('[data-testid="paste-textarea"]');
            if (!textarea) throw new Error('unreachable');
            textarea.focus();
            textarea.value = SAMPLE;

            // Plain Enter must not submit — the user is still editing.
            textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            tick();
            expect((appState['import'] as { state?: string } | undefined)?.state ?? 'idle').toBe('idle');

            // Ctrl+Enter submits immediately — the handler runs synchronously
            // up to its first await, so the busy stage is already set by the
            // time dispatchEvent() returns, with zero pointer interaction.
            textarea.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }),
            );
            tick();
            expect((appState['import'] as { state?: string } | undefined)?.state).toBe('parsing');

            // Let the in-flight import actually settle before tearing down
            // the platform (withFakePlatform's finally would otherwise pull
            // the platform out from under a still-running runImport()).
            for (let i = 0; i < 20 && (appState['import'] as { state?: string } | undefined)?.state !== 'done'; i++) {
                await new Promise((resolve) => setTimeout(resolve, 10));
                tick();
            }
            expect((appState['import'] as { state?: string } | undefined)?.state).toBe('done');

            mounted.cleanup();
        });
    });
});
