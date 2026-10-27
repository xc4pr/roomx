export const LIMITS = {
	planText: 2 * 1024 * 1024,
	id: 200,
	name: 200,
	label: 200,
	color: 64,
	text: 50000,
	caption: 5000,
	url: 2000,
	timestamp: 64,
	rooms: 200,
	floors: 20,
	stairs: 50,
	polygonPoints: 500,
	elementsPerRoom: 1000,
	photosPerRoom: 500,
	variants: 100,
	itemsPerVariant: 5000,
	suggestionsPerVariant: 5000,
	shoppingEntries: 2000,
	briefList: 100,
	briefKeep: 500,
	planVariants: 20,
	planRooms: 200,
	planItemsPerRoom: 300,
	planElectricalPerRoom: 200,
	reportedIssues: 50
} as const;

export type LimitName = keyof typeof LIMITS;

export const COUNT_LIMITS = [
	'rooms',
	'floors',
	'stairs',
	'polygonPoints',
	'elementsPerRoom',
	'photosPerRoom',
	'variants',
	'itemsPerVariant',
	'suggestionsPerVariant',
	'shoppingEntries',
	'briefList',
	'briefKeep'
] as const satisfies readonly LimitName[];

export type CountLimit = (typeof COUNT_LIMITS)[number];

// Editing stops at LIMITS; older versions could go beyond, so loading and import accept up to
// ten times as much instead of locking the project.
export const STORED_COUNT_FACTOR = 10;

export function storedLimit(name: CountLimit): number {
	return LIMITS[name] * STORED_COUNT_FACTOR;
}
