import {
	dot,
	slopeHeightAt,
	slopeRun,
	wall,
	wallHeightAt,
	wallPoint,
	type Wall
} from '#lib/core/geometry.ts';
import type { Room, Slope } from '#lib/core/schema.ts';

type SlopedRoom = Pick<Room, 'polygon' | 'height' | 'slopes'>;

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
		for (const level of [0, slopeRun(room, slope)]) {
			found.push((level - start) / rate);
		}
	}
	return found;
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
	const base = [0, length, ...kinks(room, target).filter((a) => a > EPS && a < length - EPS)].sort(
		(a, b) => a - b
	);
	const stops = [...base];
	for (let i = 0; i + 1 < base.length; i++)
		stops.push(...crossings(room, target, base[i], base[i + 1]));
	stops.sort((a, b) => a - b);
	const points: ProfilePoint[] = [];
	for (const along of stops) {
		if (points.length > 0 && along - points[points.length - 1].along < 0.5) continue;
		points.push({ along, height: wallHeightAt(room, wallNumber, along) });
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

export function clampToProfile(
	room: SlopedRoom,
	wallNumber: number,
	offset: number,
	width: number,
	elevation: number,
	height: number
): number {
	const limit = spanLimit(room, wallNumber, offset, width);
	return Math.max(0, Math.min(elevation, Math.round(limit) - height));
}
