import { floorIndex, floorRooms, roomFloorId } from '#lib/core/floors.ts';
import type { Project, Room } from '#lib/core/schema.ts';

type Floored = Pick<Project, 'rooms' | 'floors'>;

// Rooms shown and editable in the plan: those of the chosen floor, or all without floors.
export function planRooms(project: Floored, floorId: string | undefined): Room[] {
	return floorId ? floorRooms(project, floorId) : project.rooms;
}

// Rooms of the floor below, shown faintly as a template for aligning.
export function underlayRooms(project: Floored, floorId: string | undefined): Room[] {
	if (!floorId) return [];
	const index = floorIndex(project, floorId);
	const below = index > 0 ? project.floors?.[index - 1] : undefined;
	return below ? floorRooms(project, below.id) : [];
}

// The floor a selected room is on, if it differs from the shown one (so the plan follows the selection).
export function floorOfSelection(
	project: Floored,
	selectedRoomId: string | null,
	shownFloorId: string | undefined
): string | undefined {
	if (!selectedRoomId || !shownFloorId) return undefined;
	const room = project.rooms.find((candidate) => candidate.id === selectedRoomId);
	const floorId = room ? roomFloorId(project, room) : undefined;
	return floorId && floorId !== shownFloorId ? floorId : undefined;
}

// Changes when another room is selected or the selected room moves to another floor (also by undo).
export function selectionKey(project: Floored, selectedRoomId: string | null): string {
	const room = project.rooms.find((candidate) => candidate.id === selectedRoomId);
	return `${selectedRoomId ?? ''}|${room ? (roomFloorId(project, room) ?? '') : ''}`;
}
