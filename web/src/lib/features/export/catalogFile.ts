import { CATALOG_PRICES_AS_OF } from '#lib/catalog/index.ts';
import type { CatalogEntry } from '#lib/core/catalog.ts';
import type { Dims, ItemCategory, Mount } from '#lib/core/schema.ts';
import type { Language } from '#lib/core/units.ts';
import { formatMonthYear } from '#lib/features/furnish/format.ts';
import { instructionTexts } from './instructionsText.ts';
import { translator } from './text.ts';

export const CATALOG_FORMAT = 'roomx-catalog';
export const CATALOG_MAX_BYTES = 1_500_000;

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
	discontinued?: true;
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
		verified: entry.verified,
		...(entry.discontinued ? { discontinued: true as const } : {})
	};
}

export function compactCatalog(
	entries: readonly CatalogEntry[],
	language: Language
): CompactCatalogEntry[] {
	return entries.map((entry) => compactEntry(entry, language));
}

export interface CatalogExcerpt {
	total: number;
}

export function catalogJson(
	entries: readonly CatalogEntry[],
	language: Language,
	excerpt?: CatalogExcerpt
): string {
	const tr = translator(instructionTexts, language);
	const header = {
		format: CATALOG_FORMAT,
		language,
		units: 'mm',
		currency: 'CHF',
		pricesAsOf: CATALOG_PRICES_AS_OF,
		count: entries.length,
		...(excerpt ? { excerpt: true, total: excerpt.total } : {}),
		notes: [
			tr('catalogNote1'),
			tr('catalogNote2'),
			tr('catalogNote3'),
			tr('catalogNote4', { date: formatMonthYear(CATALOG_PRICES_AS_OF, language) }),
			tr('catalogNote5'),
			...(excerpt ? [tr('catalogExcerpt', { count: entries.length, total: excerpt.total })] : [])
		]
	};
	const head = JSON.stringify(header, null, 1).replace(/\n}$/, '');
	const rows = compactCatalog(entries, language).map((entry) => JSON.stringify(entry));
	return `${head},\n "items": [\n${rows.join(',\n')}\n ]\n}\n`;
}

export interface PackageCatalog {
	entries: CatalogEntry[];
	excerpt: CatalogExcerpt | undefined;
}

function priceOf(entry: CatalogEntry): number {
	return entry.priceChf ?? Number.POSITIVE_INFINITY;
}

export function orderForPackage(
	curated: readonly CatalogEntry[],
	extra: readonly CatalogEntry[]
): CatalogEntry[] {
	const rank = (entry: CatalogEntry) => (entry.verified ? 0 : 1);
	const sorted = [...extra].sort(
		(a, b) =>
			rank(a) - rank(b) ||
			a.category.localeCompare(b.category) ||
			priceOf(a) - priceOf(b) ||
			a.id.localeCompare(b.id)
	);
	return [...curated, ...sorted];
}

export function retailerEntries(
	extra: readonly CatalogEntry[],
	retailers: readonly string[] | undefined
): CatalogEntry[] {
	const wanted = new Set(
		(retailers && retailers.length > 0 ? retailers : ['IKEA']).map((name) => name.toLowerCase())
	);
	return extra.filter((entry) => wanted.has(entry.brand.toLowerCase()));
}

export function fitCatalog(
	ordered: readonly CatalogEntry[],
	language: Language,
	maxBytes: number = CATALOG_MAX_BYTES
): PackageCatalog {
	const encoder = new TextEncoder();
	const full = encoder.encode(catalogJson(ordered, language)).length;
	if (full <= maxBytes) return { entries: [...ordered], excerpt: undefined };
	const total = ordered.length;
	const base = encoder.encode(catalogJson([], language, { total })).length + 64;
	let used = base;
	let count = 0;
	for (const row of compactCatalog(ordered, language)) {
		const size = encoder.encode(JSON.stringify(row)).length + 3;
		if (used + size > maxBytes) break;
		used += size;
		count += 1;
	}
	const entries = ordered.slice(0, count);
	return { entries, excerpt: { total } };
}
