/**
 * Shared long-press gesture (Feature 08.8.2) — pointerdown + ~500ms timer,
 * cancelled by pointerup/pointermove-past-threshold/pointerleave/
 * pointercancel. Dispatches the same effect as right-click/`contextmenu`.
 * Ignores `pointerType === 'mouse'` — a mouse already has native right-click.
 */
const LONG_PRESS_MS = 500;
const MOVE_CANCEL_THRESHOLD_PX = 10;
/** Feature 08.8.8: some touch browsers *also* fire a native `contextmenu` for the same physical long-press gesture — this window suppresses that immediate duplicate so one gesture never produces two toggles (add-then-remove would otherwise net out to nothing, not the "one state change" the feature asks for). */
const SUPPRESS_WINDOW_MS = 350;

let lastFiredAt = 0;

/** Called by the long-press timer when it fires — never call this from elsewhere. */
function markLongPressFired(): void {
    lastFiredAt = Date.now();
}

/** True for a brief window after a long-press just fired — callers gate their own `contextmenu` handling on this to avoid a double toggle from one gesture (Feature 08.8.8). */
export function wasJustLongPressed(): boolean {
    return Date.now() - lastFiredAt < SUPPRESS_WINDOW_MS;
}

export interface LongPressHandlers {
    onLongPress: (target: HTMLElement) => void;
}

/**
 * Attaches delegated long-press handling to `el` (typically the rows
 * container — one listener set for every row, per plan). `resolveTarget`
 * maps a raw event target to the row element the gesture applies to (or
 * `null` to ignore it, e.g. a click outside any row). Returns a cleanup
 * function.
 */
export function attachLongPress(
    el: HTMLElement,
    resolveTarget: (eventTarget: HTMLElement) => HTMLElement | null,
    handlers: LongPressHandlers,
): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let startX = 0;
    let startY = 0;

    function clear(): void {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    }

    function onPointerDown(event: PointerEvent): void {
        if (event.pointerType === 'mouse') return;
        const target = resolveTarget(event.target as HTMLElement);
        if (!target) return;
        startX = event.clientX;
        startY = event.clientY;
        clear();
        timer = setTimeout(() => {
            timer = null;
            markLongPressFired();
            handlers.onLongPress(target);
        }, LONG_PRESS_MS);
    }

    function onPointerMove(event: PointerEvent): void {
        if (timer === null) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (Math.hypot(dx, dy) > MOVE_CANCEL_THRESHOLD_PX) clear();
    }

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', clear);
    el.addEventListener('pointerleave', clear);
    el.addEventListener('pointercancel', clear);

    return () => {
        clear();
        el.removeEventListener('pointerdown', onPointerDown);
        el.removeEventListener('pointermove', onPointerMove);
        el.removeEventListener('pointerup', clear);
        el.removeEventListener('pointerleave', clear);
        el.removeEventListener('pointercancel', clear);
    };
}

/** Test-only: resets the suppression window between specs. @internal */
export function resetLongPressForTests(): void {
    lastFiredAt = 0;
}
