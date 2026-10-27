import { describe, expect, it } from 'vitest';
import { rectanglePolygon } from '#lib/core/defaults.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import type { RoofWindow } from '#lib/core/schema.ts';
import { placementAt } from './logic.ts';
import { clampRoofOffset, pickSlopeWall, roofWindowOutline, slopedWalls } from './roof.ts';

const room = {
	polygon: rectanglePolygon(6000, 3000),
	height: 2500,
	elements: [],
	slopes: [
		{ id: 's1', wall: 1, kneeHeight: 500, angle: 45, from: 1000, to: 5000 },
		{ id: 's3', wall: 3, kneeHeight: 500, angle: 45 }
	]
};

const windowAt = (offset: number, wall = 1): RoofWindow => ({
	id: 'r1',
	kind: 'roofWindow',
	status: 'existing',
	wall,
	offset,
	width: 780,
	length: 1180,
	elevation: 1000
});

describe('roof windows in the plan', () => {
	it('finds the walls with a slope', () => {
		expect(slopedWalls(room).map((side) => side.number)).toEqual([1, 3]);
	});

	it('projects the window onto the floor in the slope', () => {
		const outline = roofWindowOutline(room, windowAt(2000))!;
		expect(outline.onSlope).toBe(true);
		expect(outline.corners).toHaveLength(4);
		expect(outline.corners[0].y).toBeCloseTo(500);
		expect(outline.corners[3].y).toBeCloseTo(500 + 1180 * Math.cos(Math.PI / 4));
	});

	it('shows a stand-in and marks it when no slope lies under the window', () => {
		const outline = roofWindowOutline(room, windowAt(100))!;
		expect(outline.onSlope).toBe(false);
		expect(outline.corners).toHaveLength(4);
	});

	it('places on the nearest sloped wall, inside its section', () => {
		const hit = pickSlopeWall(room, { x: 300, y: 100 });
		expect(hit?.wall).toBe(1);
		expect(hit?.along).toBeGreaterThanOrEqual(1000);
		const placed = placementAt('roofWindow', room, { x: 300, y: 100 }, sequentialIds('r'), 20);
		expect(placed?.kind).toBe('roofWindow');
		if (placed?.kind === 'roofWindow') {
			expect(placed.offset).toBeGreaterThanOrEqual(1000);
			expect(placed.wall).toBe(1);
		}
	});

	it('picks the other sloped wall when tapped near it', () => {
		expect(pickSlopeWall(room, { x: 3000, y: 2900 })?.wall).toBe(3);
	});

	it('does not place without a sloped wall', () => {
		const flat = { ...room, slopes: undefined };
		expect(
			placementAt('roofWindow', flat, { x: 100, y: 100 }, sequentialIds('r'), 20)
		).toBeUndefined();
	});

	it('keeps the window inside its section', () => {
		expect(clampRoofOffset(room, 1, 4800, 780)).toBe(4220);
		expect(clampRoofOffset(room, 1, 1200, 780)).toBe(1200);
	});
});
