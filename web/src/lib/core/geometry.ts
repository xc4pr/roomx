import type { Door, Item, Point, Room, RoomElement, Slope, WallElement } from './schema.ts';
import { isWallElement } from './schema.ts';

export interface Vec {
	x: number;
	y: number;
}

export interface Wall {
	number: number;
	startIndex: number;
	endIndex: number;
	start: Point;
	end: Point;
	length: number;
	direction: Vec;
	inward: Vec;
	angleDeg: number;
}

export interface Span {
	from: number;
	to: number;
}

const EPS = 1e-9;

export function add(a: Vec, b: Vec): Vec {
	return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec, b: Vec): Vec {
	return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec, factor: number): Vec {
	return { x: a.x * factor, y: a.y * factor };
}

export function dot(a: Vec, b: Vec): number {
	return a.x * b.x + a.y * b.y;
}

export function cross(a: Vec, b: Vec): number {
	return a.x * b.y - a.y * b.x;
}

export function length(a: Vec): number {
	return Math.hypot(a.x, a.y);
}

export function distance(a: Vec, b: Vec): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

export function rotate(a: Vec, degrees: number): Vec {
	const rad = (degrees * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	return { x: a.x * cos - a.y * sin, y: a.x * sin + a.y * cos };
}

export function roundPoint(a: Vec): Point {
	return { x: Math.round(a.x), y: Math.round(a.y) };
}

export function normalizeDegrees(degrees: number): number {
	const wrapped = ((degrees % 360) + 360) % 360;
	const rounded = Math.round(wrapped * 100) / 100;
	return rounded === 360 ? 0 : rounded;
}

export function cornerLabel(index: number): string {
	let label = '';
	let rest = index;
	do {
		label = String.fromCharCode(65 + (rest % 26)) + label;
		rest = Math.floor(rest / 26) - 1;
	} while (rest >= 0);
	return label;
}

export function signedArea(polygon: readonly Vec[]): number {
	let sum = 0;
	for (let i = 0; i < polygon.length; i++) {
		sum += cross(polygon[i], polygon[(i + 1) % polygon.length]);
	}
	return sum / 2;
}

export function areaMm2(polygon: readonly Vec[]): number {
	return Math.abs(signedArea(polygon));
}

export function perimeter(polygon: readonly Vec[]): number {
	let sum = 0;
	for (let i = 0; i < polygon.length; i++) {
		sum += distance(polygon[i], polygon[(i + 1) % polygon.length]);
	}
	return sum;
}

export function boundingBox(points: readonly Vec[]): {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
} {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of points) {
		minX = Math.min(minX, p.x);
		minY = Math.min(minY, p.y);
		maxX = Math.max(maxX, p.x);
		maxY = Math.max(maxY, p.y);
	}
	return { minX, minY, maxX, maxY };
}

export function centroid(polygon: readonly Vec[]): Vec {
	const area = signedArea(polygon);
	if (Math.abs(area) < EPS) {
		const box = boundingBox(polygon);
		return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
	}
	let cx = 0;
	let cy = 0;
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i];
		const b = polygon[(i + 1) % polygon.length];
		const f = cross(a, b);
		cx += (a.x + b.x) * f;
		cy += (a.y + b.y) * f;
	}
	return { x: cx / (6 * area), y: cy / (6 * area) };
}

// Canonical form: counter-clockwise, corner A at the origin, wall 1 along +x.
export function normalizePolygon(polygon: readonly Vec[]): Point[] {
	const ccw = signedArea(polygon) < 0 ? [polygon[0], ...polygon.slice(1).reverse()] : [...polygon];
	const origin = ccw[0];
	const first = sub(ccw[1], origin);
	const angle = (-Math.atan2(first.y, first.x) * 180) / Math.PI;
	return ccw.map((p) => roundPoint(rotate(sub(p, origin), angle)));
}

export function walls(polygon: readonly Point[]): Wall[] {
	return polygon.map((start, index) => {
		const endIndex = (index + 1) % polygon.length;
		const end = polygon[endIndex];
		const delta = sub(end, start);
		const len = length(delta);
		const direction = len < EPS ? { x: 1, y: 0 } : scale(delta, 1 / len);
		return {
			number: index + 1,
			startIndex: index,
			endIndex,
			start,
			end,
			length: len,
			direction,
			inward: { x: -direction.y, y: direction.x },
			angleDeg: normalizeDegrees((Math.atan2(direction.y, direction.x) * 180) / Math.PI)
		};
	});
}

export function wall(polygon: readonly Point[], number: number): Wall | undefined {
	return walls(polygon)[number - 1];
}

export function wallPoint(target: Wall, along: number, inwardDistance = 0): Vec {
	return add(
		add(target.start, scale(target.direction, along)),
		scale(target.inward, inwardDistance)
	);
}

export function interiorAngle(polygon: readonly Point[], index: number): number {
	const n = polygon.length;
	const prev = polygon[(index - 1 + n) % n];
	const current = polygon[index];
	const next = polygon[(index + 1) % n];
	const incoming = sub(current, prev);
	const outgoing = sub(next, current);
	const turn = (Math.atan2(cross(incoming, outgoing), dot(incoming, outgoing)) * 180) / Math.PI;
	return 180 - turn;
}

export function isConvexCorner(polygon: readonly Point[], index: number): boolean {
	return interiorAngle(polygon, index) < 180;
}

function segmentsIntersect(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
	const d1 = cross(sub(b, a), sub(c, a));
	const d2 = cross(sub(b, a), sub(d, a));
	const d3 = cross(sub(d, c), sub(a, c));
	const d4 = cross(sub(d, c), sub(b, c));
	return d1 * d2 < -EPS && d3 * d4 < -EPS;
}

export function isSimplePolygon(polygon: readonly Vec[]): boolean {
	const n = polygon.length;
	if (n < 3) return false;
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
			if (segmentsIntersect(polygon[i], polygon[(i + 1) % n], polygon[j], polygon[(j + 1) % n])) {
				return false;
			}
		}
	}
	return true;
}

export function pointOnSegmentDistance(p: Vec, a: Vec, b: Vec): number {
	const ab = sub(b, a);
	const lenSq = dot(ab, ab);
	if (lenSq < EPS) return distance(p, a);
	const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / lenSq));
	return distance(p, add(a, scale(ab, t)));
}

export function pointInPolygon(p: Vec, polygon: readonly Vec[], tolerance = 0): boolean {
	const n = polygon.length;
	if (tolerance > 0) {
		for (let i = 0; i < n; i++) {
			if (pointOnSegmentDistance(p, polygon[i], polygon[(i + 1) % n]) <= tolerance) return true;
		}
	}
	let inside = false;
	for (let i = 0, j = n - 1; i < n; j = i++) {
		const a = polygon[i];
		const b = polygon[j];
		if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
			inside = !inside;
		}
	}
	return inside;
}

function shrinkConvex(convex: readonly Vec[], amount: number): Vec[] {
	const orientation = Math.sign(signedArea(convex)) || 1;
	const n = convex.length;
	const inwardNormal = (from: Vec, to: Vec): Vec => {
		const edge = sub(to, from);
		const len = length(edge) || 1;
		return { x: (-edge.y / len) * orientation, y: (edge.x / len) * orientation };
	};
	return convex.map((corner, i) => {
		const before = inwardNormal(convex[(i - 1 + n) % n], corner);
		const after = inwardNormal(corner, convex[(i + 1) % n]);
		return add(corner, scale(add(before, after), amount));
	});
}

export function convexInsidePolygon(
	inner: readonly Vec[],
	outer: readonly Vec[],
	tolerance = 1
): boolean {
	if (!inner.every((p) => pointInPolygon(p, outer, tolerance))) return false;
	const shrunk = shrinkConvex(inner, tolerance);
	for (let i = 0; i < shrunk.length; i++) {
		for (let j = 0; j < outer.length; j++) {
			if (
				segmentsIntersect(
					shrunk[i],
					shrunk[(i + 1) % shrunk.length],
					outer[j],
					outer[(j + 1) % outer.length]
				)
			) {
				return false;
			}
		}
	}
	return !outer.some((corner) => pointStrictlyInsideConvex(corner, inner, tolerance));
}

function pointStrictlyInsideConvex(p: Vec, convex: readonly Vec[], tolerance: number): boolean {
	const orientation = Math.sign(signedArea(convex)) || 1;
	for (let i = 0; i < convex.length; i++) {
		const a = convex[i];
		const b = convex[(i + 1) % convex.length];
		const edge = sub(b, a);
		const side = (cross(edge, sub(p, a)) * orientation) / (length(edge) || 1);
		if (side <= tolerance) return false;
	}
	return true;
}

export function convexOverlap(a: readonly Vec[], b: readonly Vec[], tolerance = 1): boolean {
	for (const shape of [a, b]) {
		for (let i = 0; i < shape.length; i++) {
			const edge = sub(shape[(i + 1) % shape.length], shape[i]);
			const len = length(edge);
			if (len < EPS) continue;
			const axis = { x: -edge.y / len, y: edge.x / len };
			let minA = Infinity;
			let maxA = -Infinity;
			let minB = Infinity;
			let maxB = -Infinity;
			for (const p of a) {
				const projection = dot(p, axis);
				minA = Math.min(minA, projection);
				maxA = Math.max(maxA, projection);
			}
			for (const p of b) {
				const projection = dot(p, axis);
				minB = Math.min(minB, projection);
				maxB = Math.max(maxB, projection);
			}
			if (maxA - minB <= tolerance || maxB - minA <= tolerance) return false;
		}
	}
	return true;
}

export interface Placement {
	x: number;
	y: number;
	rotation: number;
	dims: { w: number; d: number };
}

// Corners in order: back-left, back-right, front-right, front-left, seen from above with the front towards +y at rotation 0.
export function footprint(placement: Placement): Vec[] {
	const hw = placement.dims.w / 2;
	const hd = placement.dims.d / 2;
	const center = { x: placement.x, y: placement.y };
	return [
		{ x: -hw, y: -hd },
		{ x: hw, y: -hd },
		{ x: hw, y: hd },
		{ x: -hw, y: hd }
	].map((corner) => add(center, rotate(corner, placement.rotation)));
}

export function itemFootprint(item: Pick<Item, 'x' | 'y' | 'rotation' | 'dims'>): Vec[] {
	return footprint(item);
}

export function frontDirection(rotation: number): Vec {
	return rotate({ x: 0, y: 1 }, rotation);
}

export function elementSpan(element: WallElement): Span {
	return { from: element.offset, to: element.offset + element.width };
}

export function wallElements(room: Pick<Room, 'elements'>, wallNumber: number): WallElement[] {
	return room.elements
		.filter(isWallElement)
		.filter((element) => element.wall === wallNumber)
		.sort((a, b) => a.offset - b.offset);
}

const BLOCKING_KINDS: readonly RoomElement['kind'][] = [
	'door',
	'window',
	'builtin',
	'obstacle',
	'radiator'
];

export function blocksWall(element: RoomElement): element is WallElement {
	return BLOCKING_KINDS.includes(element.kind);
}

export function freeWallSpans(
	room: Pick<Room, 'polygon' | 'elements'>,
	wallNumber: number
): Span[] {
	const target = wall(room.polygon, wallNumber);
	if (!target) return [];
	const total = Math.round(target.length);
	const blocked = wallElements(room, wallNumber)
		.filter(blocksWall)
		.map(elementSpan)
		.map((span) => ({ from: Math.max(0, span.from), to: Math.min(total, span.to) }))
		.filter((span) => span.to > span.from)
		.sort((a, b) => a.from - b.from);
	const free: Span[] = [];
	let cursor = 0;
	for (const span of blocked) {
		if (span.from > cursor) free.push({ from: cursor, to: span.from });
		cursor = Math.max(cursor, span.to);
	}
	if (cursor < total) free.push({ from: cursor, to: total });
	return free;
}

export function wallElementFootprint(
	polygon: readonly Point[],
	element: WallElement,
	depth: number
): Vec[] {
	const target = wall(polygon, element.wall);
	if (!target) return [];
	return [
		wallPoint(target, element.offset, 0),
		wallPoint(target, element.offset + element.width, 0),
		wallPoint(target, element.offset + element.width, depth),
		wallPoint(target, element.offset, depth)
	];
}

export interface DoorSwing {
	hinge: Vec;
	radius: number;
	closedDirection: Vec;
	openDirection: Vec;
	polygon: Vec[];
}

export function doorSwing(polygon: readonly Point[], door: Door, steps = 8): DoorSwing | undefined {
	if (door.swing === 'sliding') return undefined;
	const target = wall(polygon, door.wall);
	if (!target) return undefined;
	const hingeAlong = door.hinge === 'start' ? door.offset : door.offset + door.width;
	const hinge = wallPoint(target, hingeAlong);
	const closedDirection = door.hinge === 'start' ? target.direction : scale(target.direction, -1);
	const openDirection = door.swing === 'in' ? target.inward : scale(target.inward, -1);
	const sweep = Math.sign(cross(closedDirection, openDirection)) * 90;
	const arc: Vec[] = [hinge];
	for (let i = 0; i <= steps; i++) {
		arc.push(add(hinge, scale(rotate(closedDirection, (sweep * i) / steps), door.width)));
	}
	return { hinge, radius: door.width, closedDirection, openDirection, polygon: arc };
}

export function nearestWall(
	polygon: readonly Point[],
	p: Vec
): { wall: Wall; along: number; distance: number } | undefined {
	let best: { wall: Wall; along: number; distance: number } | undefined;
	for (const candidate of walls(polygon)) {
		const along = Math.max(
			0,
			Math.min(candidate.length, dot(sub(p, candidate.start), candidate.direction))
		);
		const d = distance(p, wallPoint(candidate, along));
		if (!best || d < best.distance) best = { wall: candidate, along, distance: d };
	}
	return best;
}

export function elementPosition(polygon: readonly Point[], element: RoomElement): Vec | undefined {
	if (!isWallElement(element)) return { x: element.x, y: element.y };
	const target = wall(polygon, element.wall);
	return target ? wallPoint(target, element.offset + element.width / 2) : undefined;
}

export function polygonFromSegments(segments: readonly { length: number; turnDeg: number }[]): {
	points: Vec[];
	gap: number;
} {
	const points: Vec[] = [{ x: 0, y: 0 }];
	let heading = 0;
	let cursor: Vec = { x: 0, y: 0 };
	segments.forEach((segment, index) => {
		cursor = add(cursor, rotate({ x: segment.length, y: 0 }, heading));
		heading += segment.turnDeg;
		if (index < segments.length - 1) points.push(cursor);
	});
	return { points, gap: length(cursor) };
}

export function roomToBoard(room: Pick<Room, 'boardPos'>, p: Vec): Vec {
	return add(rotate(p, room.boardPos.rot), { x: room.boardPos.x, y: room.boardPos.y });
}

export function boardToRoom(room: Pick<Room, 'boardPos'>, p: Vec): Vec {
	return rotate(sub(p, { x: room.boardPos.x, y: room.boardPos.y }), -room.boardPos.rot);
}

type Sloped = Pick<Room, 'polygon' | 'height' | 'slopes'>;

// A slope starts at its wall at knee height and rises into the room until it meets the flat ceiling.
export function slopeRun(room: Pick<Room, 'height'>, slope: Slope): number {
	const rise = Math.max(0, room.height - slope.kneeHeight);
	return rise / Math.tan((slope.angle * Math.PI) / 180);
}

export function slopeHeightAt(room: Sloped, slope: Slope, p: Vec): number {
	const target = wall(room.polygon, slope.wall);
	if (!target) return room.height;
	const fromWall = Math.max(0, dot(sub(p, target.start), target.inward));
	return Math.min(
		room.height,
		slope.kneeHeight + fromWall * Math.tan((slope.angle * Math.PI) / 180)
	);
}

export function ceilingHeightAt(room: Sloped, p: Vec): number {
	let height = room.height;
	for (const slope of room.slopes ?? []) height = Math.min(height, slopeHeightAt(room, slope, p));
	return height;
}

export function wallSlope(room: Pick<Room, 'slopes'>, wallNumber: number): Slope | undefined {
	return room.slopes?.find((slope) => slope.wall === wallNumber);
}

// Height of the wall surface at a position along the wall: knee height on a sloped wall,
// and the profile cut by neighbouring slopes on gable walls.
export function wallHeightAt(room: Sloped, wallNumber: number, along: number): number {
	const target = wall(room.polygon, wallNumber);
	if (!target) return room.height;
	return ceilingHeightAt(room, wallPoint(target, along));
}

// Line inside the room where a slope reaches the given clear height (e.g. 2000 mm standing height).
export function slopeContour(
	room: Sloped,
	slope: Slope,
	clearHeight: number
): { from: Vec; to: Vec } | undefined {
	const target = wall(room.polygon, slope.wall);
	if (!target || clearHeight <= slope.kneeHeight || clearHeight > room.height) return undefined;
	const distance = (clearHeight - slope.kneeHeight) / Math.tan((slope.angle * Math.PI) / 180);
	return { from: wallPoint(target, 0, distance), to: wallPoint(target, target.length, distance) };
}
