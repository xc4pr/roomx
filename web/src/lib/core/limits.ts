import { COUNT_LIMITS, LIMITS, type CountLimit } from '../security/limits.ts';
import type { Project } from './schema.ts';

export type Overflow = Record<CountLimit, number>;

// How far each count limit is exceeded, summed over all containers of that kind. The mapping
// follows ProjectSchema: slopes share the polygonPoints limit, brief lists share briefList.
export function overflowOf(project: Project): Overflow {
	const over = Object.fromEntries(COUNT_LIMITS.map((name) => [name, 0])) as Overflow;
	const add = (name: CountLimit, count: number | undefined) => {
		over[name] += Math.max(0, (count ?? 0) - LIMITS[name]);
	};
	add('rooms', project.rooms.length);
	add('variants', project.variants.length);
	for (const room of project.rooms) {
		add('polygonPoints', room.polygon.length);
		add('polygonPoints', room.slopes?.length);
		add('elementsPerRoom', room.elements.length);
		add('photosPerRoom', room.photos.length);
	}
	for (const variant of project.variants) {
		add('itemsPerVariant', variant.items.length);
		add('suggestionsPerVariant', variant.suggestions.length);
		add('shoppingEntries', variant.shoppingList?.length);
	}
	const brief = project.brief;
	if (brief) {
		add('briefList', brief.persons.childAges?.length);
		add('briefList', brief.bedSizes.length);
		add('briefList', brief.workstations.length);
		add('briefList', brief.retailers?.length);
		for (const workstation of brief.workstations) add('briefList', workstation.devices?.length);
		add('briefKeep', brief.keep?.length);
	}
	return over;
}

// The first limit whose overflow grew. Growth instead of "above the limit" keeps an old,
// oversized project editable and lets it shrink step by step.
export function grownLimit(before: Overflow, after: Overflow): CountLimit | null {
	return COUNT_LIMITS.find((name) => after[name] > before[name]) ?? null;
}
