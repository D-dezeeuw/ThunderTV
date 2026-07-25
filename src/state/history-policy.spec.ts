import { history, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyHistoryPolicy, currentHistoryLimit, resetHistoryPolicyForTests } from './history-policy';

const TEST_KEY = 'historyPolicySpec.probe';

describe('history-policy (Feature 05.7)', () => {
    afterEach(() => {
        resetHistoryPolicyForTests();
        vi.unstubAllEnvs();
    });

    it('currentHistoryLimit is 200 in dev', () => {
        vi.stubEnv('PROD', false);
        expect(currentHistoryLimit()).toBe(200);
    });

    it('currentHistoryLimit is 0 in prod', () => {
        vi.stubEnv('PROD', true);
        expect(currentHistoryLimit()).toBe(0);
    });

    it('trims history to 0 entries after every record in prod — behaviorally disabled', () => {
        vi.stubEnv('PROD', true);
        applyHistoryPolicy();

        setValue(TEST_KEY, 1);
        tick();

        expect(history.length).toBe(0);
    });

    it('keeps at most 200 entries in dev, dropping the oldest first', () => {
        vi.stubEnv('PROD', false);
        applyHistoryPolicy();

        for (let i = 0; i < 210; i += 1) {
            setValue(TEST_KEY, i);
            tick();
        }

        expect(history.length).toBeLessThanOrEqual(200);
        const last = history[history.length - 1];
        expect(last?.value).toBe(209);
    });

    it('resetHistoryPolicyForTests unsubscribes so a later record is not trimmed by a stale policy', () => {
        vi.stubEnv('PROD', true);
        applyHistoryPolicy();
        resetHistoryPolicyForTests();

        setValue(TEST_KEY, 1);
        tick();

        expect(history.length).toBeGreaterThan(0);
    });
});
