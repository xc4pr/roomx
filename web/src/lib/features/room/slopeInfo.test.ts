import { describe, expect, it } from 'vitest';
import { clampAngle, defaultSlope, slopeInfo } from './slopeInfo.ts';

describe('slopeInfo', () => {
	it('derives the distances from the wall', () => {
		expect(slopeInfo({ height: 2500 }, { wall: 1, kneeHeight: 1000, angle: 45 })).toEqual({
			kind: 'standing',
			full: 1500,
			standing: 1000
		});
	});

	it('handles knee walls that are already standing height', () => {
		expect(slopeInfo({ height: 2500 }, { wall: 1, kneeHeight: 2100, angle: 45 }).kind).toBe(
			'standingAtWall'
		);
	});

	it('omits standing height in low rooms and flat slopes', () => {
		expect(slopeInfo({ height: 1900 }, { wall: 1, kneeHeight: 1000, angle: 45 }).kind).toBe('full');
		expect(slopeInfo({ height: 2500 }, { wall: 1, kneeHeight: 2500, angle: 45 }).kind).toBe('none');
	});

	it('uses sensible defaults and clamps the angle', () => {
		expect(defaultSlope({ height: 2500 })).toEqual({ kneeHeight: 1000, angle: 45 });
		expect(defaultSlope({ height: 1000 }).kneeHeight).toBe(900);
		expect(clampAngle(2)).toBe(5);
		expect(clampAngle(120)).toBe(85);
		expect(clampAngle(37.26)).toBe(37.3);
	});
});
