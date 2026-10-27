import type { Project, Room } from '#lib/core/schema.ts';
import { planRooms } from '#lib/features/board/floorView.ts';

// Rooms a dragged item may be moved into: those of the shown floor, except the room it is in.
export function dropTargets(
	project: Pick<Project, 'rooms' | 'floors'>,
	floorId: string | undefined,
	current: Pick<Room, 'id'>
): Room[] {
	return planRooms(project, floorId).filter((room) => room.id !== current.id);
}
