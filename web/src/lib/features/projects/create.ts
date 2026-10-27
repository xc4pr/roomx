import { SLAB_THICKNESS } from '#lib/core/defaults.ts';
import { newId } from '#lib/core/ids.ts';
import { emptyProject, saveProject } from '#lib/state/persistence.ts';

// A new project; with floorNames it starts with those floors (bottom to top), else with one floor
// and no floor controls.
export async function createProjectWithFloors(
	name: string,
	floorNames?: readonly string[]
): Promise<string> {
	const project = emptyProject(newId(), name);
	if (floorNames && floorNames.length > 0) {
		project.floors = floorNames.map((floorName) => ({
			id: newId(),
			name: floorName,
			slabThickness: SLAB_THICKNESS
		}));
	}
	await saveProject(project);
	return project.id;
}
