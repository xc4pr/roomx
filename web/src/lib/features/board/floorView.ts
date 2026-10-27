import { floorIndex, floorRooms } from '#lib/core/floors.ts';
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
