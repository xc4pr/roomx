import { describe, expect, it } from 'vitest';
import { rectanglePolygon } from '#lib/core/defaults.ts';
import type { Slope } from '#lib/core/schema.ts';
import { areaMm2 } from '#lib/core/geometry.ts';
import { clipSegmentToPolygon, clipToHalfPlane, longestSegment, slopeShapes } from './slopes.ts';

const room = (slopes: Slope[]) => ({
	polygon: rectanglePolygon(4000, 3000),
	height: 2500,
	slopes
});

describe('slopes', () => {
	it('clips a polygon to a half plane', () => {
		const clipped = clipToHalfPlane(
			rectanglePolygon(4000, 3000),
			{ x: 0, y: 0 },
			{ x: 0, y: 1 },
			1000
		);
		expect(areaMm2(clipped)).toBeCloseTo(4000 * 1000);
	});

	it('builds the slope zone clipped to the room', () => {
		const [shape] = slopeShapes(room([{ id: 's1', wall: 1, kneeHeight: 1000, angle: 45 }]));
		expect(shape.run).toBeCloseTo(1500);
		expect(areaMm2(shape.zone)).toBeCloseTo(4000 * 1500);
		expect(shape.standing).toHaveLength(1);
		expect(shape.standing[0][0].y).toBeCloseTo(1000);
		expect(shape.full[0][0].y).toBeCloseTo(1500);
	});

	it('limits the zone to the room when the run exceeds it', () => {
		const [shape] = slopeShapes(room([{ id: 's1', wall: 1, kneeHeight: 0, angle: 20 }]));
		expect(areaMm2(shape.zone)).toBeCloseTo(4000 * 3000);
		expect(shape.full).toHaveLength(0);
	});

	it('skips walls without effect and unknown walls', () => {
		expect(slopeShapes(room([{ id: 's9', wall: 9, kneeHeight: 1000, angle: 45 }]))).toHaveLength(0);
		expect(slopeShapes(room([{ id: 's1', wall: 1, kneeHeight: 2500, angle: 45 }]))).toHaveLength(0);
		expect(slopeShapes(room([]))).toHaveLength(0);
	});

	it('omits the standing line when knee height reaches 2 m', () => {
		const [shape] = slopeShapes(room([{ id: 's1', wall: 1, kneeHeight: 2000, angle: 45 }]));
		expect(shape.standing).toHaveLength(0);
		expect(shape.full).toHaveLength(1);
	});

	it('splits a line at the notch of an L-shaped room', () => {
		const l = [
			{ x: 0, y: 0 },
			{ x: 4000, y: 0 },
			{ x: 4000, y: 1500 },
			{ x: 1500, y: 1500 },
			{ x: 1500, y: 3000 },
			{ x: 0, y: 3000 }
		];
		const parts = clipSegmentToPolygon({ x: -500, y: 2000 }, { x: 4500, y: 2000 }, l);
		expect(parts).toHaveLength(1);
		expect(parts[0][0].x).toBeCloseTo(0);
		expect(parts[0][1].x).toBeCloseTo(1500);
		const outside = clipSegmentToPolygon({ x: 2000, y: 2200 }, { x: 4000, y: 2200 }, l);
		expect(outside).toHaveLength(0);
	});

	it('finds the longest segment', () => {
		const long = longestSegment([
			[
				{ x: 0, y: 0 },
				{ x: 10, y: 0 }
			],
			[
				{ x: 0, y: 5 },
				{ x: 40, y: 5 }
			]
		]);
		expect(long?.[1].x).toBe(40);
		expect(longestSegment([])).toBeUndefined();
	});

	it('limits the zone to a section and draws the cheeks', () => {
		const [shape] = slopeShapes(
			room([{ id: 's1', wall: 1, kneeHeight: 1000, angle: 45, from: 1000, to: 3000 }])
		);
		expect(areaMm2(shape.zone)).toBeCloseTo(2000 * 1500);
		expect(shape.cheeks).toHaveLength(2);
		expect(shape.cheeks[0][0].x).toBeCloseTo(1000);
		expect(shape.cheeks[1][1].y).toBeCloseTo(1500);
		expect(shape.standing[0][0].x).toBeCloseTo(1000);
		expect(shape.standing[0][1].x).toBeCloseTo(3000);
	});

	it('draws no cheeks for a slope on the whole wall', () => {
		const [shape] = slopeShapes(room([{ id: 's1', wall: 1, kneeHeight: 1000, angle: 45 }]));
		expect(shape.cheeks).toHaveLength(0);
		expect(shape.dormers).toHaveLength(0);
		expect(shape.pieces).toHaveLength(1);
	});

	it('leaves a gap in the hatching for a dormer and breaks the contour', () => {
		const [shape] = slopeShapes(
			room([
				{
					id: 's1',
					wall: 1,
					kneeHeight: 1000,
					angle: 45,
					dormers: [{ id: 'd1', from: 1000, to: 2000, height: 2100 }]
				}
			])
		);
		expect(shape.dormers).toHaveLength(1);
		expect(shape.dormers[0].cut).toBe(false);
		expect(shape.dormers[0].depth).toBeCloseTo(1100);
		const hatched = shape.pieces.reduce((sum, piece) => sum + areaMm2(piece), 0);
		expect(hatched).toBeCloseTo(4000 * 1500 - 1000 * 1100);
		expect(shape.standing).toHaveLength(2);
		expect(shape.full).toHaveLength(1);
	});

	it('cuts the hatching above a door that reaches above the knee wall', () => {
		const withDoor = {
			...room([{ id: 's1', wall: 1, kneeHeight: 1000, angle: 45 }]),
			elements: [
				{
					id: 'e1',
					kind: 'door' as const,
					status: 'existing' as const,
					wall: 1,
					offset: 500,
					width: 900,
					height: 2000,
					elevation: 0,
					hinge: 'start' as const,
					swing: 'in' as const
				}
			]
		};
		const [shape] = slopeShapes(withDoor);
		expect(shape.dormers).toHaveLength(1);
		expect(shape.dormers[0].cut).toBe(true);
		const hatched = shape.pieces.reduce((sum, piece) => sum + areaMm2(piece), 0);
		expect(hatched).toBeCloseTo(4000 * 1500 - 900 * 1000);
	});
});
