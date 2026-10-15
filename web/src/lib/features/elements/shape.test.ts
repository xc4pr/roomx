import { describe, expect, it } from 'vitest';
import { WALL_THICKNESS } from '#lib/core/defaults.ts';
import type { WallElement } from '#lib/core/schema.ts';
import { hitBounds, lateralMeasure, localBounds } from './shape.ts';

const door: WallElement = {
	id: 'd',
	kind: 'door',
	status: 'existing',
	wall: 1,
	offset: 500,
	width: 900,
	height: 2000,
	elevation: 0,
	hinge: 'start',
	swing: 'in'
};

describe('wall element shape', () => {
	it('draws the reveal of a door or window in the real wall thickness', () => {
		expect(localBounds(door, 0.1).y0).toBe(-WALL_THICKNESS);
		expect(localBounds(door, 0.1, 100).y0).toBe(-100);
		expect(localBounds(door, 0.1, 300)).toMatchObject({ x0: 500, x1: 1400, y0: -300, y1: 0 });
		expect(
			localBounds({ ...door, kind: 'window', windowType: 'fixed' } as WallElement, 0.1, 250).y0
		).toBe(-250);
	});

	it('places the measuring line and hit area outside the thicker wall', () => {
		expect(lateralMeasure(door, 0.1, 300)).toBeLessThan(lateralMeasure(door, 0.1, 100));
		expect(lateralMeasure(door, 0.1, 300)).toBeCloseTo(-(300 + 260));
		expect(hitBounds(door, 0.1, 44, 300).y0).toBeLessThanOrEqual(-300);
	});
});
