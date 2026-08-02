import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { tick } from 'spektrum';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EpgProgramRecord } from '../core/storage';
import type { ChannelRow } from '../m3u/types';
import { mountTemplate, type MountedTemplate } from '../shared/testing/bind-dom';
import { setEpgProgramIndex } from './epg-index';
import { publishListWindow, resetListPublishForTests } from './list-publish';

/**
 * "The EPG blocks get loaded in on the wrong channels when I scroll and new
 * channels come in."
 *
 * Spektrum's keyed `data-each` binds a clone's scope to `array[index]` once
 * and only re-scopes it when that index changes, so a republish that leaves
 * a row where it was — which is exactly what appending more channels does —
 * left the clone reading the object it was first bound to. Rows whose index
 * *did* shift updated; the rest kept a line that no longer described them.
 *
 * These tests drive the real `.rows` template out of `index.html` (rather
 * than a hand-mirrored copy, which is how the `data-each="…|| []"` bug got
 * through) and assert per row id, never per position.
 */
const HOUR = 60 * 60 * 1000;
const NOW = Date.now();

function rowsTemplate(): string {
    const repoRoot = fileURLToPath(new NodeURL('../..', import.meta.url));
    const indexHtml = readFileSync(`${repoRoot}/index.html`, 'utf8');
    const host = document.createElement('div');
    host.innerHTML = indexHtml;
    const rows = host.querySelector('.rows');
    if (!rows) throw new Error('index.html has no .rows container to mount');
    return rows.outerHTML;
}

function row(id: string, epgId: string | null): ChannelRow {
    return {
        id,
        name: `Channel ${id}`,
        url: `http://example.test/${id}`,
        group: null,
        logo: null,
        tvgId: null,
        radio: false,
        ...(epgId ? { epgId } : {}),
    };
}

function program(channelId: string, title: string): EpgProgramRecord {
    return { channelId, start: NOW - HOUR, stop: NOW + HOUR, title, description: null };
}

describe('a channel row wears its own EPG line', () => {
    let mounted: MountedTemplate;

    beforeEach(() => {
        resetListPublishForTests();
        // Two of the three channels have programmes; 'b' has none, and must
        // never borrow one.
        setEpgProgramIndex(
            new Map([
                ['epg.a', [program('epg.a', 'Programme A')]],
                ['epg.c', [program('epg.c', 'Programme C')]],
            ]),
        );
        mounted = mountTemplate(rowsTemplate());
    });

    afterEach(() => {
        mounted.cleanup();
        setEpgProgramIndex(new Map());
        resetListPublishForTests();
    });

    /** What each rendered row says is on now, keyed by the channel id that row itself carries. */
    function renderedLines(): Record<string, string> {
        const lines: Record<string, string> = {};
        for (const el of mounted.queryAll<HTMLElement>('.channel-row[data-id]')) {
            const block = el.querySelector<HTMLElement>('.channel-row__epg');
            const visible = block !== null && block.style.display !== 'none';
            lines[el.dataset['id'] ?? ''] = visible
                ? (el.querySelector('.channel-row__epg-now')?.textContent?.trim() ?? '')
                : '';
        }
        return lines;
    }

    it('keeps every line on its own channel when rows are appended mid-enrichment', () => {
        // The guide has not loaded yet — this is what the first pages of a
        // chunked source load look like.
        setEpgProgramIndex(new Map());
        const a = row('a', 'epg.a');
        const b = row('b', null);
        publishListWindow([a, b], 0, 720);
        tick();
        expect(renderedLines()).toEqual({ a: '', b: '' });

        // The guide lands, and another page of channels appends behind it.
        // 'a' and 'b' keep index 0 and 1, so their clones are never
        // re-scoped: 'a' has to gain its own line all the same, and 'b' has
        // to stay bare while its new neighbour gets one.
        setEpgProgramIndex(
            new Map([
                ['epg.a', [program('epg.a', 'Programme A')]],
                ['epg.c', [program('epg.c', 'Programme C')]],
            ]),
        );
        const c = row('c', 'epg.c');
        publishListWindow([a, b, c], 0, 648);
        tick();
        expect(renderedLines()).toEqual({ a: 'Programme A', b: '', c: 'Programme C' });
    });

    it('follows the channel, not the slot, when the window scrolls past it', () => {
        publishListWindow([row('a', 'epg.a'), row('b', null)], 0, 720);
        tick();

        // Scrolled one row on: 'b' (no programmes) inherits index 0, where
        // 'a' left a line behind.
        publishListWindow([row('b', null), row('c', 'epg.c')], 72, 648);
        tick();
        expect(renderedLines()).toEqual({ b: '', c: 'Programme C' });
    });

    it('clears a line the moment its channel stops having anything on air', () => {
        const a = row('a', 'epg.a');
        publishListWindow([a], 0, 0);
        tick();
        expect(renderedLines()).toEqual({ a: 'Programme A' });

        // The 30s tick, after the programme ended and nothing replaced it:
        // the row keeps its index, and must still lose its line.
        setEpgProgramIndex(new Map([['epg.c', [program('epg.c', 'Programme C')]]]));
        publishListWindow([a], 0, 0);
        tick();
        expect(renderedLines()).toEqual({ a: '' });
    });

    it('enriches a row that was already on screen when the guide arrived', () => {
        setEpgProgramIndex(new Map());
        const a = row('a', 'epg.a');
        publishListWindow([a], 0, 0);
        tick();
        expect(renderedLines()).toEqual({ a: '' });

        setEpgProgramIndex(new Map([['epg.a', [program('epg.a', 'Programme A')]]]));
        publishListWindow([a], 0, 0);
        tick();
        expect(renderedLines()).toEqual({ a: 'Programme A' });
    });
});
