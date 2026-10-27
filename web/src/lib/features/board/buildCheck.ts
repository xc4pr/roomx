import { unconnectedRooms } from '#lib/core/adjacency.ts';
import { validateRoom, type RoomIssue } from '#lib/core/checks.ts';
import { roomFloorId, type StairIssue } from '#lib/core/floors.ts';
import type { Project, Room } from '#lib/core/schema.ts';

export type CheckWarning =
	| { kind: 'noRooms' }
	| { kind: 'unconnected'; roomId: string }
	| { kind: 'issue'; roomId: string; issue: RoomIssue }
	| { kind: 'photos'; roomId: string; done: number; total: number }
	| { kind: 'stair'; issue: StairIssue };

function unconnectedPerFloor(rooms: readonly Room[], floors: Project['floors']): Room[] {
	const groups = new Map<string, Room[]>();
	for (const room of rooms) {
		const key = (floors ? roomFloorId({ floors }, room) : room.floorId) ?? '';
		groups.set(key, [...(groups.get(key) ?? []), room]);
	}
	return [...groups.values()].flatMap((group) => unconnectedRooms(group));
}

export function collectWarnings(
	rooms: readonly Room[],
	progress: (room: Room) => { done: number; total: number },
	roomIds?: readonly string[],
	stairIssues: readonly StairIssue[] = [],
	floors?: Project['floors']
): CheckWarning[] {
	const chosen = roomIds ? new Set(roomIds) : undefined;
	const scoped = chosen ? rooms.filter((room) => chosen.has(room.id)) : rooms;
	if (scoped.length === 0) return [{ kind: 'noRooms' }];
	const warnings: CheckWarning[] = unconnectedPerFloor(rooms, floors)
		.filter((room) => !chosen || chosen.has(room.id))
		.map((room) => ({
			kind: 'unconnected',
			roomId: room.id
		}));
	for (const room of scoped) {
		for (const issue of validateRoom(room)) {
			warnings.push({ kind: 'issue', roomId: room.id, issue });
		}
		const { done, total } = progress(room);
		if (total > 0 && done < total) warnings.push({ kind: 'photos', roomId: room.id, done, total });
	}
	if (!chosen)
		warnings.push(...stairIssues.map((issue): CheckWarning => ({ kind: 'stair', issue })));
	return warnings;
}

export function isError(warning: CheckWarning): boolean {
	return warning.kind === 'unconnected';
}
