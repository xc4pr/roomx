import { describe, expect, it } from 'vitest';
import { rectanglePolygon } from '#lib/core/defaults.ts';
import {
	clampToProfile,
	isFlatProfile,
	movingLimit,
	profileSegments,
	spanLimit,
	wallProfile
} from './profile.ts';

const room = (slopes: { id: string; wall: number; kneeHeight: number; angle: number }[]) => ({
	polygon: rectanglePolygon(4000, 3000),
	height: 2500,
	slopes
});

describe('wall profile', () => {
	it('is flat without slopes', () => {
		const points = wallProfile(room([]), 1);
		expect(points).toEqual([
			{ along: 0, height: 2500 },
			{ along: 4000, height: 2500 }
		]);
		expect(isFlatProfile(points, 2500)).toBe(true);
	});

	it('shows the knee wall as a low flat wall', () => {
		const points = wallProfile(room([{ id: 's1', wall: 1, kneeHeight: 1000, angle: 45 }]), 1);
		expect(points).toHaveLength(2);
		expect(points.every((p) => p.height === 1000)).toBe(true);
	});

	it('shows a gable wall with a slanted edge', () => {
		const sloped = room([{ id: 's1', wall: 1, kneeHeight: 1000, angle: 45 }]);
		const points = wallProfile(sloped, 2);
		expect(points).toHaveLength(3);
		expect(points[0].height).toBeCloseTo(1000);
		expect(points[1].along).toBeCloseTo(1500);
		expect(points[1].height).toBeCloseTo(2500);
		expect(points[2].height).toBeCloseTo(2500);
		const segments = profileSegments(sloped, 2);
		expect(segments).toHaveLength(1);
		expect(segments[0].slope?.angle).toBe(45);
	});

	it('builds a peak from two opposite slopes', () => {
		const points = wallProfile(
			room([
				{ id: 's1', wall: 1, kneeHeight: 1000, angle: 30 },
				{ id: 's3', wall: 3, kneeHeight: 1000, angle: 30 }
			]),
			2
		);
		const top = Math.max(...points.map((p) => p.height));
		expect(top).toBeCloseTo(1000 + 1500 * Math.tan(Math.PI / 6));
		expect(points.some((p) => Math.abs(p.along - 1500) < 1 && Math.abs(p.height - top) < 1)).toBe(
			true
		);
		expect(points[0].height).toBeCloseTo(1000);
		expect(points[points.length - 1].height).toBeCloseTo(1000);
	});

	it('limits element height to the lower end of its span', () => {
		const sloped = room([{ id: 's1', wall: 1, kneeHeight: 1000, angle: 45 }]);
		expect(spanLimit(sloped, 2, 0, 500)).toBeCloseTo(1000);
		expect(spanLimit(sloped, 2, 2000, 500)).toBe(2500);
		expect(clampToProfile(sloped, 2, 0, 500, 900, 800)).toBe(200);
		expect(clampToProfile(sloped, 2, 2000, 500, 900, 800)).toBe(900);
		expect(clampToProfile(sloped, 2, 0, 500, 900, 1800)).toBe(0);
	});

	it('steps up at the ends of a slope section and at a dormer', () => {
		const sectioned = {
			...room([]),
			slopes: [
				{
					id: 's1',
					wall: 1,
					kneeHeight: 1000,
					angle: 45,
					from: 500,
					to: 3500,
					dormers: [{ id: 'd1', from: 1500, to: 2500, height: 2100 }]
				}
			]
		};
		const points = wallProfile(sectioned, 1);
		expect(points).toEqual([
			{ along: 0, height: 2500 },
			{ along: 500, height: 2500 },
			{ along: 500, height: 1000 },
			{ along: 1500, height: 1000 },
			{ along: 1500, height: 2100 },
			{ along: 2500, height: 2100 },
			{ along: 2500, height: 1000 },
			{ along: 3500, height: 1000 },
			{ along: 3500, height: 2500 },
			{ along: 4000, height: 2500 }
		]);
	});

	it('cuts the profile above a tall door', () => {
		const withDoor = {
			...room([{ id: 's1', wall: 1, kneeHeight: 1000, angle: 45 }]),
			elements: [
				{
					id: 'e1',
					kind: 'door' as const,
					status: 'existing' as const,
					wall: 1,
					offset: 1000,
					width: 900,
					height: 2000,
					elevation: 0,
					hinge: 'start' as const,
					swing: 'in' as const
				}
			]
		};
		const points = wallProfile(withDoor, 1);
		expect(points.some((p) => p.along === 1000 && p.height === 2000)).toBe(true);
		expect(points.some((p) => p.along === 1900 && p.height === 2000)).toBe(true);
	});

	it('steps where a slope section of another wall starts or ends', () => {
		const narrow = {
			polygon: rectanglePolygon(4000, 1500),
			height: 2500,
			slopes: [{ id: 's1', wall: 1, kneeHeight: 1000, angle: 30, from: 0, to: 2000 }]
		};
		const top = 1000 + 1500 * Math.tan(Math.PI / 6);
		const points = wallProfile(narrow, 3);
		expect(points).toHaveLength(4);
		expect(points[0]).toEqual({ along: 0, height: 2500 });
		expect(points[1].along).toBeCloseTo(2000);
		expect(points[1].height).toBeCloseTo(2500);
		expect(points[2].along).toBeCloseTo(2000);
		expect(points[2].height).toBeCloseTo(top);
		expect(points[3].along).toBeCloseTo(4000);
		expect(points[3].height).toBeCloseTo(top);
	});

	it('bends where a dormer height meets the slope on a gable wall', () => {
		const gable = {
			polygon: rectanglePolygon(4000, 3000),
			height: 3000,
			slopes: [
				{
					id: 's1',
					wall: 1,
					kneeHeight: 1000,
					angle: 45,
					dormers: [{ id: 'd1', from: 3000, to: 4000, height: 2100 }]
				}
			]
		};
		const points = wallProfile(gable, 2);
		const near = (along: number, height: number) =>
			points.some((p) => Math.abs(p.along - along) < 1 && Math.abs(p.height - height) < 1);
		expect(near(0, 2100)).toBe(true);
		expect(near(1100, 2100)).toBe(true);
		expect(near(2000, 3000)).toBe(true);
	});

	it('keeps a tall window at its elevation when it is nudged along a knee wall', () => {
		const attic = {
			polygon: rectanglePolygon(4000, 3000),
			height: 2500,
			slopes: [{ id: 's1', wall: 1, kneeHeight: 800, angle: 45 }]
		};
		const window = {
			id: 'w1',
			kind: 'window' as const,
			windowType: 'tiltTurn' as const,
			status: 'existing' as const,
			wall: 1,
			offset: 1000,
			width: 900,
			height: 1300,
			elevation: 600
		};
		const withWindow = { ...attic, elements: [window] };
		expect(clampToProfile(withWindow, 1, 1010, 900, 600, 1300, window)).toBe(600);
		expect(movingLimit(withWindow, 1, window, 1010, 900)).toBe(2500);
		expect(clampToProfile(withWindow, 1, 1010, 900, 600, 1300)).toBe(0);
	});
});
