import { bindDOM, resetState, tick } from 'spektrum';
import { initState, registerActions, registerSelectors, rehydrateState } from '../../state';
import { resetHistoryPolicyForTests } from '../../state/history-policy';
import { resetPersistForTests } from '../../state/persist';

/**
 * Test-only bindDOM harness (Feature 05.10.1): mounts real markup with real
 * Spektrum bindings in jsdom, at the "user-semantics" level a page author
 * would author — every later UI phase's specs inherit this style.
 *
 * Mechanism (verified against the pinned `spektrum@1.1.0` API, Feature
 * 05.10.1's "note the mechanism"): `bindDOM(root)` performs one synchronous
 * DOM scan of `root`'s subtree, wiring `data-if`/`data-each`/`data-action`/…
 * — it is not a live MutationObserver, so markup must already carry every
 * binding a spec exercises. There is no scoped `run()`; mutations are
 * synchronous (`setValue` queues, `tick()` drains) — the same manual-tick
 * pattern every other spec in this codebase already uses instead of the
 * rAF-driven `run()` loop.
 */
export interface MountedTemplate {
    /** The mounted root element — every query is scoped under this. */
    root: HTMLElement;
    query<T extends Element = HTMLElement>(selector: string): T | null;
    queryAll<T extends Element = HTMLElement>(selector: string): T[];
    /**
     * Clicks the `[data-fn="name"]` element already present in the mounted
     * template — exactly the path a real `data-action="click"` binding
     * takes (Feature 05.10.3). `value`, when given, is written to that
     * element's `data-value` first; Spektrum's own value coercion (bool/
     * number/string only — no structured payloads) applies same as in
     * production markup.
     */
    dispatch(fnName: string, value?: string | number | boolean): void;
    /** Unbinds, unmounts, and resets state/persistence/history for the next mount (Feature 05.10.2). */
    cleanup(): void;
}

function resetHarnessState(): void {
    resetState();
    resetPersistForTests();
    resetHistoryPolicyForTests();
}

function mountAndBind(html: string): MountedTemplate {
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);

    const unbind = bindDOM(root);
    tick();

    return {
        root,
        query: <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector),
        queryAll: <T extends Element = HTMLElement>(selector: string) => [...root.querySelectorAll<T>(selector)],
        dispatch: (fnName, value) => {
            const trigger = root.querySelector<HTMLElement>(`[data-fn="${fnName}"]`);
            if (!trigger) {
                throw new Error(
                    `mountTemplate().dispatch("${fnName}"): no [data-fn="${fnName}"] element in the mounted template.`,
                );
            }
            if (value !== undefined) trigger.setAttribute('data-value', String(value));
            trigger.click();
            tick();
        },
        cleanup: () => {
            unbind();
            root.remove();
            resetHarnessState();
        },
    };
}

/**
 * Resets Spektrum state, the persistence bridge's dirty-key set, and the
 * history-policy subscription, seeds fresh module defaults, registers every
 * action/selector, mounts `html` under a fresh root appended to
 * `document.body`, and binds it — in that order, mirroring `bootstrap.ts`'s
 * real seed-before-bind sequence (Feature 05.4.3) so a spec's mount behaves
 * like a real boot, not an ad hoc fixture. Does not rehydrate — see
 * `mountAfterBoot()` for the rehydration-inclusive variant.
 */
export function mountTemplate(html: string): MountedTemplate {
    resetHarnessState();
    initState();
    registerActions();
    registerSelectors();
    tick();

    return mountAndBind(html);
}

/**
 * The full real boot order (masterplan §6.4, Feature 05.10.5): seed
 * defaults, `rehydrateState()` against whatever `getPlatform()` currently
 * resolves to (a spec wraps the call in `withFakePlatform` and seeds fake
 * storage first), *then* mount and bind — so a restored session renders
 * exactly like it would after a real reload, before any heavy load runs.
 */
export async function mountAfterBoot(html: string): Promise<MountedTemplate> {
    resetHarnessState();
    initState();
    registerActions();
    registerSelectors();
    tick();

    await rehydrateState();
    tick();

    return mountAndBind(html);
}
