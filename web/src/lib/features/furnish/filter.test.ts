import { describe, expect, it } from 'vitest';
import { catalog } from '#lib/catalog/index.ts';
import { sampleCatalog } from '#lib/core/fixtures.ts';
import { brandsOf, categoriesOf, filterCatalog, normalizeText } from './filter.ts';

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
