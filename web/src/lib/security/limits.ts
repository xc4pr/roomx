export const LIMITS = {
	planText: 2 * 1024 * 1024,
	id: 200,
	name: 200,
	label: 200,
	color: 64,
	text: 5000,
	caption: 500,
	url: 2000,
	timestamp: 64,
	rooms: 200,
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
