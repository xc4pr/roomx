import { areaMm2, centroid, wallPoint, walls, type Vec } from '#lib/core/geometry.ts';
import { railingRuns } from '#lib/core/outdoor.ts';
import type { Room } from '#lib/core/schema.ts';

export interface RailingLine {
	a: Vec;
	b: Vec;
}

// Railing stretches in room coordinates, one line per run of an edge.
export function railingLines(rooms: readonly Room[], room: Room): RailingLine[] {
	const sides = walls(room.polygon);
	return railingRuns(rooms, room).flatMap((run) => {
		const side = sides[run.wall - 1];
		return side ? [{ a: wallPoint(side, run.from), b: wallPoint(side, run.to) }] : [];
	});
}

export interface CoverMark {
	label: Vec;
	whole: boolean;
}

// Where the cover label goes: below the room name when the cover spans the whole area, else
// in the middle of the cover.
export function coverMark(room: Pick<Room, 'polygon' | 'cover'>): CoverMark | undefined {
	if (!room.cover) return undefined;
	const whole = areaMm2(room.cover.polygon) >= areaMm2(room.polygon) * 0.9;
	return { label: whole ? centroid(room.polygon) : centroid(room.cover.polygon), whole };
}
