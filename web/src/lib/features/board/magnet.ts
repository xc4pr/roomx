import { WALL_THICKNESS } from '#lib/core/defaults.ts';
import { MIN_LINK_LENGTH } from '#lib/core/adjacency.ts';
import { cross, dot, sub, type Vec } from '#lib/core/geometry.ts';

export const MAGNET_MIN_RANGE = 300;
export const MAGNET_SCREEN_RANGE = 28;
export const MAGNET_RELEASE = 2;
export const SLIDE_TAU = 70;

const PARALLEL = 0.01;
const PERPENDICULAR = 0.3;

export interface MagnetNeighbour {
	id: string;
	polygon: readonly Vec[];
}

export type ContactKind = 'wall' | 'flush';

export interface MagnetContact {
	key: string;
	kind: ContactKind;
	otherId: string;
	a: Vec;
	b: Vec;
	normal: Vec;
}

export interface MagnetResult {
	delta: Vec;
	kind: 'none' | 'edge' | 'corner';
	contacts: MagnetContact[];
	held: string[];
}

export interface MagnetOptions {
	range: number;
	held?: readonly string[];
	release?: number;
}

interface Edge {
	index: number;
	a: Vec;
	b: Vec;
	direction: Vec;
	outward: Vec;
	length: number;
}

interface Candidate {
	key: string;
	kind: ContactKind;
	otherId: string;
	moving: Edge;
	other: Edge;
	normal: Vec;
	shift: number;
	overlap: number;
	held: boolean;
}

export function magnetRange(pxPerMm: number): number {
	return Math.max(MAGNET_MIN_RANGE, MAGNET_SCREEN_RANGE / Math.max(pxPerMm, 1e-6));
}

export function slideDecay(offset: Vec, seconds: number): Vec {
	const factor = Math.exp(-(seconds * 1000) / SLIDE_TAU);
	const next = { x: offset.x * factor, y: offset.y * factor };
	return Math.hypot(next.x, next.y) < 0.5 ? { x: 0, y: 0 } : next;
}

function edgesOf(polygon: readonly Vec[]): Edge[] {
	const result: Edge[] = [];
	polygon.forEach((a, index) => {
		const b = polygon[(index + 1) % polygon.length];
		const length = Math.hypot(b.x - a.x, b.y - a.y);
		if (length < 1e-6) return;
		const direction = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
		result.push({ index, a, b, direction, outward: { x: direction.y, y: -direction.x }, length });
	});
	return result;
}

function extent(edge: Edge, direction: Vec): [number, number] {
	const p = dot(edge.a, direction);
	const q = dot(edge.b, direction);
	return p < q ? [p, q] : [q, p];
}

function overlapOf(m: Edge, o: Edge, direction: Vec): number {
	const [m0, m1] = extent(m, direction);
	const [o0, o1] = extent(o, direction);
	return Math.min(m1, o1) - Math.max(m0, o0);
}

// A wall contact wants the moving wall exactly one wall thickness in front of the other room's wall,
// facing it. A flush contact wants two walls facing the same way on one line, so the rooms end level.
function candidatesFor(
	moving: readonly Vec[],
	neighbour: MagnetNeighbour,
	kind: ContactKind,
	range: number,
	release: number,
	held: ReadonlySet<string>
): Candidate[] {
	const found: Candidate[] = [];
	const movingEdges = edgesOf(moving);
	for (const o of edgesOf(neighbour.polygon)) {
		for (const m of movingEdges) {
			if (Math.abs(cross(m.direction, o.direction)) > PARALLEL) continue;
			const facing = dot(m.direction, o.direction) < 0;
			if (facing !== (kind === 'wall')) continue;
			const gap = kind === 'wall' ? WALL_THICKNESS : 0;
			const shift = gap - dot(sub(m.a, o.a), o.outward);
			const key = `${kind}:${neighbour.id}:${m.index}:${o.index}`;
			const isHeld = held.has(key);
			if (Math.abs(shift) > (isHeld ? release : range)) continue;
			const overlap = overlapOf(m, o, o.direction);
			if (kind === 'wall' && overlap < (isHeld ? 1 : MIN_LINK_LENGTH)) continue;
			found.push({
				key,
				kind,
				otherId: neighbour.id,
				moving: m,
				other: o,
				normal: o.outward,
				shift,
				overlap,
				held: isHeld
			});
		}
	}
	return found;
}

function byPriority(a: Candidate, b: Candidate): number {
	if (a.held !== b.held) return a.held ? -1 : 1;
	return Math.abs(a.shift) - Math.abs(b.shift);
}

function contactOf(candidate: Candidate, delta: Vec): MagnetContact {
	const { moving, other, kind } = candidate;
	const direction = other.direction;
	const place = (p: Vec): Vec => ({ x: p.x + delta.x, y: p.y + delta.y });
	const ma = place(moving.a);
	const mb = place(moving.b);
	const [m0, m1] = extent({ ...moving, a: ma, b: mb }, direction);
	const [o0, o1] = extent(other, direction);
	const base = ma;
	const along = dot(base, direction);
	const at = (t: number): Vec => ({
		x: base.x + direction.x * (t - along),
		y: base.y + direction.y * (t - along)
	});
	if (kind === 'wall') {
		return {
			key: candidate.key,
			kind,
			otherId: candidate.otherId,
			a: at(Math.max(m0, o0)),
			b: at(Math.min(m1, o1)),
			normal: moving.outward
		};
	}
	return {
		key: candidate.key,
		kind,
		otherId: candidate.otherId,
		a: at(Math.min(m0, o0)),
		b: at(Math.max(m1, o1)),
		normal: moving.outward
	};
}

export function magnetSnap(
	moving: readonly Vec[],
	neighbours: readonly MagnetNeighbour[],
	options: MagnetOptions
): MagnetResult {
	const range = options.range;
	const release = range * (options.release ?? MAGNET_RELEASE);
	const held = new Set(options.held ?? []);
	const none: MagnetResult = { delta: { x: 0, y: 0 }, kind: 'none', contacts: [], held: [] };

	const walls = neighbours
		.flatMap((neighbour) => candidatesFor(moving, neighbour, 'wall', range, release, held))
		.sort(byPriority);
	const first = walls[0];
	if (!first) return none;

	const second = walls.find(
		(candidate) => Math.abs(cross(first.normal, candidate.normal)) > PERPENDICULAR
	);

	let delta: Vec;
	const used: Candidate[] = [first];
	if (second) {
		const det = cross(first.normal, second.normal);
		delta = {
			x: (first.shift * second.normal.y - second.shift * first.normal.y) / det,
			y: (second.shift * first.normal.x - first.shift * second.normal.x) / det
		};
		used.push(second);
	} else {
		delta = { x: first.normal.x * first.shift, y: first.normal.y * first.shift };
	}

	if (!second) {
		const docked = new Set(used.map((candidate) => candidate.otherId));
		const tangent = { x: first.other.direction.x, y: first.other.direction.y };
		const shifted = moving.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }));
		const flush = neighbours
			.filter((neighbour) => docked.has(neighbour.id))
			.flatMap((neighbour) => candidatesFor(shifted, neighbour, 'flush', range, release, held))
			.filter((candidate) => Math.abs(dot(candidate.normal, tangent)) > 1 - PERPENDICULAR)
			.sort(byPriority)[0];
		if (flush) {
			const along = flush.shift / dot(tangent, flush.normal);
			delta = { x: delta.x + tangent.x * along, y: delta.y + tangent.y * along };
			used.push(flush);
		}
	}

	const contacts = used.map((candidate) => contactOf(candidate, delta));
	return {
		delta,
		kind: used.length > 1 ? 'corner' : 'edge',
		contacts,
		held: used.map((candidate) => candidate.key)
	};
}
