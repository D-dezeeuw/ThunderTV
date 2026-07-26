import { computed, type State } from 'spektrum';
import { pluralCount } from '../app/format';
import { strings } from '../app/strings';
import { IMPORT_ERROR_KIND, IMPORT_ERROR_MESSAGE, IMPORT_STATE, IMPORT_SUMMARY, type ImportSummaryView } from './import';

interface ImportSliceState {
    import?: {
        state?: string;
        errorKind?: string | null;
        errorMessage?: string | null;
        summary?: ImportSummaryView | null;
    };
}

const BUSY_STAGES = new Set(['fetching', 'reading', 'parsing', 'writing']);

/** `strings.http.failure`'s keys, indexed dynamically — every `ImportErrorKind` but `invalidM3u`/`m3u`/`duplicate` names one of these (Feature 07.4.2/07.4.3). */
const HTTP_FAILURE_STRINGS: Record<string, string> = strings.http.failure;

export function registerImportSelectors(): void {
    computed('importBusy', [IMPORT_STATE], (state: State) => {
        const stage = (state as ImportSliceState).import?.state;
        return stage !== undefined && BUSY_STAGES.has(stage);
    });

    computed('importHasError', [IMPORT_STATE], (state: State) => (state as ImportSliceState).import?.state === 'error');

    computed('importErrorMessage', [IMPORT_ERROR_KIND, IMPORT_ERROR_MESSAGE], (state: State) => {
        const imp = (state as ImportSliceState).import;
        const kind = imp?.errorKind;
        if (!kind) return '';
        if (kind === 'm3u') return imp?.errorMessage ?? '';
        if (kind === 'duplicate') return strings.import.errors.duplicateTemplate.replace('{name}', imp?.errorMessage ?? '');
        if (kind === 'invalidM3u') return strings.import.errors.invalidM3u;
        return HTTP_FAILURE_STRINGS[kind] ?? '';
    });

    computed('importSummaryLines', [IMPORT_SUMMARY], (state: State) => {
        const summary = (state as ImportSliceState).import?.summary;
        return summary ? buildSummaryLines(summary) : [];
    });
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
