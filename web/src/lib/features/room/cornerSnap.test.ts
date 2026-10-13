import { describe, expect, it } from 'vitest';
import { gridForZoom, snapCorner, snapGrid } from './cornerSnap.ts';

const base = {
	prev: { x: 4000, y: 0 },
	before: { x: 0, y: 0 },
	others: [],
	grid: 10,
	angleStep: 90,
	tolerance: 30
};

describe('snapCorner', () => {
	it('rounds to the grid', () => {
		expect(snapGrid(1234, 50)).toBe(1250);
		expect(
			snapCorner(
				{ x: 1234, y: 5678 },
				{ ...base, prev: { x: 0, y: 0 }, before: undefined, angleStep: 90 }
			).point.x
		).toBeDefined();
	});

	it('snaps to a right angle relative to the previous wall', () => {
		const result = snapCorner({ x: 4012, y: 2987 }, base);
		expect(result.angleSnapped).toBe(true);
		expect(result.point).toEqual({ x: 4000, y: 2990 });
	});

	it('keeps free angles when far from a step', () => {
		const result = snapCorner({ x: 5000, y: 2000 }, base);
		expect(result.angleSnapped).toBe(false);
		expect(result.point).toEqual({ x: 5000, y: 2000 });
	});

	it('snaps to 45 degrees', () => {
		const result = snapCorner({ x: 4990, y: 1010 }, { ...base, angleStep: 45 });
		expect(result.angleSnapped).toBe(true);
		expect(result.point.x - 4000).toBe(result.point.y);
	});

	it('aligns with other corners', () => {
		const result = snapCorner(
			{ x: 4300, y: 2995 },
			{ ...base, angleStep: 15, others: [{ x: 0, y: 3000 }] }
		);
		expect(result.point.y).toBe(3000);
		expect(result.alignY).toEqual({ x: 0, y: 3000 });
	});

	it('uses coarser grids when zoomed out', () => {
		expect(gridForZoom(1)).toBe(10);
		expect(gridForZoom(0.3)).toBe(50);
		expect(gridForZoom(0.05)).toBe(100);
		expect(gridForZoom(0.05, true)).toBe(10);
	});
});
