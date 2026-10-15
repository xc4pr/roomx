import type { Locator, Page } from '@playwright/test';
import { lookup } from '#lib/catalog/index.ts';

export async function catalogCard(page: Page, id: string): Promise<Locator> {
	const entry = lookup(id);
	if (!entry) throw new Error(`${id} is not in the catalog`);
	await page.getByTestId('catalog-search').fill(entry.articleNo ?? entry.name.de);
	return page.locator(`[data-catalog-id="${id}"]`);
}

// Serves an empty full catalogue so that a test covers exactly the curated catalogue. Needs blocked service workers.
export async function withoutFullCatalog(page: Page): Promise<void> {
	await page.route(/\/full[.-][^/]*\.json(\?|$)/, (route) => route.fulfill({ json: [] }));
}
