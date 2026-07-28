import { describe, expect, it } from 'vitest';
import { isRadioGroup, looksLikeRadioName, radioClassifierFor } from './radio-detect';

/**
 * Names taken from the committed config export's own data: the Live filter
 * readout lists the stations that leaked into the TV list, and the channel
 * dump carries the television channels that a naive `\bradio\b` test
 * claimed. Both sets are the actual regression material.
 */
const STATIONS = [
    '077 RADIO MEIJEL',
    'NPO RADIO 1',
    'NPO 3FM',
    'SKY RADIO 101 FM',
    'BNR NIEUWSRADIO',
    'RADIO 538',
    'WILD FM',
    'URK FM',
    'ZWOLLE FM',
    'OMROEP FLEVOLAND RADIO',
    'SLAM!',
    'QMUSIC',
    'SUBLIME',
    'JUKE HOUSE',
];

const TELEVISION = [
    '┃NL┃ NPO 1 HD  ⏺ʳᵉᶜ',
    '┃NL┃ RTL 4 HD   ⏺ʳᵉᶜ',
    '┃DE┃ RADIO BREMEN TV FHD',
    '┃CA FR┃ ICI RADIO-CANADA TELE MONTREAL HD',
    '┃IT┃ RADIO ITALIA HD',
    '┃LU┃ RTL RADIO HD',
    '┃NL┃ VIAPLAY TV HD',
    '┃NL┃ ZIGGO SPORT 4K',
];

describe('looksLikeRadioName', () => {
    it('claims a station only when the name is unambiguous', () => {
        expect(looksLikeRadioName('NPO RADIO 1')).toBe(true);
        expect(looksLikeRadioName('WILD FM')).toBe(true);
        expect(looksLikeRadioName('NPO 3FM')).toBe(true);
    });

    it('never claims a television channel that merely says "radio"', () => {
        // Every one of these is a TV channel in the real catalogue; the old
        // per-name `\bradio\b` test put all of them in the Radio list.
        for (const name of TELEVISION) {
            expect(looksLikeRadioName(name), name).toBe(false);
        }
    });

    it('leaves station names with no medium signal alone', () => {
        // Correct on its own terms — these are only reachable through their
        // group, which is the whole reason group classification exists.
        expect(looksLikeRadioName('SLAM!')).toBe(false);
        expect(looksLikeRadioName('QMUSIC')).toBe(false);
    });
});

describe('isRadioGroup', () => {
    it('takes the category at its word when it names the medium', () => {
        expect(isRadioGroup('┃NL┃ RADIO', ['SLAM!', 'QMUSIC'])).toBe(true);
        expect(isRadioGroup('NL | RADIOZENDERS', [])).toBe(true);
        expect(isRadioGroup('FM STATIONS', [])).toBe(true);
    });

    it('does not take a television category at its word', () => {
        expect(isRadioGroup('┃IT┃ RADIO TV HD', TELEVISION)).toBe(false);
    });

    it('recognises a radio bundle from its membership when the name is silent', () => {
        // This is the case that left the Radio view empty: a Dutch provider
        // filing its stations under a genre name.
        expect(isRadioGroup('┃NL┃ MUZIEK | ZENDERS', STATIONS)).toBe(true);
    });

    it('leaves a television category alone however it is named', () => {
        expect(isRadioGroup('┃NL┃ NEDERLAND HD | TERUGKIJKEN ⏺', TELEVISION)).toBe(false);
        expect(isRadioGroup('┃NL┃ AMUSEMENT | MUZIEK', TELEVISION)).toBe(false);
    });

    it('needs more than a couple of names before a majority means anything', () => {
        expect(isRadioGroup('MISC', ['WILD FM', 'URK FM'])).toBe(false);
    });
});

describe('radioClassifierFor', () => {
    it('marks every row in a recognised bundle, including the silent names', () => {
        const isRadio = radioClassifierFor('┃NL┃ MUZIEK | ZENDERS', STATIONS);
        for (const name of STATIONS) expect(isRadio(name), name).toBe(true);
    });

    it('outside a bundle, falls back to the strict per-name test', () => {
        const isRadio = radioClassifierFor('┃NL┃ NEDERLAND HD | TERUGKIJKEN ⏺', TELEVISION);
        for (const name of TELEVISION) expect(isRadio(name), name).toBe(false);
        expect(isRadio('NPO RADIO 2')).toBe(true);
    });

    it('a mixed general category still catches the obvious stations', () => {
        const names = [...TELEVISION, 'NPO RADIO 1', 'SKY RADIO 101 FM'];
        const isRadio = radioClassifierFor('┃NL┃ ALLES', names);
        expect(isRadio('NPO RADIO 1')).toBe(true);
        expect(isRadio('┃NL┃ NPO 1 HD  ⏺ʳᵉᶜ')).toBe(false);
    });
});
