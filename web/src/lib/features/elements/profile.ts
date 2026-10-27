import {
	dot,
	slopeDormers,
	slopeHeightAt,
	slopeRun,
	slopeSpan,
	wall,
	wallHeightAt,
	wallPoint,
	type Wall
} from '#lib/core/geometry.ts';
import type { Room, Slope } from '#lib/core/schema.ts';

type SlopedRoom = Pick<Room, 'polygon' | 'height' | 'slopes'> & { elements?: Room['elements'] };

export interface ProfilePoint {
	along: number;
	height: number;
}

export interface ProfileSegment {
	from: ProfilePoint;
	to: ProfilePoint;
	slope: Slope | undefined;
}

const EPS = 1e-6;

function kinks(room: SlopedRoom, target: Wall): number[] {
	const found: number[] = [];
	for (const slope of room.slopes ?? []) {
		const source = wall(room.polygon, slope.wall);
		if (!source) continue;
		const inward = source.inward;
		const rate = dot(target.direction, inward);
		if (Math.abs(rate) < EPS) continue;
		const start = dot(
			{ x: target.start.x - source.start.x, y: target.start.y - source.start.y },
			inward
		);
		const tangent = Math.tan((slope.angle * Math.PI) / 180);
		const levels = [0, slopeRun(room, slope)];
		for (const dormer of slopeDormers(room, slope)) {
			const top = Math.min(room.height, dormer.height);
			if (top > slope.kneeHeight) levels.push((top - slope.kneeHeight) / tangent);
		}
		for (const level of levels) found.push((level - start) / rate);
	}
	return found;
}

// Places on the wall itself where the ceiling height jumps: ends of any slope section and the
// sides of any dormer or cut, also those of other walls' slopes, where their lines cross this wall.
function jumps(room: SlopedRoom, target: Wall): number[] {
	const found: number[] = [];
	for (const slope of room.slopes ?? []) {
		const source = wall(room.polygon, slope.wall);
		if (!source) continue;
		const rate = dot(target.direction, source.direction);
		if (Math.abs(rate) < EPS) continue;
		const start = dot(
			{ x: target.start.x - source.start.x, y: target.start.y - source.start.y },
			source.direction
		);
		const bounds: number[] = [];
		const span = slopeSpan(room, slope);
		if (span) bounds.push(span.from, span.to);
		for (const dormer of slopeDormers(room, slope)) bounds.push(dormer.from, dormer.to);
		for (const bound of bounds) found.push((bound - start) / rate);
	}
	return found.filter((along) => along > EPS && along < target.length - EPS);
}

function crossings(room: SlopedRoom, target: Wall, from: number, to: number): number[] {
	const slopes = room.slopes ?? [];
	const at = (slope: Slope, along: number) => slopeHeightAt(room, slope, wallPoint(target, along));
	const found: number[] = [];
	for (let i = 0; i < slopes.length; i++) {
		for (let j = i + 1; j < slopes.length; j++) {
			const a0 = at(slopes[i], from) - at(slopes[j], from);
			const a1 = at(slopes[i], to) - at(slopes[j], to);
			if (a0 * a1 < 0) found.push(from + ((to - from) * a0) / (a0 - a1));
		}
	}
	return found;
}

export function wallProfile(room: SlopedRoom, wallNumber: number): ProfilePoint[] {
	const target = wall(room.polygon, wallNumber);
	if (!target) return [];
	const length = target.length;
	if (!room.slopes || room.slopes.length === 0) {
		return [
			{ along: 0, height: room.height },
			{ along: length, height: room.height }
		];
	}
	const edges = jumps(room, target);
	const base = [
		0,
		length,
		...kinks(room, target).filter((a) => a > EPS && a < length - EPS),
		...edges
	].sort((a, b) => a - b);
	const stops = [...base];
	for (let i = 0; i + 1 < base.length; i++)
		stops.push(...crossings(room, target, base[i], base[i + 1]));
	stops.sort((a, b) => a - b);
	const isEdge = (along: number) => edges.some((edge) => Math.abs(edge - along) < 0.5);
	const points: ProfilePoint[] = [];
	for (const along of stops) {
		const last = points[points.length - 1];
		if (last && along - last.along < 0.5) continue;
		if (isEdge(along)) {
			points.push(
				{ along, height: wallHeightAt(room, wallNumber, along - 0.5) },
				{ along, height: wallHeightAt(room, wallNumber, along + 0.5) }
			);
		} else points.push({ along, height: wallHeightAt(room, wallNumber, along) });
	}
	points[points.length - 1] = { along: length, height: wallHeightAt(room, wallNumber, length) };
	const simplified: ProfilePoint[] = [points[0]];
	for (let i = 1; i < points.length - 1; i++) {
		const a = simplified[simplified.length - 1];
		const b = points[i];
		const c = points[i + 1];
		const expected = a.height + ((b.along - a.along) * (c.height - a.height)) / (c.along - a.along);
		if (Math.abs(expected - b.height) > 0.5) simplified.push(b);
	}
	simplified.push(points[points.length - 1]);
	return simplified;
}

export function isFlatProfile(points: readonly ProfilePoint[], height: number): boolean {
	return points.every((point) => Math.abs(point.height - height) < 0.5);
}

export function profileSegments(room: SlopedRoom, wallNumber: number): ProfileSegment[] {
	const points = wallProfile(room, wallNumber);
	const result: ProfileSegment[] = [];
	for (let i = 0; i + 1 < points.length; i++) {
		const from = points[i];
		const to = points[i + 1];
		if (Math.abs(to.height - from.height) < 0.5) continue;
		const mid = (from.along + to.along) / 2;
		const target = wall(room.polygon, wallNumber);
		if (!target) continue;
		let best: Slope | undefined;
		let bestHeight = Infinity;
		for (const slope of room.slopes ?? []) {
			const h = slopeHeightAt(room, slope, wallPoint(target, mid));
			if (h < bestHeight) {
				bestHeight = h;
				best = slope;
			}
		}
		result.push({ from, to, slope: best });
	}
	return result;
}

export function spanLimit(
	room: SlopedRoom,
	wallNumber: number,
	offset: number,
	width: number
): number {
	return Math.min(
		wallHeightAt(room, wallNumber, offset),
		wallHeightAt(room, wallNumber, offset + width)
	);
}

// Height limit for an opening that is being moved. A door or window that is taller than the wall
// surface at its new place carries its own cut in the slope, so it may rise up to the room height.
export function movingLimit(
	room: SlopedRoom,
	wallNumber: number,
	element: { id: string; elevation: number; height: number },
	offset: number,
	width: number
): number {
	const without = {
		...room,
		elements: (room.elements ?? []).filter((other) => other.id !== element.id)
	};
	const base = spanLimit(without, wallNumber, offset, width);
	const hasSlope = (room.slopes ?? []).some((slope) => slope.wall === wallNumber);
	return hasSlope && element.elevation + element.height > base + 0.5 ? room.height : base;
}

export function clampToProfile(
	room: SlopedRoom,
	wallNumber: number,
	offset: number,
	width: number,
	elevation: number,
	height: number,
	moving?: { id: string; elevation: number; height: number }
): number {
	const limit = moving
		? movingLimit(room, wallNumber, moving, offset, width)
		: spanLimit(room, wallNumber, offset, width);
	return Math.max(0, Math.min(elevation, Math.round(limit) - height));
}
