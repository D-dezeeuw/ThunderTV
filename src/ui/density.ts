import { defineFn, setValue } from 'spektrum';

export type Density = 'compact' | 'comfortable';

const ROW_HEIGHT: Record<Density, number> = {
    compact: 32,
    comfortable: 44,
};

/**
 * The single number the Phase 08 virtual-list windowing controller may use
 * for row height — never measured from the DOM. Must stay in sync with the
 * `--row-h` values in tokens.css's `[data-density='compact']` override.
 */
export function rowHeight(density: Density): number {
    return ROW_HEIGHT[density];
}

function isDensity(value: string): value is Density {
    return value === 'compact' || value === 'comfortable';
}

/**
 * Registers the `setDensity` action used by the settings panel's density
 * toggle. Persistence arrives with the Phase 05 persistence bridge — for
 * now the choice is session-only (`ui.density` resets on reload), which is
 * fine: this is a UI-state key, not user data loss.
 */
export function registerDensityAction(): void {
    defineFn('setDensity', (el) => {
        const value = el.dataset['density'];
        if (!value || !isDensity(value)) return;
        // One setValue: <html>'s :data-density binding (index.html) picks
        // this up and tokens.css retargets --row-h/--row-pad-x/--logo-box.
        // Density changes re-publish the list window this same way once
        // Phase 08's windowing controller exists — never a DOM measurement.
        setValue('ui.density', value);
    });
}
