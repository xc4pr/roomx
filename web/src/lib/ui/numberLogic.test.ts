import { describe, expect, it } from 'vitest';
import { clampMm, repeatDelay, stepMultiplier, stepValue } from './numberLogic.ts';

describe('stepMultiplier', () => {
	it('accelerates with hold time', () => {
		expect(stepMultiplier(0)).toBe(1);
		expect(stepMultiplier(1000)).toBe(1);
		expect(stepMultiplier(2000)).toBe(5);
		expect(stepMultiplier(5000)).toBe(10);
	});

	it('repeats faster the longer it is held', () => {
		expect(repeatDelay(500)).toBeGreaterThan(repeatDelay(2000));
		expect(repeatDelay(2000)).toBeGreaterThan(repeatDelay(4000));
	});
});

describe('stepValue', () => {
	it('steps on the grid', () => {
		expect(stepValue(2000, 1, 10, 0)).toBe(2010);
		expect(stepValue(2000, -1, 10, 0)).toBe(1990);
	});

	it('snaps off-grid values first', () => {
		expect(stepValue(2004, 1, 10, 0)).toBe(2010);
		expect(stepValue(2004, -1, 10, 0)).toBe(2000);
	});

	it('uses larger steps when held long', () => {
		expect(stepValue(2000, 1, 10, 2000)).toBe(2050);
		expect(stepValue(2000, -1, 10, 4000)).toBe(1900);
	});

	it('respects limits', () => {
		expect(stepValue(2995, 1, 10, 0, 0, 3000)).toBe(3000);
		expect(stepValue(5, -1, 10, 0, 0, 3000)).toBe(0);
		expect(clampMm(50, 100, 200)).toBe(100);
		expect(clampMm(500, undefined, 200)).toBe(200);
	});
});
