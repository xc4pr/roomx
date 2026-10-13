import { cross, distance, dot, sub, type Vec } from '#lib/core/geometry.ts';

export interface Guide {
	a: Vec;
	b: Vec;
}

export interface SnapResult {
	delta: Vec;
	guides: Guide[];
}

interface EdgeCandidate {
	normal: Vec;
	offset: number;
	moving: Guide;
	other: Guide;
}

const PARALLEL = 0.02;

function edges(polygon: readonly Vec[]): Guide[] {
	return polygon.map((a, i) => ({ a, b: polygon[(i + 1) % polygon.length] }));
}

function unit(v: Vec): Vec | undefined {
	const len = Math.hypot(v.x, v.y);
	return len < 1e-6 ? undefined : { x: v.x / len, y: v.y / len };
}

function canonical(normal: Vec, offset: number): { normal: Vec; offset: number } {
	return normal.x < -1e-9 || (Math.abs(normal.x) <= 1e-9 && normal.y < 0)
		? { normal: { x: -normal.x, y: -normal.y }, offset: -offset }
		: { normal, offset };
}

function edgeCandidates(moving: readonly Vec[], other: readonly Vec[], tolerance: number) {
	const found: EdgeCandidate[] = [];
	for (const m of edges(moving)) {
		const dm = unit(sub(m.b, m.a));
		if (!dm) continue;
		for (const o of edges(other)) {
			const dir = unit(sub(o.b, o.a));
			if (!dir || Math.abs(cross(dm, dir)) > PARALLEL) continue;
			const n = { x: -dm.y, y: dm.x };
			const offset = dot(sub(o.a, m.a), n);
			if (Math.abs(offset) > tolerance) continue;
			const from = Math.max(
				Math.min(dot(m.a, dm), dot(m.b, dm)),
				Math.min(dot(o.a, dm), dot(o.b, dm))
			);
			const to = Math.min(
				Math.max(dot(m.a, dm), dot(m.b, dm)),
				Math.max(dot(o.a, dm), dot(o.b, dm))
			);
			if (to - from < -tolerance) continue;
			const c = canonical(n, offset);
			found.push({ normal: c.normal, offset: c.offset, moving: m, other: o });
		}
	}
	return found;
}

function overlapGuide(c: EdgeCandidate, delta: Vec): Guide | undefined {
	const dir = unit(sub(c.moving.b, c.moving.a));
	if (!dir) return undefined;
	const shift = (p: Vec) => ({ x: p.x + delta.x, y: p.y + delta.y });
	const ma = shift(c.moving.a);
	const mb = shift(c.moving.b);
	const ts = [dot(ma, dir), dot(mb, dir)].sort((p, q) => p - q);
	const os = [dot(c.other.a, dir), dot(c.other.b, dir)].sort((p, q) => p - q);
	const from = Math.max(ts[0], os[0]);
	const to = Math.min(ts[1], os[1]);
	const base = ma;
	const along = dot(base, dir);
	const point = (t: number): Vec => ({
		x: base.x + dir.x * (t - along),
		y: base.y + dir.y * (t - along)
	});
	return to - from >= 0 ? { a: point(from), b: point(to) } : { a: point(to), b: point(from) };
}

export function snapPolygon(
	moving: readonly Vec[],
	others: readonly (readonly Vec[])[],
	tolerance: number
): SnapResult {
	let vertex: { delta: Vec; at: Vec; d: number } | undefined;
	let candidates: EdgeCandidate[] = [];
	for (const other of others) {
		for (const v of moving) {
			for (const w of other) {
				const d = distance(v, w);
				if (d <= tolerance && (!vertex || d < vertex.d)) {
					vertex = { delta: sub(w, v), at: w, d };
				}
			}
		}
		candidates = candidates.concat(edgeCandidates(moving, other, tolerance));
	}
	if (vertex) {
		const edgeGuides = candidates
			.filter((c) => Math.abs(c.offset - dot(vertex.delta, c.normal)) < 0.5)
			.map((c) => overlapGuide(c, vertex.delta))
			.filter((g): g is Guide => g !== undefined);
		return { delta: vertex.delta, guides: [...edgeGuides, { a: vertex.at, b: vertex.at }] };
	}
	if (candidates.length === 0) return { delta: { x: 0, y: 0 }, guides: [] };
	candidates.sort((p, q) => Math.abs(p.offset) - Math.abs(q.offset));
	const first = candidates[0];
	const second = candidates.find((c) => Math.abs(cross(first.normal, c.normal)) > 0.3);
	let delta: Vec;
	if (second) {
		const det = cross(first.normal, second.normal);
		delta = {
			x: (first.offset * second.normal.y - second.offset * first.normal.y) / det,
			y: (second.offset * first.normal.x - first.offset * second.normal.x) / det
		};
	} else {
		delta = { x: first.normal.x * first.offset, y: first.normal.y * first.offset };
	}
	const guides = candidates
		.filter((c) => Math.abs(c.offset - dot(delta, c.normal)) < 0.5)
		.map((c) => overlapGuide(c, delta))
		.filter((g): g is Guide => g !== undefined);
	return { delta, guides };
}
