import { roomFloorId } from '#lib/core/floors.ts';
import type { Floor, Project } from '#lib/core/schema.ts';

// Floors that hold at least one room; only these can be shown or hidden in the 3D view.
export function floorsWithRooms(project: Pick<Project, 'floors' | 'rooms'>): Floor[] {
	return (project.floors ?? []).filter((floor) =>
		project.rooms.some((room) => roomFloorId(project, room) === floor.id)
	);
}

// Hides or shows a floor; the last visible floor stays.
export function toggleHidden(
	floorIds: readonly string[],
	hidden: readonly string[],
	id: string
): string[] {
	if (hidden.includes(id)) return hidden.filter((other) => other !== id);
	return floorIds.filter((floor) => !hidden.includes(floor)).length > 1
		? [...hidden, id]
		: [...hidden];
}
