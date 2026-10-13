import { describe, expect, it } from 'vitest';
import { backoffDelay } from './backoff.ts';

describe('backoffDelay', () => {
	it('starts at five seconds and doubles', () => {
		expect([1, 2, 3, 4].map(backoffDelay)).toEqual([5_000, 10_000, 20_000, 40_000]);
	});

	it('caps at five minutes', () => {
		expect(backoffDelay(7)).toBe(300_000);
		expect(backoffDelay(50)).toBe(300_000);
	});

	it('treats zero failures as the first step', () => {
		expect(backoffDelay(0)).toBe(5_000);
	});
});
