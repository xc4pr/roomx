import {
	areaMm2,
	distance,
	interiorAngle,
	isSimplePolygon,
	normalizePolygon,
	rotate,
	type Vec
} from '#lib/core/geometry.ts';
import type { Point } from '#lib/core/schema.ts';

export interface WallRow {
	length: number;
	turn: number;
}

export const MIN_WALL = 50;
export const CLOSE_TOLERANCE = 5;

export function normalizeTurn(degrees: number): number {
	let value = degrees % 360;
	if (value > 180) value -= 360;
	if (value <= -180) value += 360;
	return Math.round(value * 100) / 100;
}

export function interiorFromTurn(turn: number): number {
	return Math.round((180 - turn) * 100) / 100;
}

export function turnFromInterior(interior: number): number {
	return normalizeTurn(180 - interior);
}

export function rowsFromPolygon(polygon: readonly Point[]): WallRow[] {
	return polygon.map((corner, i) => ({
		length: Math.round(distance(corner, polygon[(i + 1) % polygon.length])),
		turn: normalizeTurn(180 - interiorAngle(polygon, (i + 1) % polygon.length))
	}));
}

export function traverse(rows: readonly WallRow[]): { points: Vec[]; end: Vec } {
	let heading = 0;
	let cursor: Vec = { x: 0, y: 0 };
	const points: Vec[] = [{ x: 0, y: 0 }];
	rows.forEach((row, index) => {
		const step = rotate({ x: row.length, y: 0 }, heading);
		cursor = { x: cursor.x + step.x, y: cursor.y + step.y };
		heading += row.turn;
		if (index < rows.length - 1) points.push(cursor);
	});
	return { points, end: cursor };
}

export function closingGap(rows: readonly WallRow[]): number {
	const { end } = traverse(rows);
	return Math.hypot(end.x, end.y);
}

// The last wall is derived: it runs from the end of wall n-1 back to corner A.
export function closeLastWall(rows: readonly WallRow[]): WallRow[] {
	const n = rows.length;
	if (n < 3) return [...rows];
	const head = rows.slice(0, n - 1).map((row, i) => (i < n - 2 ? row : { ...row, turn: 0 }));
	const { end } = traverse([...head, { length: 0, turn: 0 }]);
	const length = Math.hypot(end.x, end.y);
	const headingBefore = rows.slice(0, n - 2).reduce((sum, row) => sum + row.turn, 0);
	const closing = (Math.atan2(-end.y, -end.x) * 180) / Math.PI;
	const result = rows.map((row) => ({ ...row }));
	result[n - 2].turn = normalizeTurn(closing - headingBefore);
	result[n - 1] = { length: Math.round(length), turn: normalizeTurn(-closing) };
	return result;
}

export function distributeGap(rows: readonly WallRow[]): WallRow[] {
	const { points, end } = traverse(rows);
	const total = rows.reduce((sum, row) => sum + row.length, 0);
	if (total < 1) return [...rows];
	let travelled = 0;
	const corrected = points.map((p, index) => {
		if (index > 0) travelled += rows[index - 1].length;
		const share = travelled / total;
		return { x: p.x - end.x * share, y: p.y - end.y * share };
	});
	return rowsFromPolygon(corrected.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })));
}

export type PolygonProblem = 'few' | 'short' | 'cross' | 'flat';

export function polygonProblem(points: readonly Vec[]): PolygonProblem | undefined {
	if (points.length < 3) return 'few';
	for (let i = 0; i < points.length; i++) {
		if (distance(points[i], points[(i + 1) % points.length]) < MIN_WALL) return 'short';
	}
	if (!isSimplePolygon(points)) return 'cross';
	if (areaMm2(points) < 10000) return 'flat';
	return undefined;
}

export function polygonFromRows(rows: readonly WallRow[]): Point[] {
	const { points } = traverse(rows);
	return normalizePolygon(points);
}

export function polygonKey(polygon: readonly Point[]): string {
	return polygon.map((p) => `${p.x},${p.y}`).join(';');
}

export function splitWall(polygon: readonly Point[], wallIndex: number): Point[] {
	const a = polygon[wallIndex];
	const b = polygon[(wallIndex + 1) % polygon.length];
	const middle = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
	const next = [...polygon];
	next.splice(wallIndex + 1, 0, middle);
	return next;
}
