import { describe, expect, it } from 'vitest';
import { rectanglePolygon } from './defaults.ts';
import { lRoom, rectangleRoom } from './fixtures.ts';
import {
	areaMm2,
	convexInsidePolygon,
	convexOverlap,
	cornerLabel,
	doorSwing,
	footprint,
	freeWallSpans,
	interiorAngle,
	isConvexCorner,
	isSimplePolygon,
	normalizePolygon,
	perimeter,
	pointInPolygon,
	polygonFromSegments,
	walls
} from './geometry.ts';
import type { Door } from './schema.ts';
import { ROOM_TEMPLATES, TEMPLATE_IDS } from './templates.ts';

const rect = rectanglePolygon(4000, 3000);

describe('polygon basics', () => {
	it('labels corners', () => {
		expect([0, 1, 25, 26, 27].map(cornerLabel)).toEqual(['A', 'B', 'Z', 'AA', 'AB']);
	});

	it('computes area and perimeter', () => {
		expect(areaMm2(rect)).toBe(12_000_000);
		expect(perimeter(rect)).toBe(14_000);
		expect(areaMm2(lRoom().polygon)).toBe(5000 * 2000 + 2500 * 2000);
	});

	it('derives walls with inward normals on the left', () => {
		const [w1, w2, w3, w4] = walls(rect);
		expect(w1).toMatchObject({ number: 1, length: 4000, direction: { x: 1, y: 0 }, angleDeg: 0 });
		expect(w1.inward.y).toBe(1);
		expect(w2.inward.x).toBe(-1);
		expect(w3.inward.y).toBe(-1);
		expect(w4.inward.x).toBe(1);
		expect(w4.angleDeg).toBe(270);
	});

	it('detects convex and reflex corners', () => {
		const l = lRoom().polygon;
		expect(l.map((_, index) => isConvexCorner(l, index))).toEqual([
			true,
			true,
			true,
			false,
			true,
			true
		]);
		expect(interiorAngle(l, 3)).toBeCloseTo(270);
		expect(interiorAngle(rect, 0)).toBeCloseTo(90);
	});

	it('normalizes clockwise polygons', () => {
		const clockwise = [
			{ x: 100, y: 100 },
			{ x: 100, y: 3100 },
			{ x: 4100, y: 3100 },
			{ x: 4100, y: 100 }
		];
		expect(normalizePolygon(clockwise)).toEqual(rect);
	});

	it('detects self intersection', () => {
		expect(isSimplePolygon(rect)).toBe(true);
		expect(
			isSimplePolygon([
				{ x: 0, y: 0 },
				{ x: 1000, y: 1000 },
				{ x: 1000, y: 0 },
				{ x: 0, y: 1000 }
			])
		).toBe(false);
	});

	it('builds valid templates in canonical form', () => {
		for (const id of TEMPLATE_IDS) {
			const template = ROOM_TEMPLATES[id];
			const polygon = template.build(template.defaults);
			expect(template.isValid(template.defaults)).toBe(true);
			expect(isSimplePolygon(polygon)).toBe(true);
			expect(normalizePolygon(polygon)).toEqual(polygon);
		}
	});

	it('closes a polygon from wall lengths and turns', () => {
		const closed = polygonFromSegments([
			{ length: 4000, turnDeg: 90 },
			{ length: 3000, turnDeg: 90 },
			{ length: 4000, turnDeg: 90 },
			{ length: 3000, turnDeg: 90 }
		]);
		expect(closed.gap).toBeLessThan(1e-6);
		expect(closed.points).toHaveLength(4);
		const open = polygonFromSegments([
			{ length: 4000, turnDeg: 90 },
			{ length: 3000, turnDeg: 90 },
			{ length: 4000, turnDeg: 90 },
			{ length: 2900, turnDeg: 90 }
		]);
		expect(open.gap).toBeCloseTo(100);
	});
});

describe('containment and overlap', () => {
	it('tests points', () => {
		expect(pointInPolygon({ x: 10, y: 10 }, rect)).toBe(true);
		expect(pointInPolygon({ x: -10, y: 10 }, rect)).toBe(false);
		expect(pointInPolygon({ x: 0, y: 10 }, rect, 1)).toBe(true);
	});

	it('accepts a footprint flush in a corner and rejects one across the L notch', () => {
		const l = lRoom().polygon;
		const flush = footprint({ x: 500, y: 300, rotation: 0, dims: { w: 1000, d: 600 } });
		expect(convexInsidePolygon(flush, l)).toBe(true);
		const across = footprint({ x: 2500, y: 2000, rotation: 0, dims: { w: 1000, d: 1000 } });
		expect(convexInsidePolygon(across, l)).toBe(false);
		const outside = footprint({ x: 4000, y: 3000, rotation: 0, dims: { w: 500, d: 500 } });
		expect(convexInsidePolygon(outside, l)).toBe(false);
	});

	it('rejects a footprint bridging the gap of a U shape', () => {
		const u = ROOM_TEMPLATES.u.build(ROOM_TEMPLATES.u.defaults);
		const bridge = footprint({ x: 3000, y: 3500, rotation: 0, dims: { w: 3000, d: 400 } });
		expect(convexInsidePolygon(bridge, u)).toBe(false);
	});

	it('treats touching footprints as not overlapping', () => {
		const a = footprint({ x: 500, y: 500, rotation: 0, dims: { w: 1000, d: 1000 } });
		const touching = footprint({ x: 1500, y: 500, rotation: 0, dims: { w: 1000, d: 1000 } });
		const overlapping = footprint({ x: 1400, y: 500, rotation: 30, dims: { w: 1000, d: 1000 } });
		expect(convexOverlap(a, touching)).toBe(false);
		expect(convexOverlap(a, overlapping)).toBe(true);
	});

	it('rotates footprints counter-clockwise', () => {
		const [backLeft] = footprint({ x: 0, y: 0, rotation: 90, dims: { w: 2000, d: 1000 } });
		expect(backLeft.x).toBeCloseTo(500);
		expect(backLeft.y).toBeCloseTo(-1000);
	});
});

describe('walls and openings', () => {
	it('lists free wall spans', () => {
		const room = rectangleRoom();
		expect(freeWallSpans(room, 1)).toEqual([
			{ from: 0, to: 200 },
			{ from: 1000, to: 4000 }
		]);
		expect(freeWallSpans(room, 2)).toEqual([{ from: 0, to: 3000 }]);
		expect(freeWallSpans(room, 3)).toEqual([
			{ from: 0, to: 1400 },
			{ from: 2600, to: 4000 }
		]);
	});

	it('sweeps a door into the room from its hinge', () => {
		const door = rectangleRoom().elements[0] as Door;
		const swing = doorSwing(rect, door)!;
		expect(swing.hinge).toEqual({ x: 200, y: 0 });
		expect(swing.polygon[1].x).toBeCloseTo(1000);
		expect(swing.polygon.at(-1)!.x).toBeCloseTo(200);
		expect(swing.polygon.at(-1)!.y).toBeCloseTo(800);
		const endHinged = doorSwing(rect, { ...door, hinge: 'end' })!;
		expect(endHinged.hinge).toEqual({ x: 1000, y: 0 });
		expect(endHinged.polygon.at(-1)!.y).toBeCloseTo(800);
		expect(doorSwing(rect, { ...door, swing: 'out' })!.polygon.at(-1)!.y).toBeCloseTo(-800);
		expect(doorSwing(rect, { ...door, swing: 'sliding' })).toBeUndefined();
	});
});

describe('roof slopes', () => {
	const attic = { polygon: rect, height: 2400, slopes: [{ wall: 1, kneeHeight: 1000, angle: 45 }] };

	it('computes ceiling height under a slope', async () => {
		const { ceilingHeightAt, slopeContour, slopeRun, wallHeightAt } = await import('./geometry.ts');
		expect(slopeRun(attic, attic.slopes[0])).toBeCloseTo(1400);
		expect(ceilingHeightAt(attic, { x: 2000, y: 0 })).toBeCloseTo(1000);
		expect(ceilingHeightAt(attic, { x: 2000, y: 500 })).toBeCloseTo(1500);
		expect(ceilingHeightAt(attic, { x: 2000, y: 2500 })).toBe(2400);
		expect(wallHeightAt(attic, 1, 2000)).toBeCloseTo(1000);
		expect(wallHeightAt(attic, 2, 700)).toBeCloseTo(1700);
		expect(wallHeightAt(attic, 3, 2000)).toBe(2400);
		const contour = slopeContour(attic, attic.slopes[0], 2000)!;
		expect(contour.from.y).toBeCloseTo(1000);
		expect(contour.to.x).toBeCloseTo(4000);
		expect(ceilingHeightAt({ polygon: rect, height: 2400 }, { x: 0, y: 0 })).toBe(2400);
	});
});
