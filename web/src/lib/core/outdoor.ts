import { wallLinks } from './adjacency.ts';
import { areaMm2, pointInPolygon, wall, walls, type Span, type Vec } from './geometry.ts';
import { roomFloorId } from './floors.ts';
import { isOpenAir, isOutdoor, type Project, type Room } from './schema.ts';

export interface RailingRun {
	wall: number;
	from: number;
	to: number;
}

// A balcony railing runs along every edge except where the area docks onto an indoor room (that
// wall belongs to the house). Open-air areas without railing get none.
export function railingRuns(rooms: readonly Room[], room: Room): RailingRun[] {
	if (!isOpenAir(room) || !room.railing) return [];
	const indoor = new Set(rooms.filter((other) => !isOpenAir(other)).map((other) => other.id));
	const docked = wallLinks(rooms).filter(
		(link) => link.roomId === room.id && indoor.has(link.otherRoomId)
	);
	const runs: RailingRun[] = [];
	for (const target of walls(room.polygon)) {
		const taken: Span[] = docked
			.filter((link) => link.wall === target.number)
			.map((link) => ({ from: link.from, to: link.to }))
			.sort((a, b) => a.from - b.from);
		let cursor = 0;
		for (const span of taken) {
			if (span.from > cursor + 1) runs.push({ wall: target.number, from: cursor, to: span.from });
			cursor = Math.max(cursor, span.to);
		}
		if (target.length > cursor + 1) {
			runs.push({ wall: target.number, from: cursor, to: Math.round(target.length) });
		}
	}
	return runs;
}

// Height of the cover above a point of an open-air area, if the point lies under it.
export function coverHeightAt(room: Pick<Room, 'cover'>, p: Vec): number | undefined {
	if (!room.cover) return undefined;
	return pointInPolygon(p, room.cover.polygon, 1) ? room.cover.height : undefined;
}

// Default cover: the whole area at the given height.
export function wholeCover(
	room: Pick<Room, 'polygon'>,
	height: number
): NonNullable<Room['cover']> {
	return { polygon: room.polygon.map((p) => ({ ...p })), height };
}

// Cover as a strip of the given depth along one edge (for example under the balcony above).
export function stripCover(
	room: Pick<Room, 'polygon'>,
	wallNumber: number,
	depth: number,
	height: number
): NonNullable<Room['cover']> | undefined {
	const target = wall(room.polygon, wallNumber);
	if (!target) return undefined;
	const at = (along: number, inward: number) => ({
		x: Math.round(target.start.x + target.direction.x * along + target.inward.x * inward),
		y: Math.round(target.start.y + target.direction.y * along + target.inward.y * inward)
	});
	return {
		polygon: [at(0, 0), at(target.length, 0), at(target.length, depth), at(0, depth)],
		height
	};
}

export interface AreaSummary {
	// m², rounded to 0.01.
	living: number;
	outdoor: number;
}

// Living area and outdoor area (balcony, terrace, garden, conservatory) of a project, or of one
// floor when floorId is given.
export function areaSummary(
	project: Pick<Project, 'rooms' | 'floors'>,
	floorId?: string
): AreaSummary {
	let living = 0;
	let outdoor = 0;
	for (const room of project.rooms) {
		if (floorId !== undefined && roomFloorId(project, room) !== floorId) continue;
		const area = areaMm2(room.polygon);
		if (isOutdoor(room)) outdoor += area;
		else living += area;
	}
	const m2 = (mm2: number) => Math.round(mm2 / 10000) / 100;
	return { living: m2(living), outdoor: m2(outdoor) };
}
