import { describe, expect, it } from 'vitest';
import { catalog } from '#lib/catalog/index.ts';
import { catalogLookup, type CatalogEntry } from '#lib/core/catalog.ts';
import { sampleCatalog } from '#lib/core/fixtures.ts';
import type { ItemCategory } from '#lib/core/schema.ts';
import { groupShopping } from './shopping.ts';
import {
	brandsOf,
	categoriesOf,
	collapsedCategories,
	filterCatalog,
	kitchenFromCatalog,
	normalizeText,
	orderCategories
} from './filter.ts';

const all = { category: 'all', brand: 'all' } as const;

describe('filterCatalog', () => {
	it('matches name in both languages, series and brand', () => {
		expect(
			filterCatalog(sampleCatalog, { ...all, query: 'schreibtisch' }, 'de').map((e) => e.id)
		).toEqual(['generic-desk-160x80']);
		expect(filterCatalog(sampleCatalog, { ...all, query: 'desk' }, 'de').map((e) => e.id)).toEqual([
			'generic-desk-160x80'
		]);
		expect(filterCatalog(sampleCatalog, { ...all, query: 'malm' }, 'en').map((e) => e.id)).toEqual([
			'ikea-malm-bed-160x200'
		]);
		expect(filterCatalog(sampleCatalog, { ...all, query: 'ikea' }, 'en')).toHaveLength(1);
	});

	it('requires every token and ignores case and accents', () => {
		expect(filterCatalog(sampleCatalog, { ...all, query: 'MALM bett' }, 'de')).toHaveLength(1);
		expect(filterCatalog(sampleCatalog, { ...all, query: 'malm schreibtisch' }, 'de')).toHaveLength(
			0
		);
		expect(normalizeText('Küche Été')).toBe('kuche ete');
	});

	it('filters by category and brand', () => {
		expect(
			filterCatalog(sampleCatalog, { query: '', category: 'rug', brand: 'all' }, 'de')
		).toHaveLength(1);
		expect(
			filterCatalog(sampleCatalog, { query: '', category: 'all', brand: 'IKEA' }, 'de')
		).toHaveLength(1);
	});

	it('lists brands and category counts', () => {
		expect(brandsOf(sampleCatalog)).toEqual(['Generic', 'IKEA']);
		expect(categoriesOf(sampleCatalog).get('bed')).toBe(1);
	});

	it('works on the real catalogue', () => {
		expect(filterCatalog(catalog, { ...all, query: 'billy' }, 'de').length).toBeGreaterThan(0);
	});
});

describe('retailer brand JYSK', () => {
	const jysk: CatalogEntry = {
		...sampleCatalog[1],
		id: 'jysk-test-desk',
		brand: 'JYSK',
		url: 'https://jysk.ch/test'
	};
	const withJysk = [...sampleCatalog, jysk];

	it('appears in the brand filter and can be filtered', () => {
		expect(brandsOf(withJysk)).toEqual(['Generic', 'IKEA', 'JYSK']);
		expect(
			filterCatalog(withJysk, { ...all, query: '', brand: 'JYSK' }, 'de').map((e) => e.id)
		).toEqual(['jysk-test-desk']);
	});

	it('shows the link in the shopping list', () => {
		const rows = groupShopping(
			[
				{
					id: 'i',
					roomId: 'r',
					name: 'Tisch',
					category: 'desk',
					dims: { w: 1, d: 1, h: 1 },
					x: 0,
					y: 0,
					rotation: 0,
					elevation: 0,
					catalogId: 'jysk-test-desk'
				}
			],
			catalogLookup(withJysk),
			(i) => i.name
		);
		expect(rows[0]).toMatchObject({ brand: 'JYSK', url: 'https://jysk.ch/test' });
	});
});

describe('collapsedCategories', () => {
	const available = ['bed', 'sofa', 'plant', 'table', 'chair', 'desk'] as const;

	it('lists the most common available categories in fixed order', () => {
		expect(collapsedCategories(available, 'all')).toEqual(['sofa', 'bed', 'table']);
	});

	it('keeps the selected category first and within the limit', () => {
		expect(collapsedCategories(available, 'plant')).toEqual(['plant', 'sofa', 'bed']);
		expect(collapsedCategories(available, 'sofa')).toEqual(['sofa', 'bed', 'table']);
	});

	it('ignores categories that are not available', () => {
		expect(collapsedCategories(['lamp'], 'desk')).toEqual(['lamp']);
	});
});

describe('kitchen category order', () => {
	const all: ItemCategory[] = ['bed', 'kitchen', 'sofa', 'table'];

	it('puts the kitchen first for a catalogue kitchen and last otherwise', () => {
		expect(orderCategories(all, true)).toEqual(['kitchen', 'bed', 'sofa', 'table']);
		expect(orderCategories(all, false)).toEqual(['bed', 'sofa', 'table', 'kitchen']);
		expect(orderCategories(['bed', 'sofa'], true)).toEqual(['bed', 'sofa']);
	});

	it('detects a catalogue kitchen only where a kitchen exists', () => {
		expect(kitchenFromCatalog({ type: 'kitchen', kitchen: { mode: 'catalog' } })).toBe(true);
		expect(kitchenFromCatalog({ type: 'kitchen', kitchen: { mode: 'builtin' } })).toBe(false);
		expect(kitchenFromCatalog({ type: 'kitchen' })).toBe(false);
		expect(kitchenFromCatalog({ type: 'living', kitchen: { mode: 'catalog' } })).toBe(false);
		expect(kitchenFromCatalog({ type: 'living', kitchen: { open: true, mode: 'catalog' } })).toBe(
			true
		);
		expect(kitchenFromCatalog(undefined)).toBe(false);
	});

	it('pins the kitchen in the collapsed list', () => {
		expect(collapsedCategories(all, 'all', 3, 'kitchen')).toEqual(['kitchen', 'sofa', 'bed']);
		expect(collapsedCategories(all, 'all')).not.toContain('kitchen');
	});
});
