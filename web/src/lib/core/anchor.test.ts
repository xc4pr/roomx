import { describe, expect, it } from 'vitest';
import { resolveAnchor, resolveOnTop } from './anchor.ts';
import { rectanglePolygon } from './defaults.ts';
import { lRoom } from './fixtures.ts';
import { convexInsidePolygon, footprint, walls, wallPoint, distance } from './geometry.ts';

const rect = rectanglePolygon(4000, 3000);
const dims = { w: 1600, d: 800 };

function edges(placement: { x: number; y: number; rotation: number }, size = dims) {
	const [backLeft, backRight, frontRight, frontLeft] = footprint({ ...placement, dims: size });
	return { backLeft, backRight, frontRight, frontLeft };
}

describe('resolveAnchor on a rectangle', () => {
	it('places the back against every wall', () => {
		expect(resolveAnchor(rect, dims, { wall: 1, offset: 300 })).toEqual({
			x: 1100,
			y: 400,
			rotation: 0
		});
		expect(resolveAnchor(rect, dims, { wall: 2, offset: 300 })).toEqual({
			x: 3600,
			y: 1100,
			rotation: 90
		});
		expect(resolveAnchor(rect, dims, { wall: 3, offset: 300 })).toEqual({
			x: 2900,
			y: 2600,
			rotation: 180
		});
		expect(resolveAnchor(rect, dims, { wall: 4, offset: 300 })).toEqual({
			x: 400,
			y: 1900,
			rotation: 270
		});
	});

	it('keeps the back edge on the wall and the offset to the nearer edge', () => {
		for (const target of walls(rect)) {
			const placement = resolveAnchor(rect, dims, { wall: target.number, offset: 300 });
			const { backLeft, backRight } = edges(placement);
			const expectedNear = wallPoint(target, 300);
			const expectedFar = wallPoint(target, 300 + dims.w);
			const near = Math.min(distance(backLeft, expectedNear), distance(backRight, expectedNear));
			const far = Math.min(distance(backLeft, expectedFar), distance(backRight, expectedFar));
			expect(near).toBeLessThan(1);
			expect(far).toBeLessThan(1);
		}
	});

	it('applies the gap', () => {
		expect(resolveAnchor(rect, dims, { wall: 1, offset: 300, gap: 50 })).toEqual({
			x: 1100,
			y: 450,
			rotation: 0
		});
		expect(resolveAnchor(rect, dims, { wall: 2, offset: 0, gap: 20 }).x).toBe(3580);
	});

	it('puts the left or right side against the wall', () => {
		const left = resolveAnchor(rect, dims, { wall: 1, offset: 300, side: 'left' });
		expect(left).toEqual({ x: 700, y: 800, rotation: 270 });
		const leftEdges = edges(left);
		expect(leftEdges.backRight.y).toBeCloseTo(0);
		expect(leftEdges.frontRight.y).toBeCloseTo(0);
		const right = resolveAnchor(rect, dims, { wall: 1, offset: 300, side: 'right' });
		expect(right).toEqual({ x: 700, y: 800, rotation: 90 });
		const rightEdges = edges(right);
		expect(rightEdges.backLeft.y).toBeCloseTo(0);
		expect(rightEdges.frontLeft.y).toBeCloseTo(0);
	});

	it('rejects unknown walls', () => {
		expect(() => resolveAnchor(rect, dims, { wall: 5, offset: 0 })).toThrow();
	});
});

describe('resolveAnchor on an L shape', () => {
	const polygon = lRoom().polygon;

	it('stays inside the room on every wall', () => {
		const small = { w: 800, d: 500 };
		for (const target of walls(polygon)) {
			for (const side of ['back', 'left', 'right'] as const) {
				const placement = resolveAnchor(polygon, small, { wall: target.number, offset: 100, side });
				expect(convexInsidePolygon(footprint({ ...placement, dims: small }), polygon)).toBe(true);
			}
		}
	});

	it('resolves the inner walls of the notch', () => {
		expect(resolveAnchor(polygon, dims, { wall: 3, offset: 200 })).toEqual({
			x: 4000,
			y: 1600,
			rotation: 180
		});
		expect(resolveAnchor(polygon, dims, { wall: 4, offset: 200 })).toEqual({
			x: 2100,
			y: 3000,
			rotation: 90
		});
	});
});

describe('resolveOnTop', () => {
	it('centres the item at the back of its carrier', () => {
		const desk = { x: 1100, y: 400, rotation: 0, dims: { w: 1600, d: 800 } };
		expect(resolveOnTop(desk, { w: 600, d: 200 })).toEqual({ x: 1100, y: 100, rotation: 0 });
		const turned = { ...desk, x: 3600, y: 1100, rotation: 90 };
		expect(resolveOnTop(turned, { w: 600, d: 200 })).toEqual({ x: 3900, y: 1100, rotation: 90 });
	});

	it('centres items deeper than the carrier', () => {
		const shelf = { x: 0, y: 0, rotation: 0, dims: { w: 800, d: 200 } };
		expect(resolveOnTop(shelf, { w: 400, d: 300 })).toEqual({ x: 0, y: 0, rotation: 0 });
	});
});
