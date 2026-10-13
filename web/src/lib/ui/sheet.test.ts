import { describe, expect, it } from 'vitest';
import { clampFraction, nextSnap, resolveSnap } from './sheet.ts';

describe('resolveSnap', () => {
	it('snaps to the nearest stop', () => {
		expect(resolveSnap(0.3, 0, true)).toBe('peek');
		expect(resolveSnap(0.55, 0, true)).toBe('half');
		expect(resolveSnap(0.85, 0, true)).toBe('full');
	});

	it('follows the throw direction', () => {
		expect(resolveSnap(0.45, 2.5, true)).toBe('full');
		expect(resolveSnap(0.5, -0.6, true)).toBe('peek');
	});

	it('closes when pulled far down', () => {
		expect(resolveSnap(0.14, 0, true)).toBe('close');
		expect(resolveSnap(0.14, 0, false)).toBe('peek');
	});
});

describe('sheet helpers', () => {
	it('cycles snaps', () => {
		expect(nextSnap('peek')).toBe('half');
		expect(nextSnap('full')).toBe('peek');
	});

	it('clamps fractions', () => {
		expect(clampFraction(2)).toBeLessThan(1);
		expect(clampFraction(-1)).toBeGreaterThan(0);
	});
});
