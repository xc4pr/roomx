import { describe, expect, it } from 'vitest';
import { cornerLabelPosition, offsetPolygon, wallBandPath, wallNormal } from './shape.ts';

const square = [
	{ x: 0, y: 0 },
	{ x: 100, y: 0 },
	{ x: 100, y: 100 },
	{ x: 0, y: 100 }
];

describe('shape', () => {
	it('offsets a square outward and inward', () => {
		const out = offsetPolygon(square, 10);
		expect(out[0].x).toBeCloseTo(-10);
		expect(out[0].y).toBeCloseTo(-10);
		expect(out[2].x).toBeCloseTo(110);
		const inner = cornerLabelPosition(square, 0, 10);
		expect(inner.x).toBeCloseTo(10);
		expect(inner.y).toBeCloseTo(10);
	});

	it('points wall normals into the room', () => {
		expect(wallNormal(square, 0)).toEqual({ x: -0, y: 1 });
	});

	it('draws the wall band as two sub paths', () => {
		expect(wallBandPath(square, 10).match(/M/g)).toHaveLength(2);
	});

	it('keeps reflex corners finite', () => {
		const l = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 50 },
			{ x: 50, y: 50 },
			{ x: 50, y: 100 },
			{ x: 0, y: 100 }
		];
		for (const p of offsetPolygon(l, 8)) expect(Number.isFinite(p.x + p.y)).toBe(true);
	});
});
