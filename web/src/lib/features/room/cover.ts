import { dot, sub, walls } from '#lib/core/geometry.ts';
import { stripCover, wholeCover } from '#lib/core/outdoor.ts';
import type { Cover, Room } from '#lib/core/schema.ts';

export const DEFAULT_COVER_HEIGHT = 2400;
export const DEFAULT_STRIP_DEPTH = 1500;
export const MIN_STRIP_DEPTH = 300;

export type CoverShape =
	| { mode: 'none' }
	| { mode: 'whole' }
	| { mode: 'strip'; wall: number; depth: number }
	| { mode: 'custom' };

type Outline = Pick<Room, 'polygon'>;

const TOLERANCE = 2;

function samePolygon(a: Cover['polygon'], b: Cover['polygon']): boolean {
	return (
		a.length === b.length &&
		a.every((p, i) => Math.abs(p.x - b[i].x) <= TOLERANCE && Math.abs(p.y - b[i].y) <= TOLERANCE)
	);
}

// How far the outline reaches inward from one wall: the most a strip along it can be deep.
export function stripReach(room: Outline, wallNumber: number): number {
	const side = walls(room.polygon)[wallNumber - 1];
	if (!side) return 0;
	return Math.round(Math.max(...room.polygon.map((p) => dot(sub(p, side.start), side.inward))));
}

export function inferCover(room: Outline & Pick<Room, 'cover'>): CoverShape {
	const cover = room.cover;
	if (!cover) return { mode: 'none' };
	if (samePolygon(cover.polygon, room.polygon)) return { mode: 'whole' };
	for (const side of walls(room.polygon)) {
		const depth = Math.round(
			Math.max(...cover.polygon.map((p) => dot(sub(p, side.start), side.inward)))
		);
		const candidate = stripCover(room, side.number, depth, cover.height);
		if (candidate && samePolygon(candidate.polygon, cover.polygon)) {
			return { mode: 'strip', wall: side.number, depth };
		}
	}
	return { mode: 'custom' };
}

export function buildCover(room: Outline, shape: CoverShape, height: number): Cover | undefined {
	if (shape.mode === 'whole') return wholeCover(room, height);
	if (shape.mode !== 'strip') return undefined;
	const depth = Math.min(shape.depth, stripReach(room, shape.wall));
	return stripCover(room, shape.wall, Math.max(MIN_STRIP_DEPTH, depth), height);
}

// The cover follows the outline when the shape of the room changes; a hand-drawn cover stays.
export function refitCover(room: Outline & Pick<Room, 'cover'>, polygon: Room['polygon']) {
	const cover = room.cover;
	if (!cover) return undefined;
	const shape = inferCover(room);
	if (shape.mode === 'custom') return cover;
	const next = { polygon };
	if (shape.mode === 'strip' && walls(polygon)[shape.wall - 1]) {
		return buildCover(next, shape, cover.height) ?? cover;
	}
	return wholeCover(next, cover.height);
}
