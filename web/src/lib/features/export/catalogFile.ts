import type { CatalogEntry } from '#lib/core/catalog.ts';
import type { Dims, ItemCategory, Mount } from '#lib/core/schema.ts';
import type { Language } from '#lib/core/units.ts';
import { instructionTexts } from './instructionsText.ts';
import { translator } from './text.ts';

export const CATALOG_FORMAT = 'roomx-catalog';

export interface CompactCatalogEntry {
	id: string;
	brand: string;
	series?: string;
	name: string;
	category: ItemCategory;
	dims: Dims;
	colors: string[];
	mount: Mount;
	power: number;
	clearance: { front: number; side: number };
	priceChf?: number;
	verified: boolean;
}

export function compactEntry(entry: CatalogEntry, language: Language): CompactCatalogEntry {
	return {
		id: entry.id,
		brand: entry.brand,
		...(entry.series ? { series: entry.series } : {}),
		name: entry.name[language],
		category: entry.category,
		dims: entry.dims,
		colors: entry.colors,
		mount: entry.mount,
		power: entry.power,
		clearance: entry.clearance,
		...(entry.priceChf !== undefined ? { priceChf: entry.priceChf } : {}),
		verified: entry.verified
	};
}

export function compactCatalog(
	entries: readonly CatalogEntry[],
	language: Language
): CompactCatalogEntry[] {
	return entries.map((entry) => compactEntry(entry, language));
}

export function catalogJson(entries: readonly CatalogEntry[], language: Language): string {
	const tr = translator(instructionTexts, language);
	const header = {
		format: CATALOG_FORMAT,
		language,
		units: 'mm',
		currency: 'CHF',
		count: entries.length,
		notes: [tr('catalogNote1'), tr('catalogNote2'), tr('catalogNote3'), tr('catalogNote4')]
	};
	const head = JSON.stringify(header, null, 1).replace(/\n}$/, '');
	const rows = compactCatalog(entries, language).map((entry) => JSON.stringify(entry));
	return `${head},\n "items": [\n${rows.join(',\n')}\n ]\n}\n`;
}
