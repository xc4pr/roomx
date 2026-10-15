import type { MirroredOpening, WallLink } from '#lib/core/adjacency.ts';
import { roomToBoard, rotate, walls, type Vec } from '#lib/core/geometry.ts';
import { isWallElement, type Room } from '#lib/core/schema.ts';
import { pickLabelAlong, type Span } from './labelSlots.ts';

export interface LinkSpan {
	key: string;
	roomId: string;
	otherRoomId: string;
	a: Vec;
	b: Vec;
	outward: Vec;
	symbol: Vec | null;
	angle: number;
}

function openingSpans(room: Room, wall: number, mirrored: readonly MirroredOpening[]): Span[] {
	const own = room.elements.flatMap((element) =>
		isWallElement(element) && element.wall === wall && element.kind !== 'window'
			? [{ from: element.offset, to: element.offset + element.width }]
			: []
	);
	const shared = mirrored.flatMap((entry) =>
		entry.roomId === room.id && entry.element.wall === wall && entry.element.kind !== 'window'
			? [{ from: entry.element.offset, to: entry.element.offset + entry.element.width }]
			: []
	);
	return [...own, ...shared];
}

// One entry per shared wall, in board coordinates: the stretch on the inner face of the first room
// and where a connection symbol of the given size fits without covering a door.
export function linkSpans(
	rooms: readonly Room[],
	links: readonly WallLink[],
	mirrored: readonly MirroredOpening[],
	symbolMm: number
): LinkSpan[] {
	const byId = new Map(rooms.map((room) => [room.id, room]));
	const result: LinkSpan[] = [];
	for (const link of links) {
		if (link.roomId >= link.otherRoomId) continue;
		const room = byId.get(link.roomId);
		const wall = room ? walls(room.polygon)[link.wall - 1] : undefined;
		if (!room || !wall) continue;
		const rot = room.boardPos.rot;
		const direction = rotate(wall.direction, rot);
		const at = (along: number): Vec =>
			roomToBoard(room, {
				x: wall.start.x + wall.direction.x * along,
				y: wall.start.y + wall.direction.y * along
			});
		const occupied = openingSpans(room, link.wall, mirrored)
			.map((span) => ({ from: span.from - link.from - 80, to: span.to - link.from + 80 }))
			.filter((span) => span.to > 0 && span.from < link.to - link.from);
		const inner = pickLabelAlong(link.to - link.from, occupied, symbolMm);
		const a = at(link.from);
		const b = at(link.to);
		const inward = rotate(wall.inward, rot);
		const symbolAlong = inner === null ? null : link.from + inner;
		const base = symbolAlong === null ? null : at(symbolAlong);
		result.push({
			key: `${link.roomId}:${link.wall}:${link.otherRoomId}:${link.otherWall}`,
			roomId: link.roomId,
			otherRoomId: link.otherRoomId,
			a,
			b,
			outward: { x: -inward.x, y: -inward.y },
			symbol: base
				? {
						x: base.x - (inward.x * link.thickness) / 2,
						y: base.y - (inward.y * link.thickness) / 2
					}
				: null,
			angle: Math.atan2(direction.y, direction.x)
		});
	}
	return result;
}
