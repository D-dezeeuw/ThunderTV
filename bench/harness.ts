import { ParserClient } from '../src/m3u/parser-client';
import { createPlatform, setPlatform } from '../src/core/platform';
import { MemoryStorage } from '../src/core/storage/memory-storage';

/**
 * Manual/one-off browser harness for Feature 06.10.5 — `PerformanceObserver
 * ('longtask')` main-thread health during a real 100k-channel parse, which
 * genuinely needs a real browser (jsdom has no longtask implementation, so
 * `npm run bench:m3u`'s Vitest harness can't measure this). Run via
 * `npx vite` (the dev server serves any project `.html` file, not just
 * `index.html`) and open `/bench/`, or drive it headlessly — see the
 * Phase 06 tracker's Feature 06.10 evidence for a captured run. Not wired
 * into any npm script or CI gate: automating this drive is Phase 27
 * Feature 27.6's job once `@playwright/test` is a real project dependency;
 * adding it here would front-load that phase's scope. Never imported by
 * `src/` or `index.html` — excluded from the production build by omission,
 * not by config.
 */
function generateFixtureText(count: number, seed: number): string {
    let state = seed;
    const next = (): number => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state;
    };
    const lines = ['#EXTM3U'];
    for (let i = 0; i < count; i += 1) {
        const n = i + 1;
        const group = `Group ${String((i % 200) + 1).padStart(3, '0')}`;
        const radioAttr = next() % 1000 < 50 ? ' radio="true"' : '';
        lines.push(
            `#EXTINF:-1 tvg-id="ch${String(n)}" tvg-logo="https://example.com/logos/ch${String(n)}.png" group-title="${group}"${radioAttr},Channel ${String(n)}`,
        );
        lines.push(`https://example.com/streams/ch${String(n)}.m3u8`);
    }
    return lines.join('\n') + '\n';
}

function report(line: string): void {
    const out = document.querySelector('#out');
    if (out) out.textContent += line + '\n';
    console.log(line);
}

async function run(): Promise<void> {
    const base = await createPlatform();
    setPlatform({ ...base, storage: new MemoryStorage() });

    let longTaskCount = 0;
    let maxLongTaskMs = 0;
    const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            longTaskCount += 1;
            maxLongTaskMs = Math.max(maxLongTaskMs, entry.duration);
            report(`longtask: ${entry.duration.toFixed(1)}ms at ${entry.startTime.toFixed(1)}ms`);
        }
    });
    try {
        observer.observe({ entryTypes: ['longtask'] });
    } catch {
        report('PerformanceObserver longtask entryType unsupported in this browser.');
    }

    const text = generateFixtureText(100_000, 42);
    const client = new ParserClient();

    const memBefore = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    const start = performance.now();
    const summary = await client.parse(text, 'harness-100k');
    const elapsedMs = performance.now() - start;
    const memAfter = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;

    report(`total=${String(summary.total)} elapsed=${elapsedMs.toFixed(0)}ms`);
    report(`longTaskCount=${String(longTaskCount)} maxLongTaskMs=${maxLongTaskMs.toFixed(1)}`);
    if (memBefore !== undefined && memAfter !== undefined) {
        report(`heapBefore=${String(memBefore)} heapAfter=${String(memAfter)} delta=${String(memAfter - memBefore)}`);
    } else {
        report('performance.memory unavailable in this browser.');
    }
    report('DONE');
}

void run();
