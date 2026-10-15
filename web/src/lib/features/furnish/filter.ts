import type { CatalogEntry } from '#lib/core/catalog.ts';
import type { ItemCategory } from '#lib/core/schema.ts';

export const WIDTH_CLASSES = ['narrow', 'medium', 'wide', 'extraWide'] as const;
export type WidthClass = (typeof WIDTH_CLASSES)[number];

const WIDTH_LIMITS: Record<WidthClass, readonly [number, number]> = {
	narrow: [0, 600],
	medium: [601, 1000],
	wide: [1001, 1600],
	extraWide: [1601, Number.POSITIVE_INFINITY]
};

export function widthClassOf(widthMm: number): WidthClass {
	return WIDTH_CLASSES.find((name) => widthMm <= WIDTH_LIMITS[name][1]) ?? 'extraWide';
}

export interface CatalogFilter {
	query: string;
	category: ItemCategory | 'all';
	brand: string | 'all';
	width?: WidthClass | 'all';
}

export function normalizeText(text: string): string {
	return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

interface Searchable {
	text: string;
	name: Record<'de' | 'en', string>;
}

const searchable = new WeakMap<CatalogEntry, Searchable>();

function searchOf(entry: CatalogEntry): Searchable {
	let found = searchable.get(entry);
	if (!found) {
		const de = normalizeText(entry.name.de);
		const en = normalizeText(entry.name.en);
		found = {
			text: normalizeText(
				[entry.name.de, entry.name.en, entry.series ?? '', entry.brand, entry.articleNo ?? ''].join(
					' '
				)
			),
			name: { de, en }
		};
		searchable.set(entry, found);
	}
	return found;
}

const collators = new Map<string, Intl.Collator>();
const orders = new WeakMap<readonly CatalogEntry[], Map<string, CatalogEntry[]>>();

function orderedEntries(entries: readonly CatalogEntry[], language: 'de' | 'en'): CatalogEntry[] {
	let perLanguage = orders.get(entries);
	if (!perLanguage) {
		perLanguage = new Map();
		orders.set(entries, perLanguage);
	}
	let sorted = perLanguage.get(language);
	if (!sorted) {
		let collator = collators.get(language);
		if (!collator) {
			collator = new Intl.Collator(language);
			collators.set(language, collator);
		}
		const compare = collator.compare;
		sorted = [...entries].sort(
			(a, b) =>
				Number(b.verified) - Number(a.verified) || compare(a.name[language], b.name[language])
		);
		perLanguage.set(language, sorted);
	}
	return sorted;
}

export function filterCatalog(
	entries: readonly CatalogEntry[],
	filter: CatalogFilter,
	language: 'de' | 'en'
): CatalogEntry[] {
	const tokens = normalizeText(filter.query)
		.split(/\s+/)
		.filter((token) => token.length > 0);
	const limits = filter.width && filter.width !== 'all' ? WIDTH_LIMITS[filter.width] : undefined;
	const scored: { entry: CatalogEntry; score: number }[] = [];
	for (const entry of orderedEntries(entries, language)) {
		if (filter.category !== 'all' && entry.category !== filter.category) continue;
		if (filter.brand !== 'all' && entry.brand !== filter.brand) continue;
		if (limits && (entry.dims.w < limits[0] || entry.dims.w > limits[1])) continue;
		let score = 0;
		if (tokens.length > 0) {
			const search = searchOf(entry);
			if (!tokens.every((token) => search.text.includes(token))) continue;
			const name = search.name[language];
			for (const token of tokens) {
				if (name.startsWith(token)) score += 3;
				else if (name.includes(` ${token}`)) score += 2;
				else if (name.includes(token)) score += 1;
			}
		}
		scored.push({ entry, score });
	}
	if (tokens.length > 0) scored.sort((a, b) => b.score - a.score);
	return scored.map((row) => row.entry);
}

export function brandsOf(entries: readonly CatalogEntry[]): string[] {
	return [...new Set(entries.map((entry) => entry.brand))].sort((a, b) => a.localeCompare(b));
}

export function categoriesOf(entries: readonly CatalogEntry[]): Map<ItemCategory, number> {
	const counts = new Map<ItemCategory, number>();
	for (const entry of entries) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
	return counts;
}

export const COMMON_CATEGORIES: readonly ItemCategory[] = [
	'sofa',
	'bed',
	'table',
	'chair',
	'desk',
	'shelf',
	'lamp',
	'dresser'
];

export const COLLAPSED_CATEGORY_COUNT = 3;

export function collapsedCategories(
	available: readonly ItemCategory[],
	selected: ItemCategory | 'all',
	limit: number = COLLAPSED_CATEGORY_COUNT
): ItemCategory[] {
	const has = new Set(available);
	const result: ItemCategory[] = selected !== 'all' && has.has(selected) ? [selected] : [];
	for (const category of COMMON_CATEGORIES) {
		if (result.length >= limit) break;
		if (has.has(category) && !result.includes(category)) result.push(category);
	}
	return result;
}
