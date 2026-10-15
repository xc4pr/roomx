import type { CatalogEntry, Look } from '#lib/core/catalog.ts';
import { entryLooks, seriesLooks } from './lookData.ts';

export { entryLooks, seriesLooks };

// Series looks are keyed by `brand|series|model`; entry looks by id and replace fields of the series look.

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

// Entries of the full catalog share the series look but not its fronts, which depend on the size.
export function withSeriesLooks(
	entries: CatalogEntry[],
	series: Readonly<Record<string, Look>> = seriesLooks
): CatalogEntry[] {
	return entries.map((entry) => {
		const base = entry.series ? series[lookKey(entry)] : undefined;
		if (!base) return entry;
		const shared: Look = { ...base };
		delete shared.rows;
		delete shared.sections;
		if (Object.keys(shared).length === 0) return entry;
		return { ...entry, look: { ...shared, ...entry.look } };
	});
}
