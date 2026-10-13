import type { CatalogEntry } from '#lib/core/catalog.ts';
import type { Dims, Item, ItemCategory, ModelType, Mount } from '#lib/core/schema.ts';

export const CATEGORY_MODEL: Record<ItemCategory, ModelType> = {
	bed: 'bed',
	sofa: 'sofa',
	armchair: 'armchair',
	chair: 'chair',
	officeChair: 'officeChair',
	table: 'table',
	desk: 'desk',
	wardrobe: 'wardrobe',
	shelf: 'shelf',
	dresser: 'dresser',
	sideboard: 'sideboard',
	tvUnit: 'sideboard',
	nightstand: 'nightstand',
	lamp: 'floorLamp',
	rug: 'rug',
	plant: 'plant',
	picture: 'picture',
	mirror: 'mirror',
	curtain: 'curtain',
	textile: 'throw',
	decor: 'vase',
	electronics: 'smallDevice',
	other: 'box'
};

export const CATEGORY_MOUNT: Record<ItemCategory, Mount> = {
	bed: 'floor',
	sofa: 'floor',
	armchair: 'floor',
	chair: 'floor',
	officeChair: 'floor',
	table: 'floor',
	desk: 'floor',
	wardrobe: 'floor',
	shelf: 'floor',
	dresser: 'floor',
	sideboard: 'floor',
	tvUnit: 'floor',
	nightstand: 'floor',
	lamp: 'floor',
	rug: 'floor',
	plant: 'floor',
	picture: 'wall',
	mirror: 'wall',
	curtain: 'wall',
	textile: 'on-top',
	decor: 'on-top',
	electronics: 'on-top',
	other: 'floor'
};

export const CUSTOM_COLORS = [
	'#b8b2a7',
	'#e8e2d6',
	'#8a6a4b',
	'#4a4a4a',
	'#2f5d62',
	'#7a8f6a',
	'#a3503f',
	'#3f6cb5'
] as const;

export type NewItem = Omit<Item, 'id'>;

export function itemFromCatalog(entry: CatalogEntry, roomId: string, name: string): NewItem {
	return {
		roomId,
		catalogId: entry.id,
		name,
		category: entry.category,
		model: entry.model,
		mount: entry.mount,
		dims: { ...entry.dims },
		x: 0,
		y: 0,
		rotation: 0,
		elevation: 0,
		color: entry.colors[0],
		...(entry.power > 0 ? { power: entry.power } : {}),
		...(entry.priceChf !== undefined ? { priceChf: entry.priceChf } : {}),
		...(entry.url ? { url: entry.url } : {})
	};
}

export interface CustomSpec {
	name: string;
	category: ItemCategory;
	dims: Dims;
	color: string;
	priceChf?: number;
	powered?: boolean;
}

export function customItem(spec: CustomSpec, roomId: string): NewItem {
	return {
		roomId,
		name: spec.name,
		category: spec.category,
		model: CATEGORY_MODEL[spec.category],
		mount: CATEGORY_MOUNT[spec.category],
		dims: { ...spec.dims },
		x: 0,
		y: 0,
		rotation: 0,
		elevation: 0,
		color: spec.color,
		...(spec.powered ? { power: 100 } : {}),
		...(spec.priceChf !== undefined ? { priceChf: spec.priceChf } : {})
	};
}

export function itemMount(item: Pick<Item, 'mount' | 'category'>): Mount {
	return item.mount ?? CATEGORY_MOUNT[item.category];
}

export function isCustom(item: Pick<Item, 'catalogId'>): boolean {
	return item.catalogId === undefined;
}
