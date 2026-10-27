import { ShapeUtils, Vector2 } from 'three';
import {
	ceilingHeightAt,
	pointInPolygon,
	roofWindowPlacement,
	slopeDormers,
	slopeSpan,
	wall,
	type RoofWindowPlacement,
	type Vec
} from '#lib/core/geometry.ts';
import { isRoofWindow, type Room, type RoofWindow } from '#lib/core/schema.ts';

export interface RoofPoint extends Vec {
	h: number;
}

export type RoofTriangle = readonly [RoofPoint, RoofPoint, RoofPoint];

export interface RoofSurface {
	flat: RoofTriangle[];
	sloped: RoofTriangle[];
}

export interface RoofEdge {
	from: RoofPoint;
	to: RoofPoint;
}

// Vertical face where the ceiling steps (side of a dormer, end of a partial slope, cut above an
// opening): a trapezoid between the lower and the upper ceiling. "toward" points from the higher to
// the lower side, i.e. into the roof body.
export interface RoofCheek {
	from: Vec;
	to: Vec;
	fromLow: number;
	fromHigh: number;
	toLow: number;
	toHigh: number;
	toward: Vec;
}

export interface RoofWindowShape {
	element: RoofWindow;
	placement: RoofWindowPlacement;
	corners: RoofPoint[];
}

export interface RoofModel {
	surface: RoofSurface;
	edges: RoofEdge[];
	cheeks: RoofCheek[];
	windows: RoofWindowShape[];
}

// a * x + b * y + c: either a boundary line (equals zero) or an affine ceiling height.
export interface Line {
	a: number;
	b: number;
	c: number;
}

const MIN_AREA = 1;
const FLAT_TOLERANCE = 0.5;
const SIDE_TOLERANCE = 1e-6;
const INNER = 1 - 1e-6;
const PROBE = 0.5;
const STEP_TOLERANCE = 0.5;
const KINK_TOLERANCE = 1e-4;
const NUDGE = 1e-3;

function tan(degrees: number): number {
	return Math.tan((degrees * Math.PI) / 180);
}

function normalise(line: Line): Line | undefined {
	const size = Math.hypot(line.a, line.b);
	if (size < 1e-9) return undefined;
	let { a, b, c } = line;
	if (a < -1e-9 || (Math.abs(a) <= 1e-9 && b < 0)) {
		a = -a;
		b = -b;
		c = -c;
	}
	return { a: a / size, b: b / size, c: c / size };
}

function addUnique(lines: Line[], line: Line | undefined): void {
	if (!line) return;
	const known = lines.some(
		(other) =>
			Math.abs(other.a - line.a) < 1e-9 &&
			Math.abs(other.b - line.b) < 1e-9 &&
			Math.abs(other.c - line.c) < 1e-3
	);
	if (!known) lines.push(line);
}

function through(p: Vec, q: Vec): Line | undefined {
	return normalise({ a: q.y - p.y, b: p.x - q.x, c: q.x * p.y - p.x * q.y });
}

// Every line along which the ceiling can change its gradient or jump: where two of the height
// functions of the slopes (plane, knee wall, full height, dormer heights) are equal, and the lines
// across the wall where a slope or dormer starts or ends. Cutting the room along all of them
// leaves pieces on which the ceiling is one plane.
export function ceilingLines(room: Room): Line[] {
	const heights: Line[] = [];
	const bounds: Line[] = [];
	const constant = (value: number) => {
		if (
			!heights.some((other) => other.a === 0 && other.b === 0 && Math.abs(other.c - value) < 1e-6)
		)
			heights.push({ a: 0, b: 0, c: value });
	};
	constant(room.height);
	for (const slope of room.slopes ?? []) {
		const target = wall(room.polygon, slope.wall);
		if (!target) continue;
		const t = tan(slope.angle);
		heights.push({
			a: t * target.inward.x,
			b: t * target.inward.y,
			c:
				slope.kneeHeight - t * (target.inward.x * target.start.x + target.inward.y * target.start.y)
		});
		constant(slope.kneeHeight);
		const across = (along: number): Line => ({
			a: target.direction.x,
			b: target.direction.y,
			c: -(target.direction.x * target.start.x + target.direction.y * target.start.y + along)
		});
		const span = slopeSpan(room, slope);
		if (span) {
			addUnique(bounds, normalise(across(span.from)));
			addUnique(bounds, normalise(across(span.to)));
		}
		for (const dormer of slopeDormers(room, slope)) {
			constant(Math.min(room.height, dormer.height));
			addUnique(bounds, normalise(across(dormer.from)));
			addUnique(bounds, normalise(across(dormer.to)));
		}
	}
	const lines: Line[] = [...bounds];
	for (let i = 0; i < heights.length; i++) {
		for (let j = i + 1; j < heights.length; j++) {
			const p = heights[i];
			const q = heights[j];
			addUnique(lines, normalise({ a: p.a - q.a, b: p.b - q.b, c: p.c - q.c }));
		}
	}
	return lines;
}

function side(line: Line, point: Vec): number {
	return line.a * point.x + line.b * point.y + line.c;
}

function area(points: readonly Vec[]): number {
	let sum = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		sum += a.x * b.y - b.x * a.y;
	}
	return sum / 2;
}

function split(polygon: readonly Vec[], line: Line): [Vec[], Vec[]] {
	const positive: Vec[] = [];
	const negative: Vec[] = [];
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i];
		const b = polygon[(i + 1) % polygon.length];
		const sa = side(line, a);
		const sb = side(line, b);
		if (sa >= -SIDE_TOLERANCE) positive.push(a);
		if (sa <= SIDE_TOLERANCE) negative.push(a);
		if (
			(sa > SIDE_TOLERANCE && sb < -SIDE_TOLERANCE) ||
			(sa < -SIDE_TOLERANCE && sb > SIDE_TOLERANCE)
		) {
			const t = sa / (sa - sb);
			const crossing = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
			positive.push(crossing);
			negative.push(crossing);
		}
	}
	return [positive, negative];
}

function cells(room: Room, lines: readonly Line[]): Vec[][] {
	const outline = room.polygon.map((point) => new Vector2(point.x, point.y));
	const triangles = ShapeUtils.triangulateShape(outline, []);
	let pieces: Vec[][] = triangles.map((triangle) => triangle.map((index) => room.polygon[index]));
	for (const line of lines) {
		const next: Vec[][] = [];
		for (const piece of pieces) {
			const values = piece.map((point) => side(line, point));
			if (
				values.every((value) => value >= -SIDE_TOLERANCE) ||
				values.every((value) => value <= SIDE_TOLERANCE)
			) {
				next.push(piece);
				continue;
			}
			for (const part of split(piece, line)) {
				if (part.length >= 3 && Math.abs(area(part)) >= MIN_AREA) next.push(part);
			}
		}
		pieces = next;
	}
	return pieces;
}

function clipToRoom(room: Room, line: Line, others: readonly Line[]): [Vec, Vec][] {
	const direction = { x: -line.b, y: line.a };
	const origin = { x: -line.a * line.c, y: -line.b * line.c };
	const along = (p: Vec) => (p.x - origin.x) * direction.x + (p.y - origin.y) * direction.y;
	const params: number[] = [];
	const polygon = room.polygon;
	for (let i = 0; i < polygon.length; i++) {
		const p = polygon[i];
		const q = polygon[(i + 1) % polygon.length];
		const sp = side(line, p);
		const sq = side(line, q);
		if (
			(sp > SIDE_TOLERANCE && sq < -SIDE_TOLERANCE) ||
			(sp < -SIDE_TOLERANCE && sq > SIDE_TOLERANCE)
		) {
			const t = sp / (sp - sq);
			params.push(along({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }));
		}
	}
	for (const other of others) {
		if (other === line) continue;
		const denominator = other.a * direction.x + other.b * direction.y;
		if (Math.abs(denominator) < 1e-9) continue;
		params.push(-(other.a * origin.x + other.b * origin.y + other.c) / denominator);
	}
	for (const p of polygon) {
		if (Math.abs(side(line, p)) <= SIDE_TOLERANCE) params.push(along(p));
	}
	params.sort((a, b) => a - b);
	const result: [Vec, Vec][] = [];
	for (let i = 1; i < params.length; i++) {
		if (params[i] - params[i - 1] < 1) continue;
		const mid = (params[i] + params[i - 1]) / 2;
		const midpoint = { x: origin.x + direction.x * mid, y: origin.y + direction.y * mid };
		if (!pointInPolygon(midpoint, polygon)) continue;
		result.push([
			{ x: origin.x + direction.x * params[i - 1], y: origin.y + direction.y * params[i - 1] },
			{ x: origin.x + direction.x * params[i], y: origin.y + direction.y * params[i] }
		]);
	}
	return result;
}

interface Feature {
	from: Vec;
	to: Vec;
	cheek?: RoofCheek;
	heightFrom: number;
	heightTo: number;
}

// Looks at the ceiling on both sides of a stretch of a line: a jump makes a cheek, a change of
// gradient makes a crease. Stretches along the room outline are skipped (the walls handle those).
function inspect(room: Room, line: Line, from: Vec, to: Vec): Feature | undefined {
	const normal = { x: line.a, y: line.b };
	const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
	const at = (p: Vec, distance: number) =>
		ceilingHeightAt(room, { x: p.x + normal.x * distance, y: p.y + normal.y * distance });
	const reach = PROBE * 2;
	const inside = (distance: number) =>
		pointInPolygon(
			{ x: mid.x + normal.x * distance, y: mid.y + normal.y * distance },
			room.polygon
		);
	if (!inside(reach) || !inside(-reach)) return undefined;
	const before = 2 * at(mid, -PROBE) - at(mid, -reach);
	const after = 2 * at(mid, PROBE) - at(mid, reach);
	const kink = Math.abs(at(mid, -PROBE) - at(mid, -reach) - (at(mid, reach) - at(mid, PROBE)));
	const step = Math.abs(before - after) > STEP_TOLERANCE;
	if (!step && kink / PROBE <= KINK_TOLERANCE) return undefined;
	const length = Math.hypot(to.x - from.x, to.y - from.y);
	const inset = (p: Vec, toward: Vec): Vec => ({
		x: p.x + ((toward.x - p.x) / length) * NUDGE,
		y: p.y + ((toward.y - p.y) / length) * NUDGE
	});
	const start = inset(from, to);
	const end = inset(to, from);
	const heightFrom = at(start, 0);
	const heightTo = at(end, 0);
	if (!step) return { from, to, heightFrom, heightTo };
	const positiveHigher = after > before;
	const high = positiveHigher ? NUDGE : -NUDGE;
	const low = -high;
	return {
		from,
		to,
		heightFrom,
		heightTo,
		cheek: {
			from,
			to,
			fromHigh: at(start, high),
			fromLow: at(start, low),
			toHigh: at(end, high),
			toLow: at(end, low),
			toward: positiveHigher ? { x: -normal.x, y: -normal.y } : normal
		}
	};
}

function windowShapes(room: Room): RoofWindowShape[] {
	const result: RoofWindowShape[] = [];
	for (const element of room.elements) {
		if (!isRoofWindow(element)) continue;
		const placement = roofWindowPlacement(room, element);
		if (!placement) continue;
		const [c0, c1, c2, c3] = placement.corners;
		result.push({
			element,
			placement,
			corners: [
				{ ...c0, h: placement.bottom },
				{ ...c1, h: placement.bottom },
				{ ...c2, h: placement.top },
				{ ...c3, h: placement.top }
			]
		});
	}
	return result;
}

function windowLines(windows: readonly RoofWindowShape[]): Line[] {
	const lines: Line[] = [];
	for (const { corners } of windows) {
		for (let i = 0; i < corners.length; i++) {
			addUnique(lines, through(corners[i], corners[(i + 1) % corners.length]));
		}
	}
	return lines;
}

// The roof as a height field with jumps: the room is cut along every line where the ceiling bends
// or jumps, each piece is planar and every vertex sits on ceilingHeightAt (taken just inside the
// piece, because on a jump the height is ambiguous). Jumps become cheeks, bends become creases,
// roof windows become holes.
export function roofModel(room: Room): RoofModel {
	const candidates = ceilingLines(room);
	const found = new Map<Line, Feature[]>();
	for (const line of candidates) {
		const features: Feature[] = [];
		for (const [from, to] of clipToRoom(room, line, candidates)) {
			const feature = inspect(room, line, from, to);
			if (feature) features.push(feature);
		}
		if (features.length > 0) found.set(line, features);
	}
	const kept = [...found.keys()];
	const windows = windowShapes(room);
	const lines = [...kept];
	for (const line of windowLines(windows)) addUnique(lines, line);

	const edges: RoofEdge[] = [];
	const cheeks: RoofCheek[] = [];
	for (const line of kept) {
		for (const [from, to] of clipToRoom(room, line, kept)) {
			const feature = inspect(room, line, from, to);
			if (!feature) continue;
			const point = (p: Vec, h: number): RoofPoint => ({ x: p.x, y: p.y, h });
			if (feature.cheek) {
				const c = feature.cheek;
				cheeks.push(c);
				edges.push({ from: point(from, c.fromHigh), to: point(to, c.toHigh) });
				edges.push({ from: point(from, c.fromLow), to: point(to, c.toLow) });
				edges.push({ from: point(from, c.fromLow), to: point(from, c.fromHigh) });
				edges.push({ from: point(to, c.toLow), to: point(to, c.toHigh) });
			} else {
				edges.push({
					from: point(from, feature.heightFrom),
					to: point(to, feature.heightTo)
				});
			}
		}
	}

	const surface: RoofSurface = { flat: [], sloped: [] };
	for (const piece of cells(room, lines)) {
		const centre = {
			x: piece.reduce((sum, p) => sum + p.x, 0) / piece.length,
			y: piece.reduce((sum, p) => sum + p.y, 0) / piece.length
		};
		if (windows.some(({ corners }) => pointInPolygon(centre, corners))) continue;
		const oriented = area(piece) < 0 ? [...piece].reverse() : piece;
		const lifted = oriented.map((point) => ({
			...point,
			h: ceilingHeightAt(room, {
				x: centre.x + (point.x - centre.x) * INNER,
				y: centre.y + (point.y - centre.y) * INNER
			})
		}));
		const flat = lifted.every((point) => Math.abs(point.h - room.height) < FLAT_TOLERANCE);
		for (let i = 1; i < lifted.length - 1; i++) {
			const triangle: RoofTriangle = [lifted[0], lifted[i], lifted[i + 1]];
			(flat ? surface.flat : surface.sloped).push(triangle);
		}
	}
	return { surface, edges, cheeks, windows };
}

export function roofSurface(room: Room): RoofSurface {
	return roofModel(room).surface;
}

export function roofEdges(room: Room): RoofEdge[] {
	return roofModel(room).edges;
}

export function wallLineKnots(room: Room, wallNumber: number): number[] {
	const target = wall(room.polygon, wallNumber);
	if (!target) return [];
	const knots: number[] = [];
	for (const line of ceilingLines(room)) {
		const slopeAlong = line.a * target.direction.x + line.b * target.direction.y;
		if (Math.abs(slopeAlong) < 1e-9) continue;
		const u = -side(line, target.start) / slopeAlong;
		if (Number.isFinite(u) && u > 0.01 && u < target.length - 0.01) knots.push(u);
	}
	return knots;
}
