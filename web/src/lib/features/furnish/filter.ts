import type { CatalogEntry } from '#lib/core/catalog.ts';
import type { ItemCategory } from '#lib/core/schema.ts';

export interface CatalogFilter {
	query: string;
	category: ItemCategory | 'all';
	brand: string | 'all';
}

export function normalizeText(text: string): string {
	return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function haystack(entry: CatalogEntry): string {
	return normalizeText(
		[entry.name.de, entry.name.en, entry.series ?? '', entry.brand, entry.articleNo ?? ''].join(' ')
	);
}

export function filterCatalog(
	entries: readonly CatalogEntry[],
	filter: CatalogFilter,
	language: 'de' | 'en'
): CatalogEntry[] {
	const tokens = normalizeText(filter.query)
		.split(/\s+/)
		.filter((token) => token.length > 0);
	const scored: { entry: CatalogEntry; score: number }[] = [];
	for (const entry of entries) {
		if (filter.category !== 'all' && entry.category !== filter.category) continue;
		if (filter.brand !== 'all' && entry.brand !== filter.brand) continue;
		let score = 0;
		if (tokens.length > 0) {
			const text = haystack(entry);
			if (!tokens.every((token) => text.includes(token))) continue;
			const name = normalizeText(entry.name[language]);
			for (const token of tokens) {
				if (name.startsWith(token)) score += 3;
				else if (name.includes(` ${token}`)) score += 2;
				else if (name.includes(token)) score += 1;
			}
		}
		scored.push({ entry, score });
	}
	return scored
		.sort(
			(a, b) =>
				b.score - a.score ||
				Number(b.entry.verified) - Number(a.entry.verified) ||
				a.entry.name[language].localeCompare(b.entry.name[language], language)
		)
		.map((row) => row.entry);
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
