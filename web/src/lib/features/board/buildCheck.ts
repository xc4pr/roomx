import { validateRoom, type RoomIssue } from '#lib/core/checks.ts';
import type { Room } from '#lib/core/schema.ts';

export type CheckWarning =
	| { kind: 'noRooms' }
	| { kind: 'issue'; roomId: string; issue: RoomIssue }
	| { kind: 'photos'; roomId: string; done: number; total: number };

export function collectWarnings(
	rooms: readonly Room[],
	progress: (room: Room) => { done: number; total: number }
): CheckWarning[] {
	if (rooms.length === 0) return [{ kind: 'noRooms' }];
	const warnings: CheckWarning[] = [];
	for (const room of rooms) {
		for (const issue of validateRoom(room)) {
			warnings.push({ kind: 'issue', roomId: room.id, issue });
		}
		const { done, total } = progress(room);
		if (total > 0 && done < total) warnings.push({ kind: 'photos', roomId: room.id, done, total });
	}
	return warnings;
}
