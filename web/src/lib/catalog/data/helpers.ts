import type { CatalogEntry } from '#lib/core/catalog.ts';
import type { Dims, ItemCategory, ModelType, Mount } from '#lib/core/schema.ts';

export const C = {
	white: '#f4f4f0',
	offWhite: '#e8e4da',
	black: '#222222',
	blackBrown: '#3b3633',
	grey: '#9a9a9a',
	darkGrey: '#555555',
	lightGrey: '#cfcfcf',
	birch: '#d9b98a',
	oak: '#c8a572',
	walnut: '#5c4033',
	beige: '#d8c9a8',
	cream: '#efe6d2',
	green: '#4f7f4a',
	darkGreen: '#2f5d3a',
	terracotta: '#b9694a',
	blue: '#3f5f8a',
	navy: '#24324a',
	red: '#a8382e',
	mustard: '#d4a72c',
	pink: '#d9a5a5',
	brass: '#b59a4a',
	clear: '#d8e4e8'
} as const;

export const cm = (w: number, d: number, h: number): Dims => ({
	w: Math.round(w * 10),
	d: Math.round(d * 10),
	h: Math.round(h * 10)
});

export interface Spec {
	id: string;
	series?: string;
	de: string;
	en: string;
	category: ItemCategory;
	model: ModelType;
	dims: Dims;
	colors: string[];
	mount?: Mount;
	power?: number;
	front?: number;
	side?: number;
	priceChf?: number;
	url?: string;
	articleNo?: string;
	verified?: boolean;
}

function define(brand: string, spec: Spec): CatalogEntry {
	const {
		de,
		en,
		front = 0,
		side = 0,
		mount = 'floor',
		power = 0,
		verified = false,
		...rest
	} = spec;
	return {
		...rest,
		brand,
		name: { de, en },
		mount,
		power,
		clearance: { front, side },
		verified
	};
}

export const ikea = (spec: Spec): CatalogEntry => define('IKEA', spec);
export const tchibo = (spec: Spec): CatalogEntry => define('Tchibo', spec);
export const jysk = (spec: Spec): CatalogEntry => define('JYSK', spec);
export const generic = (spec: Spec): CatalogEntry => define('Generic', spec);
