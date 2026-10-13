import { describe, expect, it } from 'vitest';
import { rectanglePolygon } from '#lib/core/defaults.ts';
import { ceilingClearance } from './ceiling.ts';

const room = {
	polygon: rectanglePolygon(4000, 3000),
	height: 2500,
	slopes: [{ wall: 1, kneeHeight: 1000, angle: 45 }]
};
const item = (y: number, h: number) => ({
	x: 2000,
	y,
	rotation: 0,
	dims: { w: 1000, d: 400, h },
	elevation: 0
});

describe('ceilingClearance', () => {
	it('reports the lowest ceiling point above the footprint', () => {
		expect(ceilingClearance(room, item(300, 800))).toEqual({ height: 1100, tooLow: false });
	});

	it('flags furniture that is too tall for the slope', () => {
		expect(ceilingClearance(room, item(300, 1500))?.tooLow).toBe(true);
	});

	it('ignores items outside the slope and rooms without slopes', () => {
		expect(ceilingClearance(room, item(2000, 800))).toBeUndefined();
		expect(ceilingClearance({ ...room, slopes: [] }, item(300, 800))).toBeUndefined();
	});
});
