/**
 * Feature 08.4.3/08.4.4: one delegated listener pair on the rows container —
 * `error`/`load` on an `<img>` don't bubble, so both must be attached with
 * `capture: true` to be caught at the container level at all. Toggles a CSS
 * class on the logo box rather than injecting/removing DOM nodes, so a
 * recycled row (Spektrum rebinding `:src` to a new item during scroll)
 * self-corrects the moment the *new* image's own load/error fires — no
 * manual cleanup, no risk of a stray injected placeholder accumulating
 * across scroll events (Feature 08.4.4's "old logo must not flash on the
 * new channel" contract).
 */
const BROKEN_CLASS = 'channel-row__logo--broken';

export function attachLogoFallback(rowsContainer: HTMLElement): () => void {
    const onError = (event: Event): void => {
        asLogoImg(event.target)
            ?.closest<HTMLElement>('.channel-row__logo')
            ?.classList.add(BROKEN_CLASS);
    };
    const onLoad = (event: Event): void => {
        asLogoImg(event.target)
            ?.closest<HTMLElement>('.channel-row__logo')
            ?.classList.remove(BROKEN_CLASS);
    };

    rowsContainer.addEventListener('error', onError, true);
    rowsContainer.addEventListener('load', onLoad, true);
    return () => {
        rowsContainer.removeEventListener('error', onError, true);
        rowsContainer.removeEventListener('load', onLoad, true);
    };
}

function asLogoImg(target: EventTarget | null): HTMLImageElement | null {
    return target instanceof HTMLImageElement && target.classList.contains('channel-row__logo-img') ? target : null;
}
