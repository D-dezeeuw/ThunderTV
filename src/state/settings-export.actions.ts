import { downloadTextFile } from '../ui/download-file';
import { SETTINGS_EXPORT_STATE } from './settings';
import { set } from './typed';

/**
 * Settings → Diagnostics' three downloads — split out of `settings.actions.ts`
 * to keep that file under the line budget; registered there via
 * `registerSettingsActions()`'s `defineFn`s, which just `void` these.
 */

const APP_VERSION = '1.0.0';

/** Filename stamp shared by every export, so a set of three files sorts together. */
function stamp(iso: string): string {
    return iso.slice(0, 19).replace(/[:T]/g, '-');
}

/**
 * The provider's replies verbatim — the untransformed counterpart to
 * `exportConfiguration()`.
 *
 * The three XML builders (`config-export.ts`/`raw-export.ts`, ~5 kB) are
 * dynamically imported rather than pulled into the entry chunk: they are
 * reachable only from Settings → Diagnostics, on a click, and most sessions
 * never open that panel at all. Async as a result, which is why the
 * `defineFn`s calling these `void` the result.
 */
export async function exportRawResponses(): Promise<void> {
    try {
        const { buildRawResponsesXml } = await import('./raw-export');
        const iso = new Date().toISOString();
        downloadTextFile(
            `thundertv-raw-${stamp(iso)}.xml`,
            'application/xml',
            buildRawResponsesXml({ generatedAt: iso, appVersion: APP_VERSION }),
        );
        set(SETTINGS_EXPORT_STATE, 'done');
    } catch {
        set(SETTINGS_EXPORT_STATE, 'failed');
    }
}

/** Async because the guide lives in storage rather than memory; failures surface in the panel like the other two. */
export async function exportEpg(): Promise<void> {
    try {
        const { buildEpgXml } = await import('./raw-export');
        const iso = new Date().toISOString();
        const xml = await buildEpgXml({ generatedAt: iso, appVersion: APP_VERSION });
        downloadTextFile(`thundertv-epg-${stamp(iso)}.xml`, 'application/xml', xml);
        set(SETTINGS_EXPORT_STATE, 'done');
    } catch {
        set(SETTINGS_EXPORT_STATE, 'failed');
    }
}

/**
 * Writes the full configuration to a downloaded XML file. Wrapped in a
 * try/catch because this runs on a click: a storage quirk or an oversized
 * source must surface as "export failed" in the panel, never as an
 * unhandled rejection that leaves the button looking inert.
 */
export async function exportConfiguration(): Promise<void> {
    try {
        const { buildConfigXml } = await import('./config-export');
        const iso = new Date().toISOString();
        const xml = buildConfigXml({ generatedAt: iso, appVersion: APP_VERSION });
        downloadTextFile(`thundertv-config-${stamp(iso)}.xml`, 'application/xml', xml);
        set(SETTINGS_EXPORT_STATE, 'done');
    } catch {
        set(SETTINGS_EXPORT_STATE, 'failed');
    }
}
