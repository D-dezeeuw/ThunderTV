import type { VisualizerPreset } from '../types';
import { FractalTunnelPreset } from './fractal-tunnel-preset';
import { KaleidoscopePreset } from './kaleidoscope-preset';
import { ParticlesPreset } from './particles-preset';
import { SpectrumPreset } from './spectrum-preset';

/** One fresh instance per preset — each holds its own particle array/offscreen buffer/angle state, so instances are never shared or reused across a session. Cycle order is deliberate: spectrum (calmest) first, tunnel (most intense) last. */
export function createRadioVisualizerPresets(): VisualizerPreset[] {
    return [new SpectrumPreset(), new ParticlesPreset(), new KaleidoscopePreset(), new FractalTunnelPreset()];
}
