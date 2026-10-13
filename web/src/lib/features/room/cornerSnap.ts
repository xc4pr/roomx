import { rotate, sub, type Vec } from '#lib/core/geometry.ts';
import { normalizeTurn } from './walls.ts';

export interface CornerSnapOptions {
	prev: Vec;
	before?: Vec;
	others: readonly Vec[];
	grid: number;
	angleStep: number;
	tolerance: number;
	angleTolerance?: number;
}

export interface CornerSnapResult {
	point: Vec;
	angleSnapped: boolean;
	alignX?: Vec;
	alignY?: Vec;
}

export function snapGrid(value: number, grid: number): number {
	return Math.round(value / grid) * grid;
}

export function gridForZoom(pxPerMm: number, fine = false): number {
	if (fine) return 10;
	if (pxPerMm >= 0.6) return 10;
	if (pxPerMm >= 0.15) return 50;
	return 100;
}

function headingOf(v: Vec): number {
	return (Math.atan2(v.y, v.x) * 180) / Math.PI;
}

export function snapCorner(point: Vec, options: CornerSnapOptions): CornerSnapResult {
	const { prev, before, others, grid, angleStep, tolerance } = options;
	const angleTolerance = options.angleTolerance ?? Math.min(7, angleStep / 2);
	const offset = sub(point, prev);
	const distance = Math.hypot(offset.x, offset.y);
	let result: Vec = { x: snapGrid(point.x, grid), y: snapGrid(point.y, grid) };
	let angleSnapped = false;

	if (distance > grid) {
		const heading = headingOf(offset);
		const references = [0];
		if (before) references.push(headingOf(sub(prev, before)));
		let best: { target: number; error: number } | undefined;
		for (const reference of references) {
			const relative = normalizeTurn(heading - reference);
			const target = Math.round(relative / angleStep) * angleStep;
			const error = Math.abs(relative - target);
			if (error <= angleTolerance && (!best || error < best.error)) {
				best = { target: reference + target, error };
			}
		}
		if (best) {
			const length = Math.max(grid, snapGrid(distance, grid));
			const snapped = rotate({ x: length, y: 0 }, best.target);
			result = { x: Math.round(prev.x + snapped.x), y: Math.round(prev.y + snapped.y) };
			angleSnapped = true;
		}
	}

	let alignX: Vec | undefined;
	let alignY: Vec | undefined;
	let bestX = tolerance;
	let bestY = tolerance;
	for (const other of others) {
		const dx = Math.abs(result.x - other.x);
		const dy = Math.abs(result.y - other.y);
		if (dx <= bestX) {
			bestX = dx;
			alignX = other;
		}
		if (dy <= bestY) {
			bestY = dy;
			alignY = other;
		}
	}
	if (alignX) result = { ...result, x: alignX.x };
	if (alignY) result = { ...result, y: alignY.y };
	return {
		point: result,
		angleSnapped,
		...(alignX ? { alignX } : {}),
		...(alignY ? { alignY } : {})
	};
}
