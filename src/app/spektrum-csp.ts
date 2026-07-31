import { precompile } from 'spektrum';

type ExpressionFn = (
    state: Record<string, unknown>,
    scope?: Record<string, unknown>,
) => unknown;
type ExpressionRecord = readonly [source: string, evaluate: ExpressionFn];

/**
 * Registers the external, build-generated expression functions before the
 * app can call bindDOM(). A missing registry is a release-integrity failure:
 * silently falling back would only surface later as CSP-blocked UI bindings.
 */
export function installSpektrumCspExpressions(): void {
    const target = globalThis as typeof globalThis & {
        __THUNDERTV_CSP_EXPRESSIONS__?: ExpressionRecord[];
    };
    const records = target.__THUNDERTV_CSP_EXPRESSIONS__;
    if (!records) {
        throw new Error('Spektrum CSP expression registry did not load');
    }
    for (const [source, evaluate] of records) precompile(source, evaluate);
    delete target.__THUNDERTV_CSP_EXPRESSIONS__;
}
