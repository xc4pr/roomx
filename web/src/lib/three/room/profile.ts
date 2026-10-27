import { ceilingHeightAt, wall } from '#lib/core/geometry.ts';
import type { Room } from '#lib/core/schema.ts';
import type { WallFrame } from './frames.ts';
import { wallLineKnots } from './roof.ts';

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

// At a step the profile has two points with the same u: "left" gives the height before it,
// "right" the height after it.
export function profileTop(
	profile: readonly ProfilePoint[],
	u: number,
	from: 'left' | 'right' = 'left'
): number {
	const first = profile[0];
	const last = profile[profile.length - 1];
	if (u <= first.u)
		return from === 'right' ? (profile.findLast((p) => p.u <= first.u)?.h ?? first.h) : first.h;
	if (u >= last.u)
		return from === 'left' ? (profile.find((p) => p.u >= last.u)?.h ?? last.h) : last.h;
	for (let i = 1; i < profile.length; i++) {
		const b = profile[i];
		if (u < b.u || (u === b.u && from === 'left')) {
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

const INSIDE = 1e-4;

// Wall top in mm along the wall, sampled just inside the room. It is straight between the points
// where the ceiling bends and jumps at a step (two points with the same u), so dormers and cuts
// above openings are never interpolated across.
export function wallProfile(room: Room, frame: WallFrame): ProfilePoint[] {
	if (!room.slopes || room.slopes.length === 0) return flatProfile(frame.length, room.height);
	const us = [0, ...wallLineKnots(room, frame.number).sort((a, b) => a - b), frame.length];
	const unique = us.filter((u, index) => index === 0 || u - us[index - 1] > 0.01);
	const heightAt = (u: number) =>
		ceilingHeightAt(room, {
			x: frame.start.x + frame.direction.x * u + frame.inward.x * INSIDE,
			y: frame.start.y + frame.direction.y * u + frame.inward.y * INSIDE
		});
	const points: ProfilePoint[] = [];
	for (let i = 1; i < unique.length; i++) {
		const from = unique[i - 1];
		const to = unique[i];
		const reach = Math.min(1e-4, (to - from) / 4);
		points.push({ u: from, h: heightAt(from + reach) }, { u: to, h: heightAt(to - reach) });
	}
	const result: ProfilePoint[] = [];
	for (const point of points) {
		const last = result[result.length - 1];
		if (
			last &&
			Math.abs(last.u - point.u) < EPS &&
			Math.abs(last.h - point.h) < COLLINEAR_TOLERANCE
		)
			continue;
		while (result.length >= 2) {
			const a = result[result.length - 2];
			const b = result[result.length - 1];
			if (b.u - a.u < EPS || point.u - b.u < EPS) break;
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
