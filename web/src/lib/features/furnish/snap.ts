import {
	add,
	boundingBox,
	centroid,
	convexInsidePolygon,
	convexOverlap,
	dot,
	footprint,
	itemFootprint,
	nearestWall,
	normalizeDegrees,
	pointInPolygon,
	rotate,
	scale,
	sub,
	wallPoint,
	walls,
	type Vec,
	type Wall
} from '#lib/core/geometry.ts';
import type { Dims, Item, ItemCategory, Mount, Point, Room } from '#lib/core/schema.ts';

export interface Guide {
	a: Vec;
	b: Vec;
}

export interface PlaceSubject {
	dims: Dims;
	mount: Mount;
	category: ItemCategory;
	rotation: number;
	elevation: number;
	onItemId?: string;
}

export interface PlaceContext {
	room: Pick<Room, 'polygon' | 'height'>;
	others: readonly Item[];
	threshold: number;
	autoRotate?: boolean;
	wallSnap?: boolean;
	itemSnap?: boolean;
}

export interface Placement {
	x: number;
	y: number;
	rotation: number;
	elevation: number;
	onItemId?: string;
	guides: Guide[];
	snapped: boolean;
	inside: boolean;
}

const ROTATE_CAPTURE = 50;
const STACKABLE: readonly ItemCategory[] = [
	'lamp',
	'plant',
	'decor',
	'electronics',
	'textile',
	'picture',
	'mirror'
];
const NON_CARRIERS: readonly ItemCategory[] = ['rug', 'curtain', 'picture', 'mirror', 'lamp'];

export function axes(rotation: number): { ux: Vec; uy: Vec } {
	return { ux: rotate({ x: 1, y: 0 }, rotation), uy: rotate({ x: 0, y: 1 }, rotation) };
}

export function support(dims: Pick<Dims, 'w' | 'd'>, rotation: number, direction: Vec): number {
	const { ux, uy } = axes(rotation);
	return (Math.abs(dot(direction, ux)) * dims.w + Math.abs(dot(direction, uy)) * dims.d) / 2;
}

export function angleDiff(target: number, from: number): number {
	const diff = (((target - from) % 360) + 540) % 360;
	return diff - 180;
}

export function defaultWallElevation(height: number, roomHeight: number): number {
	if (height >= roomHeight * 0.7) return Math.max(0, roomHeight - height);
	return Math.max(0, Math.min(roomHeight - height, Math.round(1500 - height / 2)));
}

export function interiorPoint(polygon: readonly Point[]): Vec {
	const middle = centroid(polygon);
	if (pointInPolygon(middle, polygon)) return middle;
	const box = boundingBox(polygon);
	let best = middle;
	let bestDistance = Infinity;
	const step = Math.max(50, Math.min(box.maxX - box.minX, box.maxY - box.minY) / 20);
	for (let x = box.minX; x <= box.maxX; x += step) {
		for (let y = box.minY; y <= box.maxY; y += step) {
			const candidate = { x, y };
			if (!pointInPolygon(candidate, polygon)) continue;
			const d = Math.hypot(x - middle.x, y - middle.y);
			if (d < bestDistance) {
				best = candidate;
				bestDistance = d;
			}
		}
	}
	return best;
}

export function isInside(
	polygon: readonly Point[],
	center: Vec,
	dims: Pick<Dims, 'w' | 'd'>,
	rotation: number
): boolean {
	return convexInsidePolygon(footprint({ ...center, rotation, dims }), polygon, 2);
}

export function fitInside(
	polygon: readonly Point[],
	center: Vec,
	dims: Pick<Dims, 'w' | 'd'>,
	rotation: number
): Vec {
	if (isInside(polygon, center, dims, rotation)) return center;
	const target = interiorPoint(polygon);
	const steps = 40;
	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		const candidate = add(center, scale(sub(target, center), t));
		if (isInside(polygon, candidate, dims, rotation)) {
			return { x: Math.round(candidate.x), y: Math.round(candidate.y) };
		}
	}
	return center;
}

export interface RotationContext {
	walls: readonly Wall[];
	itemRotations: readonly number[];
	step?: number;
	stepCapture?: number;
	alignCapture?: number;
}

export interface RotationSnap {
	rotation: number;
	kind: 'step' | 'wall' | 'item' | null;
}

export function snapRotation(raw: number, context: RotationContext): RotationSnap {
	const step = context.step ?? 15;
	const stepCapture = context.stepCapture ?? 4;
	const alignCapture = context.alignCapture ?? 6;
	let best: RotationSnap = { rotation: normalizeDegrees(Math.round(raw)), kind: null };
	let bestDistance = Infinity;
	const consider = (target: number, capture: number, kind: 'step' | 'wall' | 'item') => {
		const distance = Math.abs(angleDiff(target, raw));
		if (distance > capture) return;
		const weighted = kind === 'step' ? distance + 0.001 : distance;
		if (weighted < bestDistance) {
			bestDistance = weighted;
			best = { rotation: normalizeDegrees(target), kind };
		}
	};
	consider(Math.round(raw / step) * step, stepCapture, 'step');
	for (const wall of context.walls) {
		for (let k = 0; k < 4; k++) consider(wall.angleDeg + k * 90, alignCapture, 'wall');
	}
	for (const rotation of context.itemRotations) {
		for (let k = 0; k < 4; k++) consider(rotation + k * 90, alignCapture, 'item');
	}
	return best;
}

function isSnapTarget(item: Item): boolean {
	return item.category !== 'rug' && item.mount !== 'wall' && item.mount !== 'ceiling';
}

export function canCarry(item: Pick<Item, 'category' | 'mount' | 'dims'>): boolean {
	return (
		!NON_CARRIERS.includes(item.category) &&
		item.mount !== 'wall' &&
		item.mount !== 'ceiling' &&
		item.dims.h >= 200
	);
}

export function canBeStacked(subject: Pick<PlaceSubject, 'mount' | 'category'>): boolean {
	if (subject.mount === 'on-top') return true;
	return subject.mount === 'floor' && STACKABLE.includes(subject.category);
}

function fitsOn(subject: Pick<PlaceSubject, 'dims'>, carrier: Pick<Item, 'dims'>): boolean {
	const a = [subject.dims.w, subject.dims.d].sort((x, y) => y - x);
	const b = [carrier.dims.w, carrier.dims.d].sort((x, y) => y - x);
	return a[0] <= b[0] + 20 && a[1] <= b[1] + 20;
}

function insideRect(point: Vec, item: Pick<Item, 'x' | 'y' | 'rotation' | 'dims'>): boolean {
	const local = rotate(sub(point, item), -item.rotation);
	return Math.abs(local.x) <= item.dims.w / 2 && Math.abs(local.y) <= item.dims.d / 2;
}

export function descendantsOf(items: readonly Item[], id: string): Item[] {
	const found: Item[] = [];
	const queue = [id];
	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const item of items) {
			if (item.onItemId === current && !found.includes(item)) {
				found.push(item);
				queue.push(item.id);
			}
		}
	}
	return found;
}

export function findCarrier(
	point: Vec,
	subject: PlaceSubject,
	others: readonly Item[],
	roomHeight: number
): Item | undefined {
	if (!canBeStacked(subject)) return undefined;
	let best: Item | undefined;
	let bestTop = -Infinity;
	for (const other of others) {
		if (!canCarry(other) || !insideRect(point, other) || !fitsOn(subject, other)) continue;
		const top = other.elevation + other.dims.h;
		if (top + subject.dims.h > roomHeight) continue;
		if (top > bestTop) {
			best = other;
			bestTop = top;
		}
	}
	return best;
}

export function stackOn(
	carrier: Pick<Item, 'x' | 'y' | 'rotation' | 'dims' | 'elevation'>,
	subject: Pick<PlaceSubject, 'dims' | 'rotation'>,
	point: Vec
): { x: number; y: number; elevation: number } {
	const local = rotate(sub(point, carrier), -carrier.rotation);
	const relative = subject.rotation - carrier.rotation;
	const reachX = Math.max(0, carrier.dims.w / 2 - support(subject.dims, relative, { x: 1, y: 0 }));
	const reachY = Math.max(0, carrier.dims.d / 2 - support(subject.dims, relative, { x: 0, y: 1 }));
	const clamped = {
		x: Math.max(-reachX, Math.min(reachX, local.x)),
		y: Math.max(-reachY, Math.min(reachY, local.y))
	};
	const world = add(carrier, rotate(clamped, carrier.rotation));
	return {
		x: Math.round(world.x),
		y: Math.round(world.y),
		elevation: carrier.elevation + carrier.dims.h
	};
}

interface WallSnap {
	center: Vec;
	rotation: number;
	guides: Guide[];
	snapped: boolean;
}

function snapToWalls(
	center: Vec,
	dims: Pick<Dims, 'w' | 'd'>,
	rotation: number,
	polygon: readonly Point[],
	threshold: number,
	autoRotate: boolean
): WallSnap {
	const list = walls(polygon).filter((wall) => wall.length > 1);
	let best: { wall: Wall; rotation: number; gap: number } | undefined;
	for (const wall of list) {
		const diff = angleDiff(wall.angleDeg, rotation);
		const rotates = autoRotate && Math.abs(diff) <= ROTATE_CAPTURE;
		const rot = rotates ? wall.angleDeg : rotation;
		const rel = sub(center, wall.start);
		const along = dot(rel, wall.direction);
		if (along < 0 || along > wall.length) continue;
		const gap = dot(rel, wall.inward) - support(dims, rot, wall.inward);
		const capture = rotates && Math.abs(diff) > 0.5 ? threshold * 3 : threshold;
		if (Math.abs(gap) > capture) continue;
		if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { wall, rotation: rot, gap };
	}
	if (!best) return { center, rotation, guides: [], snapped: false };
	let next = sub(center, scale(best.wall.inward, best.gap));
	const guides: Guide[] = [wallGuide(best.wall, next, dims, best.rotation)];
	for (const wall of list) {
		if (wall === best.wall || Math.abs(dot(wall.direction, best.wall.direction)) > 0.5) continue;
		const rel = sub(next, wall.start);
		const along = dot(rel, wall.direction);
		if (along < 0 || along > wall.length) continue;
		const gap = dot(rel, wall.inward) - support(dims, best.rotation, wall.inward);
		if (Math.abs(gap) > threshold) continue;
		next = sub(next, scale(wall.inward, gap));
		guides.push(wallGuide(wall, next, dims, best.rotation));
		break;
	}
	return { center: next, rotation: best.rotation, guides, snapped: true };
}

function wallGuide(wall: Wall, center: Vec, dims: Pick<Dims, 'w' | 'd'>, rotation: number): Guide {
	const along = dot(sub(center, wall.start), wall.direction);
	const half = support(dims, rotation, wall.direction);
	return {
		a: wallPoint(wall, Math.max(0, along - half), 0),
		b: wallPoint(wall, Math.min(wall.length, along + half), 0)
	};
}

interface AxisSnap {
	shift: number;
	line: number;
	from: number;
	to: number;
}

function snapToItems(
	center: Vec,
	dims: Pick<Dims, 'w' | 'd'>,
	rotation: number,
	others: readonly Item[],
	threshold: number,
	skipX: boolean,
	skipY: boolean
): { center: Vec; guides: Guide[]; snapped: boolean } {
	const { ux, uy } = axes(rotation);
	const hx = dims.w / 2;
	const hy = dims.d / 2;
	let bestX: AxisSnap | undefined;
	let bestY: AxisSnap | undefined;
	for (const other of others) {
		if (!isSnapTarget(other)) continue;
		const turn = Math.abs(angleDiff(other.rotation, rotation)) % 90;
		if (Math.min(turn, 90 - turn) > 2) continue;
		const rel = sub(other, center);
		const ox = dot(rel, ux);
		const oy = dot(rel, uy);
		const ex = support(other.dims, other.rotation, ux);
		const ey = support(other.dims, other.rotation, uy);
		if (!skipX && Math.abs(oy) <= hy + ey + threshold * 2) {
			const targets = [
				{ t: hx + ex, line: hx },
				{ t: -(hx + ex), line: -hx },
				{ t: ex - hx, line: -hx },
				{ t: hx - ex, line: hx },
				{ t: 0, line: 0 }
			];
			for (const { t, line } of targets) {
				const shift = ox - t;
				if (Math.abs(shift) > threshold) continue;
				if (!bestX || Math.abs(shift) < Math.abs(bestX.shift)) {
					bestX = { shift, line, from: Math.min(-hy, oy - ey), to: Math.max(hy, oy + ey) };
				}
			}
		}
		if (!skipY && Math.abs(ox) <= hx + ex + threshold * 2) {
			const targets = [
				{ t: hy + ey, line: hy },
				{ t: -(hy + ey), line: -hy },
				{ t: ey - hy, line: -hy },
				{ t: hy - ey, line: hy },
				{ t: 0, line: 0 }
			];
			for (const { t, line } of targets) {
				const shift = oy - t;
				if (Math.abs(shift) > threshold) continue;
				if (!bestY || Math.abs(shift) < Math.abs(bestY.shift)) {
					bestY = { shift, line, from: Math.min(-hx, ox - ex), to: Math.max(hx, ox + ex) };
				}
			}
		}
	}
	let next = center;
	if (bestX) next = add(next, scale(ux, bestX.shift));
	if (bestY) next = add(next, scale(uy, bestY.shift));
	const guides: Guide[] = [];
	if (bestX) {
		guides.push({
			a: add(next, add(scale(ux, bestX.line), scale(uy, bestX.from))),
			b: add(next, add(scale(ux, bestX.line), scale(uy, bestX.to)))
		});
	}
	if (bestY) {
		guides.push({
			a: add(next, add(scale(uy, bestY.line), scale(ux, bestY.from))),
			b: add(next, add(scale(uy, bestY.line), scale(ux, bestY.to)))
		});
	}
	return { center: next, guides, snapped: Boolean(bestX || bestY) };
}

export function computePlacement(
	subject: PlaceSubject,
	raw: Vec,
	context: PlaceContext
): Placement {
	const { room, others, threshold } = context;
	const dims = subject.dims;

	if (subject.mount === 'wall') {
		const near = nearestWall(room.polygon, raw);
		if (near) {
			const wall = near.wall;
			const half = dims.w / 2;
			const along =
				wall.length <= dims.w
					? wall.length / 2
					: Math.max(half, Math.min(wall.length - half, near.along));
			const center = wallPoint(wall, along, dims.d / 2);
			return {
				x: Math.round(center.x),
				y: Math.round(center.y),
				rotation: wall.angleDeg,
				elevation: subject.elevation,
				guides: [wallGuide(wall, center, dims, wall.angleDeg)],
				snapped: true,
				inside: true
			};
		}
	}

	if (subject.mount === 'ceiling') {
		const fitted = fitInside(room.polygon, raw, dims, subject.rotation);
		return {
			x: Math.round(fitted.x),
			y: Math.round(fitted.y),
			rotation: subject.rotation,
			elevation: Math.max(0, room.height - dims.h),
			guides: [],
			snapped: false,
			inside: isInside(room.polygon, fitted, dims, subject.rotation)
		};
	}

	const carrier = findCarrier(raw, subject, others, room.height);
	if (carrier) {
		const stacked = stackOn(carrier, subject, raw);
		return {
			x: stacked.x,
			y: stacked.y,
			rotation: subject.rotation,
			elevation: stacked.elevation,
			onItemId: carrier.id,
			guides: [],
			snapped: true,
			inside: true
		};
	}

	let center = raw;
	let rotation = subject.rotation;
	let guides: Guide[] = [];
	let snapped = false;
	let wallAxisX = false;
	let wallAxisY = false;
	if (context.wallSnap !== false) {
		const result = snapToWalls(
			center,
			dims,
			rotation,
			room.polygon,
			threshold,
			context.autoRotate !== false
		);
		center = result.center;
		rotation = result.rotation;
		guides = result.guides;
		snapped = result.snapped;
		if (snapped) {
			const { ux, uy } = axes(rotation);
			for (const guide of result.guides) {
				const direction = normalize(sub(guide.b, guide.a));
				if (Math.abs(dot(direction, ux)) > 0.9) wallAxisY = true;
				if (Math.abs(dot(direction, uy)) > 0.9) wallAxisX = true;
			}
		}
	}
	if (context.itemSnap !== false) {
		const result = snapToItems(center, dims, rotation, others, threshold, wallAxisX, wallAxisY);
		center = result.center;
		guides = [...guides, ...result.guides];
		snapped = snapped || result.snapped;
	}
	const fitted = fitInside(room.polygon, center, dims, rotation);
	const moved = fitted.x !== center.x || fitted.y !== center.y;
	const x = Math.round(fitted.x);
	const y = Math.round(fitted.y);
	return {
		x,
		y,
		rotation,
		elevation: subject.onItemId ? 0 : subject.elevation,
		guides: moved ? [] : guides,
		snapped,
		inside: isInside(room.polygon, { x, y }, dims, rotation)
	};
}

function normalize(v: Vec): Vec {
	const len = Math.hypot(v.x, v.y) || 1;
	return { x: v.x / len, y: v.y / len };
}

export function findFreeSpot(
	room: Pick<Room, 'polygon' | 'height'>,
	others: readonly Item[],
	dims: Pick<Dims, 'w' | 'd'>,
	rotation = 0,
	prefer?: Vec
): Vec | undefined {
	const target = prefer ?? interiorPoint(room.polygon);
	const box = boundingBox(room.polygon);
	const step = 100;
	const solid = others.filter((item) => item.category !== 'rug' && item.mount !== 'ceiling');
	const shapes = solid.map((item) => itemFootprint(item));
	const candidates: { point: Vec; distance: number }[] = [];
	for (let x = box.minX; x <= box.maxX; x += step) {
		for (let y = box.minY; y <= box.maxY; y += step) {
			candidates.push({ point: { x, y }, distance: Math.hypot(x - target.x, y - target.y) });
		}
	}
	candidates.sort((a, b) => a.distance - b.distance);
	for (const candidate of candidates) {
		if (!isInside(room.polygon, candidate.point, dims, rotation)) continue;
		const shape = footprint({ ...candidate.point, rotation, dims });
		if (shapes.some((other) => convexOverlap(shape, other, 2))) continue;
		return candidate.point;
	}
	return undefined;
}
