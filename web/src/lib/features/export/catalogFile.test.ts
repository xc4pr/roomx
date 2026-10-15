import { describe, expect, it } from 'vitest';
import { CATALOG_PRICES_AS_OF, catalog } from '#lib/catalog/index.ts';
import { ITEM_CATEGORIES, MOUNTS } from '#lib/core/schema.ts';
import { CATALOG_FORMAT, catalogJson, compactCatalog, compactEntry } from './catalogFile.ts';

describe('compact catalog', () => {
	it('keeps only the planning fields and the name in the chosen language', () => {
		const entry = catalog.find((candidate) => candidate.id === 'ikea-malm-bed-160x200')!;
		expect(compactEntry(entry, 'de')).toEqual({
			id: 'ikea-malm-bed-160x200',
			brand: 'IKEA',
			series: 'MALM',
			name: entry.name.de,
			category: 'bed',
			dims: entry.dims,
			colors: entry.colors,
			mount: 'floor',
			power: 0,
			clearance: entry.clearance,
			priceChf: entry.priceChf,
			verified: entry.verified
		});
		expect(compactEntry(entry, 'en').name).toBe(entry.name.en);
		expect(Object.keys(compactEntry(entry, 'en')).sort()).toEqual(
			[
				'brand',
				'category',
				'clearance',
				'colors',
				'dims',
				'id',
				'mount',
				'name',
				'power',
				'priceChf',
				'series',
				'verified'
			].sort()
		);
	});

	it('leaves out empty optional fields and stays free of model, url and article number', () => {
		const rows = compactCatalog(catalog, 'de');
		expect(rows).toHaveLength(catalog.length);
		for (const row of rows) {
			expect('model' in row).toBe(false);
			expect('url' in row).toBe(false);
			expect('articleNo' in row).toBe(false);
			expect(ITEM_CATEGORIES).toContain(row.category);
			expect(MOUNTS).toContain(row.mount);
			expect(row.dims.w).toBeGreaterThan(0);
			expect(row.colors.length).toBeGreaterThan(0);
			if (row.series === undefined) expect('series' in row).toBe(false);
			if (row.priceChf === undefined) expect('priceChf' in row).toBe(false);
		}
	});
});

describe('catalogJson', () => {
	it.each(['de', 'en'] as const)(
		'is valid JSON with a header and one row per article (%s)',
		(language) => {
			const text = catalogJson(catalog, language);
			const parsed = JSON.parse(text);
			expect(parsed.format).toBe(CATALOG_FORMAT);
			expect(parsed.language).toBe(language);
			expect(parsed.units).toBe('mm');
			expect(parsed.currency).toBe('CHF');
			expect(parsed.pricesAsOf).toBe(CATALOG_PRICES_AS_OF);
			expect(parsed.count).toBe(catalog.length);
			expect(parsed.notes).toHaveLength(4);
			expect(parsed.items).toEqual(JSON.parse(JSON.stringify(compactCatalog(catalog, language))));
			expect(text.split('\n').filter((line) => line.startsWith('{"id"'))).toHaveLength(
				catalog.length
			);
		}
	);

	it('stays compact', () => {
		expect(catalogJson(catalog, 'de').length).toBeLessThan(120_000);
	});
});
