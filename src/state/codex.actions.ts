import { defineFn } from 'spektrum';
import { strings } from '../app/strings';
import { buildCodex } from '../codex/build';
import { importCodex, type CodexImportProblem } from '../codex/apply';
import { codexCryptoAvailable, loadOrCreateIdentity } from '../codex/signing';
import { countryForLiveToken } from '../epg/countries';
import { getPlatform } from '../core/platform';
import { downloadTextFile } from '../ui/download-file';
import { CODEX_AUTHOR_ID, CODEX_MESSAGE, CODEX_STATE, type CodexUiState } from './codex';
import { publishHealthCounts } from './health.actions';
import { refreshLiveRows } from './live.actions';
import { SETTINGS_LIVE_COUNTRY } from './settings';
import { get, set } from './typed';

/** `.json` because a Codex is exactly that, and because a user should be able to open one in any editor and read it (the vision's "human-readable"). */
const CODEX_ACCEPT = '.json,application/json';

export function registerCodexActions(): void {
    defineFn('codex/export', () => {
        void exportCodex();
    });
    defineFn('codex/import', () => {
        void importCodexFromFile();
    });
}

function report(state: CodexUiState, message: string): void {
    set(CODEX_STATE, state);
    set(CODEX_MESSAGE, message);
}

/** Publishes this device's author fingerprint for the Settings readout, creating an identity if none exists yet. */
export async function publishCodexAuthorId(): Promise<void> {
    if (!codexCryptoAvailable()) return;
    try {
        const identity = await loadOrCreateIdentity();
        set(CODEX_AUTHOR_ID, identity.author.id);
    } catch {
        // Non-fatal: the readout simply stays blank.
    }
}

export async function exportCodex(): Promise<void> {
    if (!codexCryptoAvailable()) {
        report('failed', strings.codex.unavailable);
        return;
    }
    report('busy', '');
    try {
        // Only the selected country's mapping: a Codex should describe what
        // this device actually knows, and mappings for a country the user
        // has since switched away from are stale by definition.
        const token = get<string>(SETTINGS_LIVE_COUNTRY) ?? '';
        const countries = countryForLiveToken(token) ? [token] : [];
        const document = await buildCodex(countries);

        const stamp = new Date(document.body.generatedAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
        downloadTextFile(`thundertv-codex-${stamp}.json`, 'application/json', JSON.stringify(document, null, 2));

        set(CODEX_AUTHOR_ID, document.body.author.id);
        report(
            'done',
            `${strings.codex.exported} ${String(document.body.identity.length)} · ${String(document.body.health.length)}`,
        );
    } catch {
        report('failed', strings.codex.exportFailed);
    }
}

const PROBLEM_MESSAGES: Record<CodexImportProblem, () => string> = {
    'not-json': () => strings.codex.notJson,
    'not-a-codex': () => strings.codex.notACodex,
    'bad-signature': () => strings.codex.badSignature,
};

export async function importCodexFromFile(): Promise<void> {
    report('busy', '');
    try {
        const picked = await getPlatform().files.pickFile(CODEX_ACCEPT);
        if (!picked) {
            report('idle', '');
            return;
        }
        const read = await getPlatform().files.readText(picked.file);
        if (read.kind !== 'ok') {
            report('failed', strings.codex.readFailed);
            return;
        }

        const result = await importCodex(read.text);
        if (!result.ok) {
            report('failed', PROBLEM_MESSAGES[result.problem ?? 'not-a-codex']());
            return;
        }

        // Imported claims change both what the list knows and what it shows.
        publishHealthCounts();
        refreshLiveRows();
        report(
            'done',
            `${strings.codex.imported} ${String(result.identityApplied)} · ${String(result.healthApplied)}`,
        );
    } catch {
        report('failed', strings.codex.readFailed);
    }
}
