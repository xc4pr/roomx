import { Group } from 'three';
import {
	SPIRAL_NEWEL,
	stairwellRailing,
	type Segment,
	type StairContext
} from '#lib/core/floors.ts';
import { centroid, distance, type Vec } from '#lib/core/geometry.ts';
import { MM } from '../coords.ts';
import { PALETTE, type MaterialSet, type MaterialSpec } from '../room/materials.ts';
import { attachParts, Soup, type BakedPart, type Ground, type Point3 } from './soup.ts';

const BODY: MaterialSpec = { color: PALETTE.builtin, roughness: 0.9 };
const TREAD: MaterialSpec = { color: PALETTE.door, roughness: 0.8 };
const RAIL: MaterialSpec = { color: PALETTE.railing, roughness: 0.5, metalness: 0.4 };
const NEWEL: MaterialSpec = { color: PALETTE.alu, roughness: 0.5, metalness: 0.3 };

const TREAD_PLATE = 30;
const SPIRAL_PLATE = 60;
// The newel ends just below the upper floor, whose surface it would otherwise share.
const NEWEL_GAP = 3;
const HANDRAIL = 900;
const GUARD = 1000;
const POST_HALF = 0.015;
const BAR_HALF = 0.015;
const POST_SPACING = 1000;
const EDGE_TOLERANCE = 2;
const CACHE_SIZE = 12;

const cache = new Map<string, BakedPart[]>();

const ground = (p: Vec): Ground => ({ x: p.x * MM, z: -p.y * MM });
const point = (p: Vec, heightMm: number): Point3 => [p.x * MM, heightMm * MM, -p.y * MM];

function sameEdge(a: Segment, b: Segment): boolean {
	return (
		(distance(a.from, b.to) < EDGE_TOLERANCE && distance(a.to, b.from) < EDGE_TOLERANCE) ||
		(distance(a.from, b.from) < EDGE_TOLERANCE && distance(a.to, b.to) < EDGE_TOLERANCE)
	);
}

function buildSolid(soup: Soup, context: StairContext, level: number): void {
	const { risers, arrival } = context.layout;
	const treads = context.layout.treads;
	const arrivalEdge: Segment = arrival;
	const foot: Vec = { x: context.stair.x, y: context.stair.y };
	treads.forEach((tread) => {
		const outline = tread.polygon.map(ground);
		soup.prism(BODY, outline, level * MM, (level + tread.height - TREAD_PLATE) * MM, false);
		soup.prism(
			TREAD,
			outline,
			(level + tread.height - TREAD_PLATE) * MM,
			(level + tread.height) * MM
		);
	});
	const edges = treads.flatMap((tread, index) =>
		tread.polygon.map((from, i) => ({
			index,
			segment: { from, to: tread.polygon[(i + 1) % tread.polygon.length] }
		}))
	);
	for (const { index, segment } of edges) {
		const shared = edges.some(
			(other) =>
				other.index !== index &&
				distance(segment.from, other.segment.to) < EDGE_TOLERANCE &&
				distance(segment.to, other.segment.from) < EDGE_TOLERANCE
		);
		if (shared || sameEdge(segment, arrivalEdge)) continue;
		const middle = {
			x: (segment.from.x + segment.to.x) / 2,
			y: (segment.from.y + segment.to.y) / 2
		};
		if (distance(middle, foot) < EDGE_TOLERANCE) continue;
		const tread = treads[index];
		const before = index > 0 ? centroid(treads[index - 1].polygon) : foot;
		const frontFirst = distance(segment.from, before) <= distance(segment.to, before);
		const [front, back] = frontFirst ? [segment.from, segment.to] : [segment.to, segment.from];
		const rise = tread.landing ? 0 : risers.riser;
		rail(soup, front, back, level + tread.height, level + tread.height + rise);
	}
}

function rail(soup: Soup, a: Vec, b: Vec, heightA: number, heightB: number): void {
	soup.post(RAIL, ground(a), heightA * MM, (heightA + HANDRAIL) * MM, POST_HALF);
	soup.post(RAIL, ground(b), heightA * MM, (heightB + HANDRAIL) * MM, POST_HALF);
	soup.bar(RAIL, point(a, heightA + HANDRAIL), point(b, heightB + HANDRAIL), BAR_HALF);
}

function buildSpiral(soup: Soup, context: StairContext, level: number): void {
	const { stair, layout } = context;
	const centre: Vec = { x: stair.x, y: stair.y };
	const outer = SPIRAL_NEWEL + stair.width;
	const spin = stair.turn === 'left' ? 1 : -1;
	soup.cylinder(
		NEWEL,
		ground(centre),
		(SPIRAL_NEWEL - 20) * MM,
		level * MM,
		(level + context.height - NEWEL_GAP) * MM,
		16
	);
	for (const tread of layout.treads) {
		const outline = tread.polygon.map(ground);
		soup.prism(
			TREAD,
			outline,
			(level + tread.height - SPIRAL_PLATE) * MM,
			(level + tread.height) * MM
		);
		const angle = (p: Vec) => Math.atan2(p.y - centre.y, p.x - centre.x);
		const edge = tread.polygon.filter(
			(p) => Math.abs(distance(p, centre) - outer) < EDGE_TOLERANCE
		);
		if (edge.length < 2) continue;
		const reference = angle(edge[0]);
		const turn = (p: Vec) => {
			let delta = angle(p) - reference;
			while (delta > Math.PI) delta -= 2 * Math.PI;
			while (delta < -Math.PI) delta += 2 * Math.PI;
			return delta * spin;
		};
		const arc = [...edge].sort((p, q) => turn(p) - turn(q));
		const heights = arc.map(
			(_, k) => level + tread.height + (layout.risers.riser * k) / (arc.length - 1)
		);
		soup.post(
			RAIL,
			ground(arc[0]),
			(level + tread.height) * MM,
			(heights[0] + HANDRAIL) * MM,
			POST_HALF
		);
		for (let k = 0; k + 1 < arc.length; k++) {
			soup.bar(
				RAIL,
				point(arc[k], heights[k] + HANDRAIL),
				point(arc[k + 1], heights[k + 1] + HANDRAIL),
				BAR_HALF
			);
		}
	}
}

function bakeStair(context: StairContext, level: number): BakedPart[] {
	const key = JSON.stringify([context.stair, context.height, level]);
	const cached = cache.get(key);
	if (cached) return cached;
	const soup = new Soup();
	if (context.stair.shape === 'spiral') buildSpiral(soup, context, level);
	else buildSolid(soup, context, level);
	const parts = soup.bake();
	if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value as string);
	cache.set(key, parts);
	return parts;
}

export function stairTriangles(context: StairContext): number {
	const soup = new Soup();
	if (context.stair.shape === 'spiral') buildSpiral(soup, context, 0);
	else buildSolid(soup, context, 0);
	return soup.triangleCount;
}

export function buildStair(context: StairContext, level: number, materials: MaterialSet): Group {
	const group = new Group();
	group.name = `stair-${context.stair.id}`;
	group.userData.stairId = context.stair.id;
	attachParts(group, bakeStair(context, level), materials, 'stair');
	return group;
}

// Guard rail around the stairwell on the upper floor.
export function buildStairwellRailing(
	context: StairContext,
	upperLevel: number,
	materials: MaterialSet
): Group {
	const group = new Group();
	group.name = `stairwell-${context.stair.id}`;
	const soup = new Soup();
	const base = upperLevel;
	for (const segment of stairwellRailing(context)) {
		const length = distance(segment.from, segment.to);
		if (length < 1) continue;
		const count = Math.max(1, Math.ceil(length / POST_SPACING));
		for (let i = 0; i <= count; i++) {
			const t = i / count;
			const at = {
				x: segment.from.x + (segment.to.x - segment.from.x) * t,
				y: segment.from.y + (segment.to.y - segment.from.y) * t
			};
			soup.post(RAIL, ground(at), base * MM, (base + GUARD) * MM, POST_HALF);
		}
		for (const height of [GUARD, GUARD * 0.55, 120]) {
			soup.bar(
				RAIL,
				point(segment.from, base + height),
				point(segment.to, base + height),
				BAR_HALF / 2
			);
		}
	}
	attachParts(group, soup.bake(), materials, 'stairwellRailing');
	return group;
}
