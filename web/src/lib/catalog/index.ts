import { catalogLookup, type CatalogEntry } from '#lib/core/catalog.ts';
import { decor } from './data/decor.ts';
import { genericDevices } from './data/generic-devices.ts';
import { genericFurniture } from './data/generic-furniture.ts';
import { ikeaBeds } from './data/ikea-beds.ts';
import { ikeaDining } from './data/ikea-dining.ts';
import { ikeaOffice } from './data/ikea-office.ts';
import { ikeaSeating } from './data/ikea-seating.ts';
import { ikeaStorage } from './data/ikea-storage.ts';
import { lighting } from './data/lighting.ts';
import { withPrices } from './data/prices.ts';

export const catalog: readonly CatalogEntry[] = withPrices([
	...ikeaStorage,
	...ikeaBeds,
	...ikeaSeating,
	...ikeaOffice,
	...ikeaDining,
	...genericFurniture,
	...genericDevices,
	...decor,
	...lighting
]);

export const lookup = catalogLookup(catalog);
