import { describe, expect, it } from 'vitest';
import { createSequenceToken } from './sequence-token';

describe('createSequenceToken()', () => {
    it('the first begin() token is current until a second begin() supersedes it', () => {
        const token = createSequenceToken();
        const a = token.begin();
        expect(token.isCurrent(a)).toBe(true);

        const b = token.begin();
        expect(token.isCurrent(a)).toBe(false);
        expect(token.isCurrent(b)).toBe(true);
    });

    it('two independent instances track separately — advancing one never affects the other', () => {
        const tokenA = createSequenceToken();
        const tokenB = createSequenceToken();
        const a = tokenA.begin();

        tokenB.begin();
        tokenB.begin();

        expect(tokenA.isCurrent(a)).toBe(true);
    });
});
