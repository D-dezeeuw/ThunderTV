import { describe, expect, it } from 'vitest';
import { subtitleLabel, subtitleLang, toVtt } from './subtitle-text';

const SRT = ['1', '00:00:20,000 --> 00:00:24,400', 'Where are we?', '', '2', '00:00:24,600 --> 00:00:27,800', 'Somewhere else.', ''].join('\r\n');

describe('toVtt', () => {
    it('converts SubRip: header prepended, comma decimals turned into points', () => {
        const vtt = toVtt(SRT);
        expect(vtt?.startsWith('WEBVTT\n\n')).toBe(true);
        expect(vtt).toContain('00:00:20.000 --> 00:00:24.400');
        expect(vtt).toContain('00:00:24.600 --> 00:00:27.800');
        expect(vtt).not.toContain(',000');
        // CRLF normalized — a stray \r after a timestamp voids the cue.
        expect(vtt).not.toContain('\r');
    });

    it('passes WebVTT through without a second header, BOM stripped', () => {
        const vtt = toVtt('﻿WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n');
        expect(vtt?.startsWith('WEBVTT')).toBe(true);
        expect(vtt?.match(/WEBVTT/g)).toHaveLength(1);
    });

    it('rejects text with no cues at all rather than attaching an empty track', () => {
        expect(toVtt('just some notes about the film')).toBeNull();
        expect(toVtt('')).toBeNull();
    });
});

describe('subtitleLabel / subtitleLang', () => {
    it('labels with the filename stem, keeping the distinguishing tail when long', () => {
        expect(subtitleLabel('The.Film.2019.eng.srt')).toBe('The.Film.2019.eng');
        expect(subtitleLabel(`${'x'.repeat(50)}.forced.nl.srt`)).toMatch(/^…/);
        expect(subtitleLabel(`${'x'.repeat(50)}.forced.nl.srt`).length).toBe(37);
    });

    it('reads a trailing 2-3 letter language tag, and only that', () => {
        expect(subtitleLang('The.Film.2019.eng.srt')).toBe('eng');
        expect(subtitleLang('film-nl.vtt')).toBe('nl');
        // A wrong srclang drives the auto-pick, so anything unclear stays ''.
        expect(subtitleLang('The.Film.2019.srt')).toBe('');
        expect(subtitleLang('subtitles.srt')).toBe('');
    });
});
