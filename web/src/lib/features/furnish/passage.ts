import { add, cross, dot, itemFootprint, scale, sub, walls, type Vec } from '#lib/core/geometry.ts';
import type { Item, Point, Room } from '#lib/core/schema.ts';
import { axes } from './snap.ts';

export const PASSAGE_MIN = 100;
export const PASSAGE_MAX = 600;
const MIN_OVERLAP = 400;
const WALKABLE_EXEMPT: readonly Item['category'][] = [
	'chair',
	'officeChair',
	'rug',
	'lamp',
	'plant',
	'decor',
	'electronics'
];

export interface Passage {
	a: Vec;
	b: Vec;
	gap: number;
	itemIds: string[];
}

function closestOnSegment(p: Vec, a: Vec, b: Vec): Vec {
	const ab = sub(b, a);
	const lenSq = dot(ab, ab);
	if (lenSq < 1e-9) return a;
	const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / lenSq));
	return add(a, scale(ab, t));
}

export interface ShapeDistance {
	distance: number;
	a: Vec;
	b: Vec;
}

export function shapeDistance(first: readonly Vec[], second: readonly Vec[]): ShapeDistance {
	let best: ShapeDistance = { distance: Infinity, a: first[0], b: second[0] };
	const scan = (from: readonly Vec[], to: readonly Vec[], flip: boolean) => {
		for (const p of from) {
			for (let i = 0; i < to.length; i++) {
				const q = closestOnSegment(p, to[i], to[(i + 1) % to.length]);
				const d = Math.hypot(p.x - q.x, p.y - q.y);
				if (d < best.distance)
					best = flip ? { distance: d, a: q, b: p } : { distance: d, a: p, b: q };
			}
		}
	};
	scan(first, second, false);
	scan(second, first, true);
	return best;
}

function overlapAlong(first: readonly Vec[], second: readonly Vec[], direction: Vec): number {
	const n = Math.hypot(direction.x, direction.y);
	if (n < 1e-9) return 0;
	const axis = { x: -direction.y / n, y: direction.x / n };
	const range = (shape: readonly Vec[]) => {
		const values = shape.map((p) => dot(p, axis));
		return { min: Math.min(...values), max: Math.max(...values) };
	};
	const a = range(first);
	const b = range(second);
	return Math.min(a.max, b.max) - Math.max(a.min, b.min);
}

function blocks(item: Item): boolean {
	return (
		item.mount !== 'wall' &&
		item.mount !== 'ceiling' &&
		!item.onItemId &&
		item.elevation < 600 &&
		item.dims.h >= 500 &&
		Math.min(item.dims.w, item.dims.d) >= 350 &&
		!WALKABLE_EXEMPT.includes(item.category)
	);
}

export function narrowPassages(room: Pick<Room, 'polygon'>, allItems: readonly Item[]): Passage[] {
	const items = allItems.filter(blocks);
	const shapes = items.map((item) => itemFootprint(item));
	const found: Passage[] = [];
	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			const result = shapeDistance(shapes[i], shapes[j]);
			if (result.distance < PASSAGE_MIN || result.distance >= PASSAGE_MAX) continue;
			if (overlapAlong(shapes[i], shapes[j], sub(result.b, result.a)) < MIN_OVERLAP) continue;
			found.push({
				a: result.a,
				b: result.b,
				gap: Math.round(result.distance),
				itemIds: [items[i].id, items[j].id]
			});
		}
	}
	const sides = walls(room.polygon);
	items.forEach((item, index) => {
		for (const side of sides) {
			const result = shapeDistance(shapes[index], [side.start, side.end]);
			if (result.distance < PASSAGE_MIN || result.distance >= PASSAGE_MAX) continue;
			if (
				overlapAlong(shapes[index], [side.start, side.end], sub(result.b, result.a)) < MIN_OVERLAP
			)
				continue;
			found.push({
				a: result.a,
				b: result.b,
				gap: Math.round(result.distance),
				itemIds: [item.id]
			});
		}
	});
	return found;
}

export type ClearanceSide = 'front' | 'back' | 'left' | 'right';

export interface Clearance {
	side: ClearanceSide;
	from: Vec;
	to: Vec;
	distance: number;
}

function raySegment(origin: Vec, direction: Vec, a: Vec, b: Vec): number | undefined {
	const edge = sub(b, a);
	const denominator = cross(direction, edge);
	if (Math.abs(denominator) < 1e-9) return undefined;
	const diff = sub(a, origin);
	const t = cross(diff, edge) / denominator;
	const u = cross(diff, direction) / denominator;
	if (t < -1e-6 || u < -1e-9 || u > 1 + 1e-9) return undefined;
	return Math.max(0, t);
}

export function clearances(
	polygon: readonly Point[],
	item: Item,
	others: readonly Item[],
	limit = 4000
): Clearance[] {
	const { ux, uy } = axes(item.rotation);
	const sides: { side: ClearanceSide; direction: Vec; half: number }[] = [
		{ side: 'front', direction: uy, half: item.dims.d / 2 },
		{ side: 'back', direction: scale(uy, -1), half: item.dims.d / 2 },
		{ side: 'right', direction: ux, half: item.dims.w / 2 },
		{ side: 'left', direction: scale(ux, -1), half: item.dims.w / 2 }
	];
	const obstacles = others.filter(
		(other) =>
			other.id !== item.id &&
			other.category !== 'rug' &&
			other.mount !== 'ceiling' &&
			other.elevation < item.elevation + item.dims.h &&
			other.elevation + other.dims.h > item.elevation &&
			other.onItemId !== item.id &&
			item.onItemId !== other.id
	);
	const edges: [Vec, Vec][] = polygon.map((p, i) => [p, polygon[(i + 1) % polygon.length]]);
	for (const other of obstacles) {
		const shape = itemFootprint(other);
		shape.forEach((p, i) => edges.push([p, shape[(i + 1) % shape.length]]));
	}
	const result: Clearance[] = [];
	for (const { side, direction, half } of sides) {
		const origin = add({ x: item.x, y: item.y }, scale(direction, half));
		let nearest = Infinity;
		for (const [a, b] of edges) {
			const t = raySegment(origin, direction, a, b);
			if (t !== undefined && t < nearest) nearest = t;
		}
		if (nearest > 1 && nearest <= limit) {
			result.push({
				side,
				from: origin,
				to: add(origin, scale(direction, nearest)),
				distance: Math.round(nearest)
			});
		}
	}
	return result;
}
