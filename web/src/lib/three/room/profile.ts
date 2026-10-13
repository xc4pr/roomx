import { dot, slopeRun, wall, wallHeightAt, type Vec } from '#lib/core/geometry.ts';
import type { Room, Slope } from '#lib/core/schema.ts';
import type { WallFrame } from './frames.ts';

export interface ProfilePoint {
	u: number;
	h: number;
}

const EPS = 1e-9;
const COLLINEAR_TOLERANCE = 0.01;

export function flatProfile(length: number, height: number): ProfilePoint[] {
	return [
		{ u: 0, h: height },
		{ u: length, h: height }
	];
}

export function profileTop(profile: readonly ProfilePoint[], u: number): number {
	const first = profile[0];
	const last = profile[profile.length - 1];
	if (u <= first.u) return first.h;
	if (u >= last.u) return last.h;
	for (let i = 1; i < profile.length; i++) {
		const b = profile[i];
		if (u <= b.u) {
			const a = profile[i - 1];
			const span = b.u - a.u;
			return span < EPS ? b.h : a.h + ((b.h - a.h) * (u - a.u)) / span;
		}
	}
	return last.h;
}

export function profileMax(profile: readonly ProfilePoint[]): number {
	return Math.max(...profile.map((point) => point.h));
}

interface Ramp {
	slope: Slope;
	tangent: number;
	run: number;
	d0: number;
	d1: number;
}

function ramps(room: Room, frame: WallFrame): Ramp[] {
	const result: Ramp[] = [];
	for (const slope of room.slopes ?? []) {
		const target = wall(room.polygon, slope.wall);
		if (!target) continue;
		const origin: Vec = frame.start;
		result.push({
			slope,
			tangent: Math.tan((slope.angle * Math.PI) / 180),
			run: slopeRun(room, slope),
			d0: dot({ x: origin.x - target.start.x, y: origin.y - target.start.y }, target.inward),
			d1: dot(frame.direction, target.inward)
		});
	}
	return result;
}

function knots(items: readonly Ramp[], length: number): number[] {
	const found: number[] = [];
	const add = (u: number) => {
		if (Number.isFinite(u) && u > 0.01 && u < length - 0.01) found.push(u);
	};
	for (const ramp of items) {
		if (Math.abs(ramp.d1) < EPS) continue;
		add(-ramp.d0 / ramp.d1);
		add((ramp.run - ramp.d0) / ramp.d1);
	}
	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			const a = items[i];
			const b = items[j];
			const slopeDelta = a.tangent * a.d1 - b.tangent * b.d1;
			if (Math.abs(slopeDelta) < EPS) continue;
			const rhs = b.slope.kneeHeight - a.slope.kneeHeight - a.tangent * a.d0 + b.tangent * b.d0;
			add(rhs / slopeDelta);
		}
	}
	return found;
}

// Wall top in mm along the wall: straight between the wall ends and every point where a slope reaches
// the full room height or two slopes meet, so each piece of the profile is a single straight line.
export function wallProfile(room: Room, frame: WallFrame): ProfilePoint[] {
	if (!room.slopes || room.slopes.length === 0) return flatProfile(frame.length, room.height);
	const items = ramps(room, frame);
	const us = [0, ...knots(items, frame.length).sort((a, b) => a - b), frame.length];
	const points = us
		.filter((u, index) => index === 0 || u - us[index - 1] > 0.01)
		.map((u) => ({ u, h: wallHeightAt(room, frame.number, u) }));
	const result: ProfilePoint[] = [];
	for (const point of points) {
		while (result.length >= 2) {
			const a = result[result.length - 2];
			const b = result[result.length - 1];
			const expected = a.h + ((point.h - a.h) * (b.u - a.u)) / (point.u - a.u);
			if (Math.abs(expected - b.h) > COLLINEAR_TOLERANCE) break;
			result.pop();
		}
		result.push(point);
	}
	return result;
}

export function roomHasSlopes(room: Pick<Room, 'slopes' | 'polygon'>): boolean {
	return (room.slopes ?? []).some((slope) => wall(room.polygon, slope.wall) !== undefined);
}
