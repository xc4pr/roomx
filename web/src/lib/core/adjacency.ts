import { cross, dot, roomToBoard, sub, wall, walls, type Vec, type Wall } from './geometry.ts';
import { isOpenAir, type Door, type Room, type Window } from './schema.ts';

export const LINK_TOLERANCE = 30;
export const MIN_WALL_THICKNESS = 80;
export const MAX_WALL_THICKNESS = 350;
export const WALL_THICKNESS_PRESETS = [100, 120, 150, 200, 250, 300] as const;
export const MIN_LINK_LENGTH = 100;

export interface WallLink {
	roomId: string;
	wall: number;
	otherRoomId: string;
	otherWall: number;
	from: number;
	to: number;
	thickness: number;
}

export interface MirroredOpening {
	roomId: string;
	sourceRoomId: string;
	element: Door | Window;
}

interface BoardWall {
	wall: Wall;
	start: Vec;
	end: Vec;
	direction: Vec;
	inward: Vec;
}

function boardWalls(room: Room): BoardWall[] {
	const rotate = (v: Vec): Vec => {
		const rad = (room.boardPos.rot * Math.PI) / 180;
		return {
			x: v.x * Math.cos(rad) - v.y * Math.sin(rad),
			y: v.x * Math.sin(rad) + v.y * Math.cos(rad)
		};
	};
	return walls(room.polygon).map((target) => ({
		wall: target,
		start: roomToBoard(room, target.start),
		end: roomToBoard(room, target.end),
		direction: rotate(target.direction),
		inward: rotate(target.inward)
	}));
}

// Two rooms share a wall when their wall faces are antiparallel and a plausible wall thickness apart.
// The gap between the two interior faces is the thickness of the shared wall.
function linkBetween(
	a: BoardWall,
	b: BoardWall
): { from: number; to: number; thickness: number } | undefined {
	if (Math.abs(cross(a.direction, b.direction)) > 0.01) return undefined;
	if (dot(a.direction, b.direction) > -0.99) return undefined;
	const gap = -dot(sub(b.start, a.start), a.inward);
	if (gap < MIN_WALL_THICKNESS - LINK_TOLERANCE || gap > MAX_WALL_THICKNESS + LINK_TOLERANCE) {
		return undefined;
	}
	const along = (p: Vec) => dot(sub(p, a.start), a.direction);
	const from = Math.max(0, Math.min(along(b.start), along(b.end)));
	const to = Math.min(a.wall.length, Math.max(along(b.start), along(b.end)));
	if (to - from < MIN_LINK_LENGTH) return undefined;
	return { from: Math.round(from), to: Math.round(to), thickness: Math.round(gap) };
}

// Only rooms on the same floor share walls (without floors every room has no floorId).
export function wallLinks(rooms: readonly Room[]): WallLink[] {
	const prepared = rooms.map((room) => ({ room, walls: boardWalls(room) }));
	const links: WallLink[] = [];
	for (const a of prepared) {
		for (const b of prepared) {
			if (a.room.id === b.room.id) continue;
			if ((a.room.floorId ?? '') !== (b.room.floorId ?? '')) continue;
			for (const wa of a.walls) {
				for (const wb of b.walls) {
					const span = linkBetween(wa, wb);
					if (!span) continue;
					links.push({
						roomId: a.room.id,
						wall: wa.wall.number,
						otherRoomId: b.room.id,
						otherWall: wb.wall.number,
						...span
					});
				}
			}
		}
	}
	return links;
}

// A door or window in a shared wall also opens the neighbour's wall: the opening is mirrored
// into the other room with its offset measured along the other wall, which runs the opposite way.
export function mirroredOpenings(rooms: readonly Room[]): MirroredOpening[] {
	const byId = new Map(rooms.map((room) => [room.id, room]));
	const result: MirroredOpening[] = [];
	for (const link of wallLinks(rooms)) {
		const source = byId.get(link.roomId);
		const target = byId.get(link.otherRoomId);
		const targetWall = target ? wall(target.polygon, link.otherWall) : undefined;
		if (!source || !target || !targetWall) continue;
		const sourceBoard = boardWalls(source)[link.wall - 1];
		const targetBoard = boardWalls(target)[link.otherWall - 1];
		for (const element of source.elements) {
			if (element.kind !== 'door' && element.kind !== 'window') continue;
			if (element.wall !== link.wall) continue;
			if (element.offset < link.from - 1 || element.offset + element.width > link.to + 1) continue;
			const startOnBoard = {
				x: sourceBoard.start.x + sourceBoard.direction.x * (element.offset + element.width),
				y: sourceBoard.start.y + sourceBoard.direction.y * (element.offset + element.width)
			};
			const offset = Math.round(dot(sub(startOnBoard, targetBoard.start), targetBoard.direction));
			const base = { ...element, id: `${element.id}@${target.id}`, wall: link.otherWall, offset };
			const mirrored: Door | Window =
				base.kind === 'door'
					? {
							...base,
							hinge: base.hinge === 'start' ? 'end' : 'start',
							swing: base.swing === 'in' ? 'out' : base.swing === 'out' ? 'in' : 'sliding'
						}
					: base;
			result.push({ roomId: target.id, sourceRoomId: source.id, element: mirrored });
		}
	}
	return result;
}

// Doors and windows of a room in walls it shares with an indoor room, as they would sit in that
// room's wall. When a room becomes an open-air area (no walls), they move there with their id.
export function openingsForNeighbours(rooms: readonly Room[], roomId: string): MirroredOpening[] {
	const indoor = new Set(rooms.filter((room) => !isOpenAir(room)).map((room) => room.id));
	return mirroredOpenings(rooms)
		.filter((entry) => entry.sourceRoomId === roomId && indoor.has(entry.roomId))
		.map((entry) => ({
			...entry,
			element: {
				...entry.element,
				id: entry.element.id.slice(0, entry.element.id.lastIndexOf('@'))
			}
		}));
}

export function roomNeighbours(rooms: readonly Room[], roomId: string): WallLink[] {
	return wallLinks(rooms).filter((link) => link.roomId === roomId);
}

// Rooms with the openings of their neighbours added, for 3D, checks and export.
// Mirrored elements keep the source id with "@<roomId>" appended and must not be edited.
export function withMirroredOpenings(rooms: readonly Room[]): Room[] {
	const mirrored = mirroredOpenings(rooms);
	return rooms.map((room) => {
		const extra = mirrored
			.filter((entry) => entry.roomId === room.id)
			.map((entry) => entry.element);
		return extra.length > 0 ? { ...room, elements: [...room.elements, ...extra] } : room;
	});
}

export function isMirroredElement(id: string): boolean {
	return id.includes('@');
}

// In a project with several rooms, every room should share at least one wall with another room,
// unless it is marked as deliberately separate (cellar, garage, attic, outdoor area).
export function unconnectedRooms(rooms: readonly Room[]): Room[] {
	if (rooms.length < 2) return [];
	const linked = new Set(wallLinks(rooms).map((link) => link.roomId));
	return rooms.filter((room) => !linked.has(room.id) && !room.separate);
}

// Board position for `moving` so that the shared wall with `link` gets the given thickness.
export function dockAtThickness(
	rooms: readonly Room[],
	link: WallLink,
	thickness: number
): { roomId: string; boardPos: Room['boardPos'] } | undefined {
	const fixed = rooms.find((room) => room.id === link.roomId);
	const moving = rooms.find((room) => room.id === link.otherRoomId);
	if (!fixed || !moving) return undefined;
	const fixedWall = boardWalls(fixed)[link.wall - 1];
	if (!fixedWall) return undefined;
	const shift = thickness - link.thickness;
	return {
		roomId: moving.id,
		boardPos: {
			...moving.boardPos,
			x: Math.round(moving.boardPos.x - fixedWall.inward.x * shift),
			y: Math.round(moving.boardPos.y - fixedWall.inward.y * shift)
		}
	};
}
