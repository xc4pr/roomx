import {
	add,
	dot,
	pointInPolygon,
	scale,
	slopeContour,
	slopeRun,
	sub,
	wall,
	wallPoint,
	type Vec
} from '#lib/core/geometry.ts';
import { STANDING_HEIGHT } from '#lib/core/export.ts';
import type { Room, Slope } from '#lib/core/schema.ts';

export type Segment = readonly [Vec, Vec];

type SlopedRoom = Pick<Room, 'polygon' | 'height' | 'slopes'>;

export interface SlopeShape {
	slope: Slope;
	zone: Vec[];
	edge: Segment;
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
	const line = slopeContour(room, slope, clear);
	return line ? clipSegmentToPolygon(line.from, line.to, room.polygon) : [];
}

export function slopeShape(room: SlopedRoom, slope: Slope): SlopeShape | undefined {
	const target = wall(room.polygon, slope.wall);
	if (!target) return undefined;
	const run = slopeRun(room, slope);
	if (run < 1) return undefined;
	const zone = clipToHalfPlane(room.polygon, target.start, target.inward, run);
	if (zone.length < 3) return undefined;
	return {
		slope,
		zone,
		edge: [wallPoint(target, 0), wallPoint(target, target.length)],
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
