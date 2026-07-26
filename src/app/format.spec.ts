import { describe, expect, it } from 'vitest';
import { pluralCount } from './format';

describe('pluralCount (Feature 07.6.9)', () => {
    it('uses the singular template for exactly 1', () => {
        expect(pluralCount(1, '{count} group', '{count} groups')).toBe('1 group');
    });

    it('uses the plural template for 0', () => {
        expect(pluralCount(0, '{count} group', '{count} groups')).toBe('0 groups');
    });

    it('uses the plural template for counts greater than 1', () => {
        expect(pluralCount(245, '{count} group', '{count} groups')).toBe('245 groups');
    });
});
