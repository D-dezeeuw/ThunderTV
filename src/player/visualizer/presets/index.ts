import type { VisualizerPreset } from '../types';
import { BluesPreset } from './blues-preset';
import { ClassicalPreset } from './classical-preset';
import { EdmPreset } from './edm-preset';
import { FractalTunnelPreset } from './fractal-tunnel-preset';
import { JazzPreset } from './jazz-preset';
import { KaleidoscopePreset } from './kaleidoscope-preset';
import { MetalPreset } from './metal-preset';
import { ParticlesPreset } from './particles-preset';
import { RockPreset } from './rock-preset';
import { SpectrumPreset } from './spectrum-preset';

/**
 * One fresh instance per preset — each holds its own particle array/
 * offscreen buffer/angle state, so instances are never shared or reused
 * across a session. Order is the auto-cycle order and the "Next visual"
 * order: the four abstract presets first, then the six genre presets a
 * listener can pin to directly from the visualizer-preset picker
 * (`index.html`'s `#radio-visualizer-select`, `state/player.actions.ts`'s
 * `player/setVisualizerPreset`) — no audio analysis picks these, the
 * listener does.
 */
export function createRadioVisualizerPresets(): VisualizerPreset[] {
    return [
        new SpectrumPreset(),
        new ParticlesPreset(),
        new KaleidoscopePreset(),
        new FractalTunnelPreset(),
        new EdmPreset(),
        new JazzPreset(),
        new BluesPreset(),
        new RockPreset(),
        new MetalPreset(),
        new ClassicalPreset(),
    ];
}
