import { catalogLookup, type CatalogEntry, type CatalogLookup } from '#lib/core/catalog.ts';
import { decor } from './data/decor.ts';
import { genericDevices } from './data/generic-devices.ts';
import { genericFurniture } from './data/generic-furniture.ts';
import { ikeaBeds } from './data/ikea-beds.ts';
import { ikeaDining } from './data/ikea-dining.ts';
import { ikeaOffice } from './data/ikea-office.ts';
import { ikeaSeating } from './data/ikea-seating.ts';
import { ikeaStorage } from './data/ikea-storage.ts';
import { jyskFurniture } from './data/jysk.ts';
import { lighting } from './data/lighting.ts';
import { tchiboCn3 } from './data/tchibo.ts';
import { withLooks, withSeriesLooks } from './data/looks.ts';
import { withPrices } from './data/prices.ts';
import { catalogAliases } from './data/aliases.ts';
import { mergeEntries, type MergeResult } from './merge.ts';

export { catalogAliases };

export const CATALOG_PRICES_AS_OF = '2026-10';

export const catalog: readonly CatalogEntry[] = withLooks(
	withPrices([
		...ikeaStorage,
		...ikeaBeds,
		...ikeaSeating,
		...ikeaOffice,
		...ikeaDining,
		...genericFurniture,
		...genericDevices,
		...decor,
		...lighting,
		...tchiboCn3,
		...jyskFurniture
	])
);

const curatedLookup: CatalogLookup = catalogLookup(catalog, catalogAliases);
const registered = new Map<string, CatalogEntry>();
let combined: readonly CatalogEntry[] | undefined;

export const lookup: CatalogLookup = (id) => curatedLookup(id) ?? registered.get(id);

export function registerEntries(entries: readonly unknown[]): MergeResult {
	const result = mergeEntries(
		[...catalog, ...registered.values()],
		entries,
		(id) => curatedLookup(id) !== undefined
	);
	for (const entry of withSeriesLooks(result.accepted)) registered.set(entry.id, entry);
	if (result.accepted.length > 0) combined = undefined;
	return result;
}

export function registeredEntries(): readonly CatalogEntry[] {
	return [...registered.values()];
}

export function allEntries(): readonly CatalogEntry[] {
	combined ??= registered.size === 0 ? catalog : [...catalog, ...registered.values()];
	return combined;
}

export function clearRegistered(): void {
	registered.clear();
	combined = undefined;
}
