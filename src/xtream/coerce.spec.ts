import { describe, expect, it } from 'vitest';
import { asArray, asBool01, asNumber, asString } from './coerce';

describe('xtream/coerce', () => {
    it('asNumber accepts real numbers and numeric strings, rejects the rest', () => {
        expect(asNumber(42)).toBe(42);
        expect(asNumber('42')).toBe(42);
        expect(asNumber('')).toBeUndefined();
        expect(asNumber('abc')).toBeUndefined();
        expect(asNumber(null)).toBeUndefined();
    });

    it('asString drops empty strings and stringifies numbers', () => {
        expect(asString('hello')).toBe('hello');
        expect(asString('')).toBeUndefined();
        expect(asString(42)).toBe('42');
        expect(asString(null)).toBeUndefined();
    });

    it('asBool01 accepts 1, "1", and true only', () => {
        expect(asBool01(1)).toBe(true);
        expect(asBool01('1')).toBe(true);
        expect(asBool01(true)).toBe(true);
        expect(asBool01(0)).toBe(false);
        expect(asBool01('0')).toBe(false);
        expect(asBool01(undefined)).toBe(false);
    });

    it('asArray passes a real array through and converts an object-as-array payload', () => {
        expect(asArray([1, 2, 3])).toEqual([1, 2, 3]);
        expect(asArray({ '0': 'a', '1': 'b' })).toEqual(['a', 'b']);
        expect(asArray(null)).toEqual([]);
        expect(asArray(undefined)).toEqual([]);
    });
});
