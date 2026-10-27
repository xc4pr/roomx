import {
	add,
	dot,
	isOpeningCut,
	pointInPolygon,
	scale,
	slopeContours,
	slopeDormers,
	slopeRun,
	slopeSpan,
	sub,
	wall,
	wallPoint,
	type Vec,
	type Wall
} from '#lib/core/geometry.ts';
import { STANDING_HEIGHT } from '#lib/core/export.ts';
import type { Room, Slope } from '#lib/core/schema.ts';

export type Segment = readonly [Vec, Vec];

type SlopedRoom = Pick<Room, 'polygon' | 'height' | 'slopes'> & { elements?: Room['elements'] };

export interface DormerShape {
	id: string;
	cut: boolean;
	from: number;
	to: number;
	depth: number;
	outline: Segment[];
}

export interface SlopeShape {
	slope: Slope;
	// The slope area of the section, without holes; pieces is the same area minus dormers and cuts.
	zone: Vec[];
	pieces: Vec[][];
	edge: Segment;
	cheeks: Segment[];
	dormers: DormerShape[];
	standing: Segment[];
	full: Segment[];
	run: number;
}

const EPS = 1e-6;

export function clipToHalfPlane(
	polygon: readonly Vec[],
	origin: Vec,
	normal: Vec,
	limit: number
): Vec[] {
	const out: Vec[] = [];
	const n = polygon.length;
	const side = (p: Vec) => dot(sub(p, origin), normal) - limit;
	for (let i = 0; i < n; i++) {
		const a = polygon[i];
		const b = polygon[(i + 1) % n];
		const sa = side(a);
		const sb = side(b);
		if (sa <= EPS) out.push(a);
		if ((sa < -EPS && sb > EPS) || (sa > EPS && sb < -EPS)) {
			const t = sa / (sa - sb);
			out.push(add(a, scale(sub(b, a), t)));
		}
	}
	return out;
}

export function clipSegmentToPolygon(a: Vec, b: Vec, polygon: readonly Vec[]): Segment[] {
	const d = sub(b, a);
	const cuts = [0, 1];
	const n = polygon.length;
	for (let i = 0; i < n; i++) {
		const p = polygon[i];
		const e = sub(polygon[(i + 1) % n], p);
		const denominator = d.x * e.y - d.y * e.x;
		if (Math.abs(denominator) < EPS) continue;
		const w = sub(p, a);
		const t = (w.x * e.y - w.y * e.x) / denominator;
		const s = (w.x * d.y - w.y * d.x) / denominator;
		if (t > 0 && t < 1 && s >= 0 && s <= 1) cuts.push(t);
	}
	cuts.sort((x, y) => x - y);
	const result: Segment[] = [];
	for (let i = 0; i + 1 < cuts.length; i++) {
		const from = cuts[i];
		const to = cuts[i + 1];
		if (to - from < 1e-9) continue;
		const mid = add(a, scale(d, (from + to) / 2));
		if (!pointInPolygon(mid, polygon, 0.5)) continue;
		const segment: Segment = [add(a, scale(d, from)), add(a, scale(d, to))];
		const last = result[result.length - 1];
		if (last && Math.hypot(last[1].x - segment[0].x, last[1].y - segment[0].y) < 1e-6) {
			result[result.length - 1] = [last[0], segment[1]];
		} else {
			result.push(segment);
		}
	}
	return result;
}

function contourSegments(room: SlopedRoom, slope: Slope, clear: number): Segment[] {
	return slopeContours(room, slope, clear).flatMap((line) =>
		clipSegmentToPolygon(line.from, line.to, room.polygon)
	);
}

function clipStrip(
	polygon: readonly Vec[],
	target: Wall,
	along: { from: number; to: number },
	distance: { from: number; to: number }
): Vec[] {
	let clipped = clipToHalfPlane(polygon, target.start, target.inward, distance.to);
	clipped = clipToHalfPlane(clipped, target.start, scale(target.inward, -1), -distance.from);
	clipped = clipToHalfPlane(clipped, target.start, target.direction, along.to);
	return clipToHalfPlane(clipped, target.start, scale(target.direction, -1), -along.from);
}

function tangent(slope: Slope): number {
	return Math.tan((slope.angle * Math.PI) / 180);
}

function dormerDepth(room: SlopedRoom, slope: Slope, height: number, run: number): number {
	if (height <= slope.kneeHeight) return 0;
	return Math.min(run, (Math.min(height, room.height) - slope.kneeHeight) / tangent(slope));
}

export function slopeShape(room: SlopedRoom, slope: Slope): SlopeShape | undefined {
	const target = wall(room.polygon, slope.wall);
	if (!target) return undefined;
	const run = slopeRun(room, slope);
	if (run < 1) return undefined;
	const span = slopeSpan(room, slope);
	const range = span ?? { from: -1e6, to: target.length + 1e6 };
	const zone = clipStrip(room.polygon, target, range, { from: 0, to: run });
	if (zone.length < 3) return undefined;
	const visible = span ?? { from: 0, to: target.length };

	const dormers: DormerShape[] = [];
	for (const dormer of slopeDormers(room, slope)) {
		const from = Math.max(visible.from, dormer.from);
		const to = Math.min(visible.to, dormer.to);
		const depth = dormerDepth(room, slope, dormer.height, run);
		if (to <= from || depth < 1) continue;
		const corners = [wallPoint(target, from), wallPoint(target, from, depth)];
		const far = [wallPoint(target, to, depth), wallPoint(target, to)];
		dormers.push({
			id: dormer.id,
			cut: isOpeningCut(dormer),
			from,
			to,
			depth,
			outline: [
				[corners[0], corners[1]],
				[corners[1], far[0]],
				[far[0], far[1]]
			].flatMap(([a, b]) => clipSegmentToPolygon(a, b, room.polygon))
		});
	}

	const stops = [
		...new Set([visible.from, visible.to, ...dormers.flatMap((d) => [d.from, d.to])])
	].sort((a, b) => a - b);
	const strips: { from: number; to: number; start: number }[] = [];
	for (let i = 0; i + 1 < stops.length; i++) {
		const from = stops[i];
		const to = stops[i + 1];
		const mid = (from + to) / 2;
		const start = Math.max(
			0,
			...dormers.filter((d) => d.from <= mid && d.to >= mid).map((d) => d.depth)
		);
		const last = strips[strips.length - 1];
		if (last && last.start === start && Math.abs(last.to - from) < 1e-6) last.to = to;
		else strips.push({ from, to, start });
	}
	const pieces = strips
		.filter((strip) => strip.start < run - 1e-6)
		.map((strip) => clipStrip(room.polygon, target, strip, { from: strip.start, to: run }))
		.filter((piece) => piece.length >= 3);

	const cheeks: Segment[] = span
		? [span.from, span.to]
				.filter((at, i) => (i === 0 ? at > 1 : at < target.length - 1))
				.flatMap((at) =>
					clipSegmentToPolygon(wallPoint(target, at), wallPoint(target, at, run), room.polygon)
				)
		: [];

	return {
		slope,
		zone,
		pieces,
		edge: [wallPoint(target, visible.from), wallPoint(target, visible.to)],
		cheeks,
		dormers,
		standing: contourSegments(room, slope, STANDING_HEIGHT),
		full: contourSegments(room, slope, room.height),
		run
	};
}

export function slopeShapes(room: SlopedRoom): SlopeShape[] {
	return (room.slopes ?? []).flatMap((slope) => {
		const shape = slopeShape(room, slope);
		return shape ? [shape] : [];
	});
}

export function zonePath(zone: readonly Vec[]): string {
	return zone.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ') + ' Z';
}

export function longestSegment(segments: readonly Segment[]): Segment | undefined {
	let best: Segment | undefined;
	let bestLength = 0;
	for (const segment of segments) {
		const len = Math.hypot(segment[1].x - segment[0].x, segment[1].y - segment[0].y);
		if (len > bestLength) {
			best = segment;
			bestLength = len;
		}
	}
	return best;
}
