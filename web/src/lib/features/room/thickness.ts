import { dockAtThickness, wallLinks, type WallLink } from '#lib/core/adjacency.ts';
import type { BoardPos, Room } from '#lib/core/schema.ts';

export interface RoomMove {
	roomId: string;
	boardPos: BoardPos;
}

export interface ThicknessChange {
	moves: RoomMove[];
	detached: boolean;
}

function samePair(a: WallLink, b: WallLink): boolean {
	return (
		(a.roomId === b.roomId &&
			a.wall === b.wall &&
			a.otherRoomId === b.otherRoomId &&
			a.otherWall === b.otherWall) ||
		(a.roomId === b.otherRoomId &&
			a.wall === b.otherWall &&
			a.otherRoomId === b.roomId &&
			a.otherWall === b.wall)
	);
}

// Rooms reachable from the neighbour once the edited connection is taken away.
export function neighbourComponent(rooms: readonly Room[], link: WallLink): Set<string> {
	const links = wallLinks(rooms).filter((candidate) => !samePair(candidate, link));
	const seen = new Set([link.otherRoomId]);
	const queue = [link.otherRoomId];
	while (queue.length > 0) {
		const current = queue.shift();
		for (const next of links) {
			if (next.roomId === current && !seen.has(next.otherRoomId)) {
				seen.add(next.otherRoomId);
				queue.push(next.otherRoomId);
			}
		}
	}
	return seen;
}

// All rooms behind the connection move together so their own walls stay docked.
// If they are also connected back to the own room (a ring), only the neighbour moves and
// its other connections come loose.
export function changeThickness(
	rooms: readonly Room[],
	link: WallLink,
	thickness: number
): ThicknessChange {
	const dock = dockAtThickness(rooms, link, thickness);
	const neighbour = rooms.find((room) => room.id === link.otherRoomId);
	if (!dock || !neighbour || thickness === link.thickness) return { moves: [], detached: false };
	const dx = dock.boardPos.x - neighbour.boardPos.x;
	const dy = dock.boardPos.y - neighbour.boardPos.y;
	const component = neighbourComponent(rooms, link);
	const detached = component.has(link.roomId);
	const ids = detached ? new Set([link.otherRoomId]) : component;
	const moves = rooms
		.filter((room) => ids.has(room.id))
		.map((room) => ({
			roomId: room.id,
			boardPos: { ...room.boardPos, x: room.boardPos.x + dx, y: room.boardPos.y + dy }
		}));
	return { moves, detached };
}
