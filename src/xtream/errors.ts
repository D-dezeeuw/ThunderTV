import type { FetchFailure } from '../core/http/classified-fetch';

/** Xtream failure taxonomy (Phase 19 Feature 19.5) — built on `core/http`'s classified fetch, plus the two Xtream-specific wire shapes: an HTML login page and a JSON `auth: 0` body. */
export type XtreamErrorKind = 'auth-failed' | 'cors-or-network' | 'http' | 'timeout' | 'provider-empty' | 'bad-payload';

export interface XtreamError {
    kind: XtreamErrorKind;
    /** The failing action, e.g. `get_live_streams` — never a raw URL (no credential can appear here). */
    action: string;
}

export function classifyXtreamHttpFailure(action: string, failure: FetchFailure): XtreamError {
    switch (failure.kind) {
        case 'http':
            return { kind: failure.status === 401 || failure.status === 403 ? 'auth-failed' : 'http', action };
        case 'timeout':
            return { kind: 'timeout', action };
        case 'cors-or-network':
        case 'mixed-content':
            return { kind: 'cors-or-network', action };
        case 'too-large':
            return { kind: 'bad-payload', action };
    }
}

/** A 200 response whose body starts with `<` is an HTML login page, not JSON — classifies as `auth-failed`, not a parse failure (Feature 19.5.3). */
export function looksLikeHtmlLoginPage(body: string): boolean {
    return body.trimStart().startsWith('<');
}
