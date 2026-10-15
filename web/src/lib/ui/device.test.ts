import { describe, expect, it } from 'vitest';
import { isPhoneLike } from './device.ts';

describe('isPhoneLike', () => {
	it('treats small touch screens as phones in both orientations', () => {
		expect(isPhoneLike({ coarse: true, shortSide: 390 })).toBe(true);
		expect(isPhoneLike({ coarse: true, shortSide: 360 })).toBe(true);
	});

	it('keeps tablets and desktops out', () => {
		expect(isPhoneLike({ coarse: true, shortSide: 820 })).toBe(false);
		expect(isPhoneLike({ coarse: false, shortSide: 390 })).toBe(false);
		expect(isPhoneLike({ coarse: false, shortSide: 900 })).toBe(false);
	});
});
