import { describe, expect, it } from 'vitest';
import { rectanglePolygon } from '#lib/core/defaults.ts';
import {
	closeLastWall,
	closingGap,
	distributeGap,
	polygonFromRows,
	polygonProblem,
	rowsFromPolygon,
	splitWall,
	traverse,
	turnFromInterior
} from './walls.ts';

describe('walls', () => {
	it('reads a rectangle as four 90 degree walls', () => {
		const rows = rowsFromPolygon(rectanglePolygon(4000, 3000));
		expect(rows).toEqual([
			{ length: 4000, turn: 90 },
			{ length: 3000, turn: 90 },
			{ length: 4000, turn: 90 },
			{ length: 3000, turn: 90 }
		]);
		expect(closingGap(rows)).toBeLessThan(1e-6);
		expect(polygonFromRows(rows)).toEqual(rectanglePolygon(4000, 3000));
	});

	it('round-trips an L shape with a reflex corner', () => {
		const l = [
			{ x: 0, y: 0 },
			{ x: 5000, y: 0 },
			{ x: 5000, y: 2000 },
			{ x: 2500, y: 2000 },
			{ x: 2500, y: 4000 },
			{ x: 0, y: 4000 }
		];
		const rows = rowsFromPolygon(l);
		expect(rows[2].turn).toBe(-90);
		expect(rows[3].turn).toBe(90);
		expect(polygonFromRows(rows)).toEqual(l);
	});

	it('closes the last wall automatically', () => {
		const rows = rowsFromPolygon(rectanglePolygon(4000, 3000));
		const edited = rows.map((row) => ({ ...row }));
		edited[2].length = 3000;
		const closed = closeLastWall(edited);
		expect(closingGap(closed)).toBeLessThan(1);
		expect(closed[3].length).toBe(Math.round(Math.hypot(1000, 3000)));
		expect(closed.reduce((sum, row) => sum + row.turn, 0)).toBeCloseTo(360, 1);
	});

	it('keeps a perfectly closed rectangle unchanged when closing', () => {
		const rows = rowsFromPolygon(rectanglePolygon(4000, 3000));
		expect(closeLastWall(rows)).toEqual(rows);
	});

	it('distributes a closing error evenly', () => {
		const rows = [
			{ length: 4000, turn: 90 },
			{ length: 3000, turn: 90 },
			{ length: 4000, turn: 90 },
			{ length: 3040, turn: 90 }
		];
		expect(closingGap(rows)).toBeCloseTo(40);
		const fixed = distributeGap(rows);
		expect(closingGap(fixed)).toBeLessThan(2);
		expect(Math.abs(fixed[3].length - 3000)).toBeLessThan(40);
		expect(fixed.every((row) => Math.abs(row.turn - 90) < 1)).toBe(true);
	});

	it('flags broken polygons', () => {
		expect(polygonProblem(rectanglePolygon(4000, 3000))).toBeUndefined();
		expect(
			polygonProblem([
				{ x: 0, y: 0 },
				{ x: 1000, y: 1000 },
				{ x: 1000, y: 0 },
				{ x: 0, y: 1000 }
			])
		).toBe('cross');
		expect(
			polygonProblem([
				{ x: 0, y: 0 },
				{ x: 20, y: 0 },
				{ x: 0, y: 3000 }
			])
		).toBe('short');
	});

	it('converts interior angles to turns', () => {
		expect(turnFromInterior(90)).toBe(90);
		expect(turnFromInterior(135)).toBe(45);
		expect(turnFromInterior(270)).toBe(-90);
	});

	it('splits a wall in the middle without changing the shape', () => {
		const split = splitWall(rectanglePolygon(4000, 3000), 0);
		expect(split).toHaveLength(5);
		expect(split[1]).toEqual({ x: 2000, y: 0 });
		expect(traverse(rowsFromPolygon(split)).points).toHaveLength(5);
	});
});
