import type { Page } from '@playwright/test';
import type { CatalogEntry } from '#lib/core/catalog.ts';
import { ITEM_CATEGORIES } from '#lib/core/schema.ts';

const BRANDS = ['IKEA', 'JYSK', 'Tchibo'] as const;
const MODELS = ['shelf', 'dresser', 'table', 'chair', 'sofa', 'desk'] as const;
const WORDS = ['Alm', 'Bjork', 'Fjall', 'Hav', 'Kalla', 'Lund', 'Nord', 'Ostra', 'Sund', 'Vik'];

export function syntheticEntry(index: number): CatalogEntry {
	const brand = BRANDS[index % BRANDS.length];
	const word = WORDS[index % WORDS.length];
	const category = ITEM_CATEGORIES[index % ITEM_CATEGORIES.length];
	const width = 300 + ((index * 37) % 1900);
	return {
		id: `syn-${brand.toLowerCase()}-${index}`,
		brand,
		series: `${word.toUpperCase()}${index % 97}`,
		name: { de: `${word} Möbel ${index}`, en: `${word} piece ${index}` },
		category,
		model: MODELS[index % MODELS.length],
		dims: { w: width, d: 400 + ((index * 13) % 500), h: 500 + ((index * 29) % 1500) },
		colors: ['#b8b2a7'],
		mount: 'floor',
		power: 0,
		clearance: { front: 600, side: 0 },
		priceChf: 10 + (index % 400),
		url: `https://example.org/${index}`,
		articleNo: `syn${String(index).padStart(7, '0')}`,
		verified: index % 7 === 0
	};
}

export function syntheticCatalog(count: number): CatalogEntry[] {
	return Array.from({ length: count }, (_, index) => syntheticEntry(index));
}

export async function serveSyntheticCatalog(page: Page, count: number): Promise<void> {
	await page.addInitScript(() => {
		if ('serviceWorker' in navigator)
			navigator.serviceWorker.register = () => new Promise(() => {});
	});
	const body = JSON.stringify(syntheticCatalog(count));
	await page.route('**/_app/immutable/assets/full.*.json', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body })
	);
}
