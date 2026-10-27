import {
	dot,
	pointOnSegmentDistance,
	roofWindowPlacement,
	slopeAt,
	slopeSpan,
	sub,
	wall,
	wallPoint,
	wallSlopes,
	walls,
	type Vec
} from '#lib/core/geometry.ts';
import type { Room, RoofWindow } from '#lib/core/schema.ts';

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(min, max), Math.max(min, value));
}

type RoofRoom = Pick<Room, 'polygon' | 'height' | 'slopes'>;

export interface RoofOutline {
	corners: Vec[];
	onSlope: boolean;
}

// Floor projection of a roof window. Without a slope under it, a flat stand-in beside the wall.
export function roofWindowOutline(room: RoofRoom, element: RoofWindow): RoofOutline | undefined {
	const placement = roofWindowPlacement(room, element);
	if (placement) return { corners: placement.corners, onSlope: placement.top <= room.height + 1 };
	const target = wall(room.polygon, element.wall);
	if (!target) return undefined;
	const from = element.offset;
	const to = element.offset + element.width;
	const depth = element.length * 0.7;
	return {
		corners: [
			wallPoint(target, from),
			wallPoint(target, to),
			wallPoint(target, to, depth),
			wallPoint(target, from, depth)
		],
		onSlope: false
	};
}

export function slopedWalls(room: Pick<Room, 'polygon' | 'slopes'>) {
	return walls(room.polygon).filter((side) => wallSlopes(room, side.number).length > 0);
}

// The sloped wall nearest to the point, and the position along it that lies on a slope section.
export function pickSlopeWall(
	room: Pick<Room, 'polygon' | 'slopes'>,
	point: Vec
): { wall: number; along: number } | undefined {
	let best: { wall: number; along: number; distance: number } | undefined;
	for (const side of slopedWalls(room)) {
		const along = clamp(dot(sub(point, side.start), side.direction), 0, side.length);
		const distance = pointOnSegmentDistance(point, side.start, side.end);
		if (!best || distance < best.distance) best = { wall: side.number, along, distance };
	}
	if (!best) return undefined;
	if (slopeAt(room, best.wall, best.along)) return { wall: best.wall, along: best.along };
	const range = nearestSection(room, best.wall, best.along);
	return { wall: best.wall, along: clamp(best.along, range.from, range.to) };
}

function nearestSection(
	room: Pick<Room, 'polygon' | 'slopes'>,
	wallNumber: number,
	along: number
): { from: number; to: number } {
	const length = wall(room.polygon, wallNumber)?.length ?? 0;
	const ranges = wallSlopes(room, wallNumber).map(
		(slope) => slopeSpan(room, slope) ?? { from: 0, to: length }
	);
	const gap = (r: { from: number; to: number }) => Math.max(r.from - along, along - r.to, 0);
	return ranges.reduce(
		(best, range) => (gap(range) < gap(best) ? range : best),
		ranges[0] ?? {
			from: 0,
			to: length
		}
	);
}

// Keeps the window inside the slope section its middle lies in (as far as it fits).
export function clampRoofOffset(
	room: Pick<Room, 'polygon' | 'slopes'>,
	wallNumber: number,
	offset: number,
	width: number
): number {
	const target = wall(room.polygon, wallNumber);
	if (!target) return offset;
	const length = target.length;
	const range = nearestSection(room, wallNumber, offset + width / 2);
	const from = range.to - range.from >= width ? range.from : 0;
	const to = range.to - range.from >= width ? range.to : length;
	return Math.round(clamp(offset, from, Math.max(from, to - width)));
}
