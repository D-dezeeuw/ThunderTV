import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureAudioTap, resetAudioTapForTests, SILENT_TAP } from './audio-tap';

/**
 * The one behaviour worth locking down: the tap listens without ever taking
 * over the element's output. Everything else here (capture missing, capture
 * throwing, a track arriving late) is a route back to `SILENT_TAP`, which is
 * what keeps a movie audible when its audio cannot be analysed.
 */

class FakeTrack {}

class FakeStream {
    private readonly listeners: Record<string, (() => void)[]> = {};
    constructor(private audio: FakeTrack[] = []) {}
    getAudioTracks(): FakeTrack[] {
        return this.audio;
    }
    addEventListener(type: string, cb: () => void): void {
        (this.listeners[type] ??= []).push(cb);
    }
    removeEventListener(type: string, cb: () => void): void {
        this.listeners[type] = (this.listeners[type] ?? []).filter((fn) => fn !== cb);
    }
    /** Simulates the audio track showing up after the capture was taken. */
    growAudio(): void {
        this.audio = [new FakeTrack()];
        for (const cb of [...(this.listeners['addtrack'] ?? [])]) cb();
    }
}

const connections: { from: string; to: string }[] = [];

function fakeAudioContext(): unknown {
    return class {
        state = 'running';
        sampleRate = 44_100;
        destination = { name: 'destination' };
        createMediaStreamSource(): unknown {
            return {
                connect: (target: { name: string }) =>
                    connections.push({ from: 'source', to: target.name }),
            };
        }
        createAnalyser(): unknown {
            return {
                name: 'analyser',
                fftSize: 0,
                smoothingTimeConstant: 0,
                minDecibels: 0,
                maxDecibels: 0,
                connect: (target: { name: string }) =>
                    connections.push({ from: 'analyser', to: target.name }),
                getByteFrequencyData: (out: Uint8Array) => out.fill(200),
                getByteTimeDomainData: (out: Uint8Array) => out.fill(90),
            };
        }
        resume(): void {}
    };
}

function videoWith(capture: (() => FakeStream) | null, currentSrc = 'blob:one'): HTMLVideoElement {
    const el = { currentSrc, srcObject: null } as unknown as Record<string, unknown>;
    if (capture) el['captureStream'] = capture;
    return el as unknown as HTMLVideoElement;
}

afterEach(() => {
    resetAudioTapForTests();
    connections.length = 0;
    vi.unstubAllGlobals();
});

describe('ensureAudioTap', () => {
    it('never routes the element through the graph — analyser is not connected to the destination', () => {
        vi.stubGlobal('AudioContext', fakeAudioContext());
        const stream = new FakeStream([new FakeTrack()]);
        const tap = ensureAudioTap(videoWith(() => stream));

        expect(tap.live).toBe(true);
        expect(connections).toEqual([{ from: 'source', to: 'analyser' }]);
        expect(connections.some((c) => c.to === 'destination')).toBe(false);
    });

    it('falls back to the silent tap when the browser has no captureStream()', () => {
        vi.stubGlobal('AudioContext', fakeAudioContext());
        const tap = ensureAudioTap(videoWith(null));

        const freq = new Uint8Array(4);
        const wave = new Uint8Array(4);
        tap.read(freq, wave);
        expect(tap.live).toBe(false);
        expect([...freq]).toEqual([0, 0, 0, 0]);
        // 128, not 0 — the zero line of a byte waveform.
        expect([...wave]).toEqual([128, 128, 128, 128]);
    });

    it('falls back to the silent tap when capture throws (a cross-origin, tainted element)', () => {
        vi.stubGlobal('AudioContext', fakeAudioContext());
        const tap = ensureAudioTap(
            videoWith(() => {
                throw new Error('InvalidStateError');
            }),
        );
        expect(tap).toBe(SILENT_TAP);
    });

    it('upgrades to a live tap once a capture taken before the audio track grows one', () => {
        vi.stubGlobal('AudioContext', fakeAudioContext());
        const stream = new FakeStream([]);
        const onUpgrade = vi.fn();
        const video = videoWith(() => stream);

        expect(ensureAudioTap(video, onUpgrade).live).toBe(false);
        expect(onUpgrade).not.toHaveBeenCalled();

        stream.growAudio();
        expect(onUpgrade).toHaveBeenCalledTimes(1);
        expect(ensureAudioTap(video).live).toBe(true);
    });

    it('re-taps when the same element starts a different stream', () => {
        vi.stubGlobal('AudioContext', fakeAudioContext());
        const captures = vi.fn(() => new FakeStream([new FakeTrack()]));
        // One long-lived element, as in the app: only its stream changes.
        const video = videoWith(captures, 'blob:one');

        ensureAudioTap(video);
        ensureAudioTap(video);
        expect(captures).toHaveBeenCalledTimes(1);

        (video as unknown as { currentSrc: string }).currentSrc = 'https://provider/movie/1.mkv';
        ensureAudioTap(video);
        expect(captures).toHaveBeenCalledTimes(2);
    });
});
