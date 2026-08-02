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

    // Everything below is a cue a browser drops *silently* — the track
    // attaches, the menu lists it, and no text ever appears. A file fetched
    // from the internet gets no second pair of eyes, so these are the cases
    // that decide whether the feature works at all.
    it('pads short hours and hour-less stamps, which WebVTT rejects outright', () => {
        const vtt = toVtt('1\n0:00:01,000 --> 0:00:02,000\nA\n\n2\n01:02,500 --> 01:03,000\nB\n');
        expect(vtt).toContain('00:00:01.000 --> 00:00:02.000');
        expect(vtt).toContain('00:01:02.500 --> 00:01:03.000');
    });

    it('pads a short fraction on the right — ",5" is half a second, not five milliseconds', () => {
        expect(toVtt('1\n00:00:01,5 --> 00:00:02,25\nA\n')).toContain('00:00:01.500 --> 00:00:02.250');
    });

    it('normalizes arrow spacing, including the no-space and tab spellings', () => {
        const vtt = toVtt('1\n00:00:01,000-->00:00:02,000\nA\n\n2\n00:00:03,000\t-->\t00:00:04,000\nB\n');
        expect(vtt).toContain('00:00:01.000 --> 00:00:02.000');
        expect(vtt).toContain('00:00:03.000 --> 00:00:04.000');
    });

    it('keeps multi-line cues and tolerates a malformed one instead of failing the file', () => {
        const vtt = toVtt('1\n00:00:01,000 --> 00:00:02,000\nfirst line\nsecond line\n\n2\nnot a timestamp\nstray\n\n3\n00:00:05,000 --> 00:00:06,000\nlast\n');
        expect(vtt).toContain('first line\nsecond line');
        expect(vtt).toContain('00:00:05.000 --> 00:00:06.000');
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
