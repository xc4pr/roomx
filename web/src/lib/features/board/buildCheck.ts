import { unconnectedRooms } from '#lib/core/adjacency.ts';
import { validateRoom, type RoomIssue } from '#lib/core/checks.ts';
import type { Room } from '#lib/core/schema.ts';

export type CheckWarning =
	| { kind: 'noRooms' }
	| { kind: 'unconnected'; roomId: string }
	| { kind: 'issue'; roomId: string; issue: RoomIssue }
	| { kind: 'photos'; roomId: string; done: number; total: number };

export function collectWarnings(
	rooms: readonly Room[],
	progress: (room: Room) => { done: number; total: number },
	roomIds?: readonly string[]
): CheckWarning[] {
	const chosen = roomIds ? new Set(roomIds) : undefined;
	const scoped = chosen ? rooms.filter((room) => chosen.has(room.id)) : rooms;
	if (scoped.length === 0) return [{ kind: 'noRooms' }];
	const warnings: CheckWarning[] = unconnectedRooms(rooms)
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
	return warnings;
}

export function isError(warning: CheckWarning): boolean {
	return warning.kind === 'unconnected';
}
