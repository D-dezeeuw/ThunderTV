import { computed, type State } from 'spektrum';
import { pluralCount } from '../app/format';
import { strings } from '../app/strings';
import {
    IMPORT_ERROR_KIND,
    IMPORT_ERROR_MESSAGE,
    IMPORT_STATE,
    IMPORT_SUMMARY,
    IMPORT_WRITTEN,
    type ImportSummaryView,
} from './import';
import { SETTINGS_LOCALE, SETTINGS_PROXY_TEMPLATE } from './settings';

interface ImportSliceState {
    import?: {
        state?: string;
        written?: number;
        errorKind?: string | null;
        errorMessage?: string | null;
        summary?: ImportSummaryView | null;
    };
    settings?: { proxyTemplate?: string | null };
}

const BUSY_STAGES = new Set(['fetching', 'reading', 'parsing', 'writing']);

/** `strings.http.failure`'s keys, indexed dynamically — every `ImportErrorKind` but `invalidM3u`/`m3u`/`duplicate`/`largeConfirm` names one of these (Feature 07.4.2/07.4.3). Read live (not hoisted into a module-scope constant) so a locale switch is reflected immediately — `strings` is a reassigned singleton, see `app/strings.ts`. */
function httpFailureStrings(): Record<string, string> {
    return strings.http.failure;
}

/**
 * Every selector here mirrors a raw `import.*` scalar into a safe,
 * display-ready top-level name — deliberately, not just for tidiness:
 * `import` is an ECMAScript reserved word, so a template expression that
 * starts with the bare token `import` (e.g. `import.state === 'error'`)
 * is a *syntax error* in Spektrum's `new Function(...)`-compiled bindings
 * (`obj.import` as a property access is fine; `import` as a leading
 * identifier is not — verified directly against the vendored engine).
 * `index.html` therefore never references `import.*` itself; it reads
 * these flat names instead, all resolved and tested here.
 */
export function registerImportSelectors(): void {
    computed('importBusy', [IMPORT_STATE], (state: State) => {
        const stage = (state as ImportSliceState).import?.state;
        return stage !== undefined && BUSY_STAGES.has(stage);
    });

    computed('importDone', [IMPORT_STATE], (state: State) => (state as ImportSliceState).import?.state === 'done');

    computed('importHasError', [IMPORT_STATE], (state: State) => (state as ImportSliceState).import?.state === 'error');

    computed('importStageLabel', [IMPORT_STATE, SETTINGS_LOCALE], (state: State) => {
        const stage = (state as ImportSliceState).import?.state;
        const s = strings.import.stage;
        if (stage === 'fetching') return s.fetching;
        if (stage === 'reading') return s.reading;
        if (stage === 'writing') return s.writing;
        return s.parsing;
    });

    /** Feature 07.5.4: durable (written), not just parsed, progress — empty until at least one chunk has landed. */
    computed('importRowsReadout', [IMPORT_WRITTEN, SETTINGS_LOCALE], (state: State) => {
        const written = (state as ImportSliceState).import?.written ?? 0;
        return written > 0 ? strings.import.rowsReadout.replace('{count}', String(written)) : '';
    });

    computed('importErrorMessage', [IMPORT_ERROR_KIND, IMPORT_ERROR_MESSAGE, SETTINGS_LOCALE], (state: State) => {
        const imp = (state as ImportSliceState).import;
        const kind = imp?.errorKind;
        if (!kind) return '';
        if (kind === 'm3u') return imp?.errorMessage ?? '';
        if (kind === 'duplicate') return strings.import.errors.duplicateTemplate.replace('{name}', imp?.errorMessage ?? '');
        if (kind === 'invalidM3u') return strings.import.errors.invalidM3u;
        if (kind === 'largeConfirm') return strings.import.errors.largeConfirm;
        return httpFailureStrings()[kind] ?? '';
    });

    computed('importSummaryHeading', [IMPORT_SUMMARY, SETTINGS_LOCALE], (state: State) => {
        const summary = (state as ImportSliceState).import?.summary;
        const s = strings.import.summary;
        return summary?.updated ? s.updatedHeading : s.heading;
    });

    computed('importSummaryLines', [IMPORT_SUMMARY, SETTINGS_LOCALE], (state: State) => {
        const summary = (state as ImportSliceState).import?.summary;
        return summary ? buildSummaryLines(summary) : [];
    });

    computed('showDuplicateConfirm', [IMPORT_ERROR_KIND], (state: State) => errorKindIs(state, 'duplicate'));
    computed('showLargeConfirm', [IMPORT_ERROR_KIND], (state: State) => errorKindIs(state, 'largeConfirm'));
    /** Feature 07.4.4: timeout is the one kind with a plain (non-proxy) one-click retry. */
    computed('showRetry', [IMPORT_ERROR_KIND], (state: State) => errorKindIs(state, 'timeout'));
    /** Feature 07.8.5: "Retry via proxy" needs both a CORS-classified failure and a configured template. The `xtream*` kinds are the same classifications reported by the Xtream import path with Xtream-specific copy. */
    computed('showRetryViaProxy', [IMPORT_ERROR_KIND, SETTINGS_PROXY_TEMPLATE], (state: State) => {
        const s = state as ImportSliceState;
        const kind = s.import?.errorKind;
        const corsClassified =
            kind === 'corsOrNetwork' ||
            kind === 'mixedContent' ||
            kind === 'xtreamCorsOrNetwork' ||
            kind === 'xtreamMixedContent';
        return corsClassified && !!s.settings?.proxyTemplate;
    });
}

function errorKindIs(state: State, kind: string): boolean {
    return (state as ImportSliceState).import?.errorKind === kind;
}

function buildSummaryLines(summary: ImportSummaryView): string[] {
    const s = strings.import.summary;
    const lines = [
        pluralCount(summary.total, s.channelTemplate, s.channelsTemplate),
        pluralCount(summary.groupCount, s.groupTemplate, s.groupsTemplate),
    ];
    if (summary.radioCount > 0) lines.push(pluralCount(summary.radioCount, s.radioSingularTemplate, s.radioTemplate));
    if (summary.skipped > 0) lines.push(pluralCount(summary.skipped, s.skippedSingularTemplate, s.skippedTemplate));
    if (summary.drmCount > 0) lines.push(pluralCount(summary.drmCount, s.drmSingularTemplate, s.drmTemplate));
    if (summary.detectedEpgUrlCount > 0) lines.push(pluralCount(summary.detectedEpgUrlCount, s.epgSingularTemplate, s.epgTemplate));
    return lines;
}
