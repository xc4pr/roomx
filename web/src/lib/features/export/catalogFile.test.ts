import { describe, expect, it } from 'vitest';
import { CATALOG_PRICES_AS_OF, catalog } from '#lib/catalog/index.ts';
import { ITEM_CATEGORIES, MOUNTS } from '#lib/core/schema.ts';
import { syntheticCatalog } from '../../../../tests/helpers/syntheticCatalog.ts';
import {
	CATALOG_FORMAT,
	CATALOG_MAX_BYTES,
	catalogJson,
	compactCatalog,
	compactEntry,
	fitCatalog,
	orderForPackage,
	retailerEntries
} from './catalogFile.ts';

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

	it('marks discontinued articles and leaves the field out otherwise', () => {
		const [entry] = syntheticCatalog(1);
		expect(compactEntry({ ...entry, discontinued: true }, 'de').discontinued).toBe(true);
		expect('discontinued' in compactEntry(entry, 'de')).toBe(false);
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
			expect(parsed.notes).toHaveLength(5);
			expect(parsed.items).toEqual(JSON.parse(JSON.stringify(compactCatalog(catalog, language))));
			expect(text.split('\n').filter((line) => line.startsWith('{"id"'))).toHaveLength(
				catalog.length
			);
		}
	);

	it('stays compact', () => {
		expect(catalogJson(catalog, 'de').length).toBeLessThan(200_000);
	});
});

describe('package excerpt', () => {
	const curated = catalog.slice(0, 20);
	const extra = syntheticCatalog(6000);

	it('keeps only the retailers of the brief, IKEA when none is named', () => {
		expect(new Set(retailerEntries(extra, undefined).map((e) => e.brand))).toEqual(
			new Set(['IKEA'])
		);
		expect(new Set(retailerEntries(extra, ['jysk', 'Tchibo']).map((e) => e.brand))).toEqual(
			new Set(['JYSK', 'Tchibo'])
		);
	});

	it('orders curated before verified before the rest, then category and price', () => {
		const ordered = orderForPackage(curated, extra.slice(0, 200));
		expect(ordered.slice(0, curated.length)).toEqual(curated);
		const rest = ordered.slice(curated.length);
		const firstUnverified = rest.findIndex((entry) => !entry.verified);
		expect(rest.slice(0, firstUnverified).every((entry) => entry.verified)).toBe(true);
		const group = rest.slice(firstUnverified);
		for (let i = 1; i < group.length; i += 1) {
			const a = group[i - 1];
			const b = group[i];
			const byCategory = a.category.localeCompare(b.category);
			expect(byCategory < 0 || (byCategory === 0 && a.priceChf! <= b.priceChf!)).toBe(true);
		}
	});

	it.each(['de', 'en'] as const)('never exceeds the byte limit (%s)', (language) => {
		const ordered = orderForPackage(catalog, extra);
		const fitted = fitCatalog(ordered, language);
		expect(fitted.excerpt).toEqual({ total: ordered.length });
		expect(fitted.entries.length).toBeLessThan(ordered.length);
		expect(fitted.entries.slice(0, catalog.length)).toEqual(catalog);
		const bytes = new TextEncoder().encode(
			catalogJson(fitted.entries, language, fitted.excerpt)
		).length;
		expect(bytes).toBeLessThanOrEqual(CATALOG_MAX_BYTES);
		expect(bytes).toBeGreaterThan(CATALOG_MAX_BYTES * 0.97);
		const parsed = JSON.parse(catalogJson(fitted.entries, language, fitted.excerpt));
		expect(parsed.excerpt).toBe(true);
		expect(parsed.count).toBe(fitted.entries.length);
		expect(parsed.notes.at(-1)).toContain(String(ordered.length));
	});

	it('also holds for a tight limit and marks nothing when everything fits', () => {
		const ordered = orderForPackage(curated, extra.slice(0, 50));
		expect(fitCatalog(ordered, 'de').excerpt).toBeUndefined();
		for (const limit of [20_000, 50_000]) {
			const fitted = fitCatalog(ordered, 'de', limit);
			const bytes = new TextEncoder().encode(
				catalogJson(fitted.entries, 'de', fitted.excerpt)
			).length;
			expect(bytes).toBeLessThanOrEqual(limit);
		}
	});
});
