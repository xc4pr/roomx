import { describe, expect, it } from 'vitest';
import { snapPolygon } from './snap.ts';

const rect = (x: number, y: number, w: number, h: number) => [
	{ x, y },
	{ x: x + w, y },
	{ x: x + w, y: y + h },
	{ x, y: y + h }
];

describe('snapPolygon', () => {
	const other = rect(0, 0, 4000, 3000);

	it('does nothing when far away', () => {
		const result = snapPolygon(rect(9000, 9000, 2000, 2000), [other], 100);
		expect(result.delta).toEqual({ x: 0, y: 0 });
		expect(result.guides).toEqual([]);
	});

	it('snaps a corner onto a corner', () => {
		const result = snapPolygon(rect(4040, -30, 2000, 2000), [other], 100);
		expect(result.delta.x).toBeCloseTo(-40);
		expect(result.delta.y).toBeCloseTo(30);
	});

	it('snaps edge to edge only along the normal and slides freely along the wall', () => {
		const result = snapPolygon(rect(4060, 700, 2000, 1000), [other], 100);
		expect(result.delta.x).toBeCloseTo(-60);
		expect(result.delta.y).toBeCloseTo(0);
		expect(result.guides.length).toBeGreaterThan(0);
		const guide = result.guides[0];
		expect(guide.a.x).toBeCloseTo(4000);
		expect(Math.min(guide.a.y, guide.b.y)).toBeCloseTo(700);
		expect(Math.max(guide.a.y, guide.b.y)).toBeCloseTo(1700);
	});

	it('aligns both axes with two non-parallel edge candidates', () => {
		const result = snapPolygon(rect(-1990, 3070, 2000, 1000), [other], 100);
		expect(result.delta.y).toBeCloseTo(-70);
	});

	it('works with rotated polygons', () => {
		const diamond = [
			{ x: 2000, y: 0 },
			{ x: 3000, y: 1000 },
			{ x: 2000, y: 2000 },
			{ x: 1000, y: 1000 }
		];
		const near = [
			{ x: 3010, y: 1040 },
			{ x: 4010, y: 2040 },
			{ x: 3010, y: 3040 },
			{ x: 2010, y: 2040 }
		];
		const result = snapPolygon(near, [diamond], 100);
		expect(Math.hypot(result.delta.x, result.delta.y)).toBeGreaterThan(0);
	});
});
