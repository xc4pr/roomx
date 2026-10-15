import { catalogLookup, type CatalogEntry } from '#lib/core/catalog.ts';
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
import { withLooks } from './data/looks.ts';
import { withPrices } from './data/prices.ts';
import { catalogAliases } from './data/aliases.ts';

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

export const lookup = catalogLookup(catalog, catalogAliases);
