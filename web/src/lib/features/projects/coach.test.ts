import { describe, expect, it } from 'vitest';
import { COACH_TOTAL, coachProgress, isCoachVisible, nextCoachStep } from './coach.ts';

describe('coach', () => {
	it('advances only from the matching step', () => {
		expect(nextCoachStep(0, 0)).toBe(1);
		expect(nextCoachStep(1, 0)).toBe(1);
		expect(nextCoachStep(COACH_TOTAL - 1, COACH_TOTAL - 1)).toBe(COACH_TOTAL);
		expect(nextCoachStep(COACH_TOTAL, COACH_TOTAL)).toBe(COACH_TOTAL);
	});

	it('shows a step only while unseen and current', () => {
		expect(isCoachVisible(1, 1, false)).toBe(true);
		expect(isCoachVisible(1, 2, false)).toBe(false);
		expect(isCoachVisible(1, 1, true)).toBe(false);
	});

	it('formats progress', () => {
		expect(coachProgress(0)).toBe('1/3');
		expect(coachProgress(2)).toBe('3/3');
	});
});
