import { catalog } from '#lib/catalog/index.ts';
import { filterCatalog } from '../src/lib/features/furnish/filter.ts';
import { addRoom, createProject, readProject, waitForProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';
import { serveSyntheticCatalog, syntheticCatalog } from './helpers/syntheticCatalog.ts';

const COUNT = 6000;

test('Der grosse Katalog lädt, scrollt bis ans Ende, findet Artikel und liefert Möbel für 3D', async ({
	page
}) => {
	await serveSyntheticCatalog(page, COUNT);
	const entries = syntheticCatalog(COUNT);
	const started = Date.now();
	const id = await createProject(page, 'Grosser Katalog');
	await addRoom(page);
	await page.getByTestId('seg-furnish').click();
	await expect(page.getByTestId('furnish-screen')).toBeVisible();

	const panel = page.getByTestId('catalog-panel');
	const fab = page.getByTestId('catalog-fab');
	await expect(panel.or(fab)).toHaveCount(1);
	if (!(await panel.isVisible())) await fab.click();
	await expect(panel).toBeVisible();
	console.log(`katalog bereit nach ${Date.now() - started} ms`);

	const grid = page.getByTestId('virtual-grid');
	await expect(panel.getByText(/Artikel/).first()).toContainText(/\d{3,}/);
	const rendered = Number(await grid.getAttribute('data-rendered'));
	expect(rendered).toBeGreaterThan(0);
	expect(rendered).toBeLessThan(60);

	const ordered = filterCatalog(
		[...catalog, ...entries],
		{ query: '', category: 'all', brand: 'all', width: 'all' },
		'de'
	);
	const last = ordered.at(-1)!;
	await grid.evaluate((element) => {
		let node: HTMLElement | null = element.parentElement;
		while (node && !['auto', 'scroll'].includes(getComputedStyle(node).overflowY)) {
			node = node.parentElement;
		}
		const scroller = node ?? document.scrollingElement!;
		scroller.scrollTop = scroller.scrollHeight;
	});
	await expect(page.locator(`[data-catalog-id="${last.id}"]`)).toBeVisible();
	expect(Number(await grid.getAttribute('data-rendered'))).toBeLessThan(60);

	const target = entries[4321];
	await page.getByTestId('catalog-search').fill(target.articleNo!);
	const card = page.locator(`[data-catalog-id="${target.id}"]`);
	await expect(card).toBeVisible();
	await expect(page.locator('[data-catalog-id]')).toHaveCount(1);
	await card.click();
	const project = await waitForProject(
		page,
		id,
		(p) =>
			(p.variants.find((variant) => variant.id === p.activeVariantId)?.items.length ?? 0) === 1,
		'Möbel aus dem grossen Katalog'
	);
	const item = project.variants.find((variant) => variant.id === project.activeVariantId)!.items[0];
	expect(item.catalogId).toBe(target.id);
	expect(item.dims).toEqual(target.dims);

	await page.getByTestId('furnish-screen').getByTestId('seg-3d').click();
	await expect(page.getByTestId('canvas3d')).toBeVisible();
	expect((await readProject(page, id))?.variants.length).toBeGreaterThan(0);
});
