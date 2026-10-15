import { describe, expect, it } from 'vitest';
import { CatalogEntrySchema } from '#lib/core/catalog.ts';
import { ITEM_CATEGORIES } from '#lib/core/schema.ts';
import { prices } from './data/prices.ts';
import { catalog, lookup } from './index.ts';

const requiredIds = [
	'ikea-malm-bed-160x200',
	'generic-desk-160x80',
	'generic-monitor-27',
	'generic-rug-200x300'
];

const poweredModels = ['monitor', 'tv', 'pc', 'printer', 'smallDevice', 'speaker', 'powerStrip'];

describe('catalog', () => {
	it('contains 150 to 280 entries', () => {
		expect(catalog.length).toBeGreaterThanOrEqual(150);
		expect(catalog.length).toBeLessThanOrEqual(280);
	});

	it('passes the entry schema', () => {
		for (const entry of catalog) {
			const result = CatalogEntrySchema.safeParse(entry);
			expect(result.success, entry.id).toBe(true);
		}
	});

	it('has unique ids', () => {
		const ids = catalog.map((entry) => entry.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('contains the required ids', () => {
		for (const id of requiredIds) expect(lookup(id), id).toBeDefined();
	});

	it('covers every item category', () => {
		const present = new Set(catalog.map((entry) => entry.category));
		for (const category of ITEM_CATEGORIES) expect(present.has(category), category).toBe(true);
	});

	it('gives devices at least one power slot', () => {
		for (const entry of catalog.filter((e) => poweredModels.includes(e.model))) {
			expect(entry.power, entry.id).toBeGreaterThanOrEqual(1);
		}
	});

	it('only links verified entries to a manufacturer page', () => {
		for (const entry of catalog) {
			if (entry.url || entry.articleNo) expect(entry.verified, entry.id).toBe(true);
		}
	});

	it('uses https for every manufacturer page', () => {
		for (const entry of catalog) {
			if (entry.url) expect(entry.url.startsWith('https://'), entry.id).toBe(true);
		}
	});

	it('gives at least 95 percent of the non-Tchibo entries a price', () => {
		const regular = catalog.filter((entry) => entry.brand !== 'Tchibo');
		const priced = regular.filter((entry) => (entry.priceChf ?? 0) > 0);
		expect(priced.length / regular.length).toBeGreaterThanOrEqual(0.95);
	});

	it('tags Tchibo entries with the brand and the CN3 series', () => {
		const tchibo = catalog.filter((entry) => entry.id.startsWith('tchibo-'));
		expect(tchibo.length).toBeGreaterThan(0);
		for (const entry of tchibo) {
			expect(entry.brand, entry.id).toBe('Tchibo');
			if (entry.id.startsWith('tchibo-cn3-')) expect(entry.series, entry.id).toBe('CN3');
		}
		for (const entry of catalog.filter((e) => e.brand === 'Tchibo')) {
			expect(entry.id.startsWith('tchibo-'), entry.id).toBe(true);
		}
	});

	it('has no price for unknown ids', () => {
		for (const id of Object.keys(prices)) expect(lookup(id), id).toBeDefined();
	});
});
