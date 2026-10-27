import { FLOOR_NAMES } from '#lib/core/defaults.ts';
import { roomFloorId } from '#lib/core/floors.ts';
import type { Language } from '#lib/core/units.ts';
import type { Project } from '#lib/core/schema.ts';

export const DEFAULT_MULTI: readonly string[] = ['EG', '1. OG'];

export const FLOOR_NAMES_EN: readonly string[] = [
	'Basement',
	'Ground floor',
	'1st floor',
	'2nd floor',
	'Attic'
];

export function floorNamesFor(language: Language): readonly string[] {
	return language === 'en' ? FLOOR_NAMES_EN : FLOOR_NAMES;
}

function rank(name: string): number {
	const german = (FLOOR_NAMES as readonly string[]).indexOf(name);
	return german >= 0 ? german : FLOOR_NAMES_EN.indexOf(name);
}

// Selected suggestions in building order (bottom to top).
export function orderedFloorNames(selected: readonly string[]): string[] {
	return [...selected].sort((a, b) => rank(a) - rank(b));
}

export function toggleFloorName(selected: readonly string[], name: string): string[] {
	return orderedFloorNames(
		selected.includes(name) ? selected.filter((entry) => entry !== name) : [...selected, name]
	);
}

// Names of the suggestions that no floor uses yet.
export function unusedFloorNames(
	project: Pick<Project, 'floors'>,
	names: readonly string[] = FLOOR_NAMES
): string[] {
	const used = new Set((project.floors ?? []).map((floor) => floor.name));
	return names.filter((name) => !used.has(name));
}

// Where a new floor with a suggested name belongs; undefined = at the top.
export function insertIndex(project: Pick<Project, 'floors'>, name: string): number | undefined {
	const wanted = rank(name);
	if (wanted < 0) return undefined;
	const at = (project.floors ?? []).findIndex((floor) => rank(floor.name) > wanted);
	return at < 0 ? undefined : at;
}

// A floor can only be removed while it is empty and not the last one.
export function floorRemovable(
	project: Pick<Project, 'rooms' | 'floors' | 'stairs'>,
	floorId: string
): boolean {
	const floors = project.floors ?? [];
	if (floors.length < 2) return false;
	const index = floors.findIndex((floor) => floor.id === floorId);
	if (index < 0) return false;
	if (project.rooms.some((room) => roomFloorId(project, room) === floorId)) return false;
	const below = index > 0 ? floors[index - 1].id : undefined;
	return !(project.stairs ?? []).some(
		(stair) => stair.fromFloorId === floorId || stair.fromFloorId === below
	);
}
