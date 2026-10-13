import { ShapeUtils, Vector2 } from 'three';
import {
	ceilingHeightAt,
	dot,
	pointInPolygon,
	slopeRun,
	wall,
	type Vec
} from '#lib/core/geometry.ts';
import type { Room } from '#lib/core/schema.ts';

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

interface CreaseLine {
	a: number;
	b: number;
	c: number;
	kind: 'ridge' | 'meeting' | 'wall';
	slopes: number[];
}

const MIN_AREA = 1;
const FLAT_TOLERANCE = 0.5;
const SIDE_TOLERANCE = 1e-6;
const CREASE_TOLERANCE = 0.5;

interface SlopeField {
	index: number;
	tangent: number;
	knee: number;
	run: number;
	startX: number;
	startY: number;
	inwardX: number;
	inwardY: number;
}

function fields(room: Room): SlopeField[] {
	const result: SlopeField[] = [];
	(room.slopes ?? []).forEach((slope, index) => {
		const target = wall(room.polygon, slope.wall);
		if (!target) return;
		result.push({
			index,
			tangent: Math.tan((slope.angle * Math.PI) / 180),
			knee: slope.kneeHeight,
			run: slopeRun(room, slope),
			startX: target.start.x,
			startY: target.start.y,
			inwardX: target.inward.x,
			inwardY: target.inward.y
		});
	});
	return result;
}

function distance(field: SlopeField): { a: number; b: number; c: number } {
	return {
		a: field.inwardX,
		b: field.inwardY,
		c: -(field.inwardX * field.startX + field.inwardY * field.startY)
	};
}

function normalise(line: CreaseLine): CreaseLine | undefined {
	const size = Math.hypot(line.a, line.b);
	if (size < 1e-9) return undefined;
	return { ...line, a: line.a / size, b: line.b / size, c: line.c / size };
}

function creaseLines(items: readonly SlopeField[]): CreaseLine[] {
	const lines: CreaseLine[] = [];
	const push = (line: CreaseLine) => {
		const normalised = normalise(line);
		if (normalised) lines.push(normalised);
	};
	for (const field of items) {
		const d = distance(field);
		push({ ...d, kind: 'wall', slopes: [field.index] });
		push({ ...d, c: d.c - field.run, kind: 'ridge', slopes: [field.index] });
	}
	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			const p = items[i];
			const q = items[j];
			const dp = distance(p);
			const dq = distance(q);
			push({
				a: p.tangent * dp.a - q.tangent * dq.a,
				b: p.tangent * dp.b - q.tangent * dq.b,
				c: p.knee - q.knee + p.tangent * dp.c - q.tangent * dq.c,
				kind: 'meeting',
				slopes: [p.index, q.index]
			});
		}
	}
	return lines;
}

function side(line: CreaseLine, point: Vec): number {
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

function split(polygon: readonly Vec[], line: CreaseLine): [Vec[], Vec[]] {
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

function cells(room: Room, lines: readonly CreaseLine[]): Vec[][] {
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

// Ceiling as a height field: the room polygon is triangulated and cut along every line where the
// ceiling height changes its gradient, so each piece is planar and every vertex sits on ceilingHeightAt.
export function roofSurface(room: Room): RoofSurface {
	const items = fields(room);
	const lines = creaseLines(items);
	const surface: RoofSurface = { flat: [], sloped: [] };
	for (const piece of cells(room, lines)) {
		const oriented = area(piece) < 0 ? [...piece].reverse() : piece;
		const lifted = oriented.map((point) => ({ ...point, h: ceilingHeightAt(room, point) }));
		const flat = lifted.every((point) => Math.abs(point.h - room.height) < FLAT_TOLERANCE);
		for (let i = 1; i < lifted.length - 1; i++) {
			const triangle: RoofTriangle = [lifted[0], lifted[i], lifted[i + 1]];
			(flat ? surface.flat : surface.sloped).push(triangle);
		}
	}
	return surface;
}

function clipToRoom(room: Room, line: CreaseLine, others: readonly CreaseLine[]): [Vec, Vec][] {
	const direction = { x: -line.b, y: line.a };
	const origin = { x: -line.a * line.c, y: -line.b * line.c };
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
			const x = p.x + (q.x - p.x) * t;
			const y = p.y + (q.y - p.y) * t;
			params.push((x - origin.x) * direction.x + (y - origin.y) * direction.y);
		}
	}
	for (const other of others) {
		const denominator = other.a * direction.x + other.b * direction.y;
		if (Math.abs(denominator) < 1e-9) continue;
		params.push(-(other.a * origin.x + other.b * origin.y + other.c) / denominator);
	}
	for (const p of polygon) {
		if (Math.abs(side(line, p)) <= SIDE_TOLERANCE) {
			params.push((p.x - origin.x) * direction.x + (p.y - origin.y) * direction.y);
		}
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

function rawHeight(field: SlopeField, point: Vec): number {
	const d = Math.max(
		0,
		dot(
			{ x: point.x - field.startX, y: point.y - field.startY },
			{
				x: field.inwardX,
				y: field.inwardY
			}
		)
	);
	return field.knee + d * field.tangent;
}

// Visible creases of the roof: where a slope meets the flat ceiling (ridge) or another slope (hip, valley).
export function roofEdges(room: Room): RoofEdge[] {
	const items = fields(room);
	const lines = creaseLines(items).filter((line) => line.kind !== 'wall');
	const byIndex = new Map(items.map((field) => [field.index, field]));
	const edges: RoofEdge[] = [];
	for (const line of lines) {
		const others = lines.filter((other) => other !== line);
		for (const [from, to] of clipToRoom(room, line, others)) {
			const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
			const ceiling = ceilingHeightAt(room, mid);
			const fieldsOfLine = line.slopes.map((index) => byIndex.get(index));
			const onSurface = fieldsOfLine.every(
				(field) => field && Math.abs(rawHeight(field, mid) - ceiling) < CREASE_TOLERANCE
			);
			if (!onSurface) continue;
			if (line.kind === 'meeting' && ceiling > room.height - CREASE_TOLERANCE) continue;
			edges.push({
				from: { ...from, h: ceilingHeightAt(room, from) },
				to: { ...to, h: ceilingHeightAt(room, to) }
			});
		}
	}
	return edges;
}
