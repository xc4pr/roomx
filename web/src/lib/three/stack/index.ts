import { Group } from 'three';
import { floorLevels, floorsEnabled, roomFloorId, stairContext } from '#lib/core/floors.ts';
import { MaterialSet } from '../room/materials.ts';
import type { SceneContent } from '../types.ts';
import { stackedFloors } from '../viewer/layout.ts';
import { buildSlabs } from './slab.ts';
import { buildStair, buildStairwellRailing } from './stairs.ts';

// Slabs between the storeys, stairs and the guard rails around stairwells, in world space.
// Empty without floors or when a single room is shown.
export function buildStack(content: SceneContent): Group {
	const group = new Group();
	group.name = 'stack';
	if (!floorsEnabled(content.project) || !stackedFloors(content)) return group;
	const project = content.project;
	const levels = floorLevels(project);
	const materials = new MaterialSet();
	const shown = new Set(
		project.rooms
			.filter((room) => content.roomIds.includes(room.id))
			.map((room) => roomFloorId(project, room))
	);
	group.add(buildSlabs(content, levels, materials));
	for (const stair of project.stairs ?? []) {
		const context = stairContext(project, stair);
		if (!context || !(shown.has(context.from.id) || shown.has(context.to.id))) continue;
		const lower = levels.get(context.from.id) ?? 0;
		const upper = levels.get(context.to.id) ?? 0;
		group.add(buildStair(context, lower, materials));
		if (shown.has(context.to.id)) group.add(buildStairwellRailing(context, upper, materials));
	}
	return group;
}

export { outlineLoops } from './slab.ts';
export { stairTriangles } from './stairs.ts';
