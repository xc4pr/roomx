import { lookup } from '#lib/catalog/index.ts';
import { createElement, createRoom } from '#lib/core/defaults.ts';
import { newId, type IdFactory } from '#lib/core/ids.ts';
import { SCHEMA_VERSION, type Item, type Project } from '#lib/core/schema.ts';
import type { Language } from '#lib/core/units.ts';
import { itemFromCatalog } from '#lib/features/furnish/place.ts';

export interface SampleNames {
	project: string;
	room: string;
}

export interface SampleOptions {
	language: Language;
	names: SampleNames;
	now?: string;
	ids?: IdFactory;
}

const SAMPLE_BUDGET_CHF = 1500;

function furniture(
	catalogId: string,
	roomId: string,
	language: Language,
	at: { x: number; y: number; rotation: number },
	ids: IdFactory
): Item[] {
	const entry = lookup(catalogId);
	if (!entry) return [];
	return [{ ...itemFromCatalog(entry, roomId, entry.name[language]), ...at, id: ids() }];
}

export function buildSampleProject(options: SampleOptions): Project {
	const ids = options.ids ?? newId;
	const now = options.now ?? new Date().toISOString();
	const roomId = ids();
	const room = createRoom(roomId, options.names.room, 'living');
	room.elements = [
		createElement('door', room, 2, 800, ids),
		createElement('window', room, 3, 2000, ids),
		createElement('socket', room, 4, 700, ids)
	];
	const items = [
		...furniture(
			'generic-sofa-2-170x90x85',
			roomId,
			options.language,
			{ x: 470, y: 1400, rotation: 270 },
			ids
		),
		...furniture(
			'generic-coffee-table-100x55x45',
			roomId,
			options.language,
			{ x: 1600, y: 1400, rotation: 270 },
			ids
		)
	];
	const variantId = ids();
	return {
		id: ids(),
		name: options.names.project,
		schemaVersion: SCHEMA_VERSION,
		rev: 0,
		createdAt: now,
		updatedAt: now,
		brief: {
			persons: { adults: 1, children: 0 },
			bedSizes: [],
			workstations: [],
			budgetChf: SAMPLE_BUDGET_CHF
		},
		rooms: [room],
		variants: [{ id: variantId, name: 'A', source: 'user', items, suggestions: [] }],
		activeVariantId: variantId
	};
}
