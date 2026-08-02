import { strings } from '../app/strings';
import { getPlatform, hasPlatform } from '../core/platform';
import { judgeAudioCodec, judgeVideoCodec } from '../player/codec-support';

/**
 * The one line a movie/series detail pane shows *before* play when this
 * device is not going to be able to play the title properly — "No sound on
 * this device", most of the time.
 *
 * Two sources feed it, and they are deliberately unequal:
 *
 *  - the panel's own `get_vod_info` codec blocks, which are free but
 *    frequently wrong or absent (`src/xtream/coerce.ts`'s `codecName`);
 *  - what this device *learned* by actually playing the title, which is
 *    right by construction (added in the follow-up commit here —
 *    `src/player/no-audio-marks.ts`).
 *
 * Neither may ever block playback. A viewer who presses Play on a warned
 * title gets exactly what they got before this existed, message included;
 * the point is that the warning arrives before the two minutes it used to
 * take to find out.
 *
 * The desktop answers `'ok'` to the same AC-3 a browser calls `'silent'`,
 * because it has ffmpeg (`judgeAudioCodec`'s `canTranscode`) — the whole
 * question is per-device, which is why nothing here is cached in the
 * catalog's stored payloads.
 */
export function catalogAudioWarning(audioCodec?: string | null, videoCodec?: string | null): string | null {
    // The absence of `audioTranscode` *is* the capability check, exactly as
    // `src/core/platform/transcode-adapter.ts`'s header describes. Guarded by
    // `hasPlatform()` so the detail mappers that call this stay callable in a
    // spec that is testing something else entirely.
    const canTranscode = hasPlatform() && Boolean(getPlatform().audioTranscode);
    if (judgeVideoCodec(videoCodec) === 'unplayable') return strings.catalog.noPictureWarning;
    return judgeAudioCodec(audioCodec, canTranscode) === 'silent' ? strings.catalog.noSoundWarning : null;
}
