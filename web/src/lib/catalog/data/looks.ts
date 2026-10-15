import type { CatalogEntry, Look } from '#lib/core/catalog.ts';

// Keyed by `brand|series|model`; applies to every entry of that series and model type.
export const seriesLooks: Record<string, Look> = {};

// Keyed by entry id; fields replace those of the series look.
export const entryLooks: Record<string, Look> = {};

export const lookKey = (entry: Pick<CatalogEntry, 'brand' | 'series' | 'model'>): string =>
	`${entry.brand}|${entry.series ?? ''}|${entry.model}`;

export function withLooks(
	entries: CatalogEntry[],
	series: Readonly<Record<string, Look>> = seriesLooks,
	overrides: Readonly<Record<string, Look>> = entryLooks
): CatalogEntry[] {
	return entries.map((entry) => {
		const base = entry.series ? series[lookKey(entry)] : undefined;
		const own = Object.hasOwn(overrides, entry.id) ? overrides[entry.id] : undefined;
		if (!base && !own && !entry.look) return entry;
		return { ...entry, look: { ...base, ...entry.look, ...own } };
	});
}
