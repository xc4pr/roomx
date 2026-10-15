import { catalog } from '#lib/catalog/index.ts';
import { addRoom, createProject } from './helpers/app.ts';
import { withoutFullCatalog } from './helpers/catalog.ts';
import { test, expect } from './helpers/fixtures.ts';

test.use({ serviceWorkers: 'block' });

test('Alle Bilder des kuratierten Katalogs entstehen ohne Fehler', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Nur Projekt desktop');
	test.setTimeout(150_000);

	const problems: string[] = [];
	page.on('console', (message) => {
		const text = message.text();
		if (message.type() === 'error' || /context lost|webgl.*(error|fail)|INVALID_/i.test(text)) {
			problems.push(`${message.type()}: ${message.text()}`);
		}
	});

	await withoutFullCatalog(page);
	await createProject(page, 'Katalogbilder');
	await addRoom(page);
	await page.getByTestId('seg-furnish').click();
	await expect(page.getByTestId('furnish-screen')).toBeVisible();
	const panel = page.getByTestId('catalog-panel');
	const fab = page.getByTestId('catalog-fab');
	await expect(panel.or(fab)).toHaveCount(1);
	if (!(await panel.isVisible())) await fab.click();
	await expect(panel).toBeVisible();

	const select = panel.getByLabel('Marke');
	const brands = await select
		.locator('option')
		.evaluateAll((options) =>
			options.map((option) => (option as HTMLOptionElement).value).filter((v) => v !== 'all')
		);
	expect(brands).toContain('JYSK');
	expect(brands).toContain('Tchibo');

	const expected = new Map<string, number>();
	for (const entry of catalog) expected.set(entry.brand, (expected.get(entry.brand) ?? 0) + 1);

	const view = () =>
		page.evaluate(() => {
			const grid = document.querySelector('[data-testid="virtual-grid"]') as HTMLElement;
			let scroller: HTMLElement | null = grid.parentElement;
			while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY)) {
				scroller = scroller.parentElement;
			}
			const area = (scroller ?? document.documentElement).getBoundingClientRect();
			const cards = [...document.querySelectorAll('[data-catalog-id]')].filter((card) => {
				const rect = card.getBoundingClientRect();
				return rect.bottom > area.top && rect.top < area.bottom;
			});
			return {
				ids: cards.map((card) => (card as HTMLElement).dataset.catalogId as string),
				missing: cards.filter((card) => !card.querySelector('img')).length
			};
		});

	const scrollBy = (fraction: number) =>
		page.evaluate((amount) => {
			const grid = document.querySelector('[data-testid="virtual-grid"]') as HTMLElement;
			let scroller: HTMLElement | null = grid.parentElement;
			while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY)) {
				scroller = scroller.parentElement;
			}
			const target = scroller ?? document.documentElement;
			if (amount === 0) {
				target.scrollTop = 0;
				return false;
			}
			const before = target.scrollTop;
			target.scrollTop += target.clientHeight * amount;
			return target.scrollTop === before;
		}, fraction);

	const sweep = async (label: string): Promise<number> => {
		const seen = new Set<string>();
		await scrollBy(0);
		for (;;) {
			await expect
				.poll(async () => (await view()).missing, {
					message: `Bilder ${label}`,
					timeout: 90_000,
					intervals: [100]
				})
				.toBe(0);
			for (const id of (await view()).ids) seen.add(id);
			if (await scrollBy(0.8)) break;
		}
		return seen.size;
	};

	let seen = 0;
	for (const brand of brands) {
		await select.selectOption(brand);
		const count = await sweep(brand);
		expect(count, brand).toBe(expected.get(brand) ?? -1);
		seen += count;
	}
	expect(seen).toBe(catalog.length);

	await select.selectOption('all');
	expect(await sweep('alle')).toBe(catalog.length);

	const broken = await page.evaluate(() =>
		[...document.querySelectorAll('[data-catalog-id] img')]
			.filter((image) => {
				const img = image as HTMLImageElement;
				return !img.complete || img.naturalWidth === 0;
			})
			.map((image) => (image.closest('[data-catalog-id]') as HTMLElement).dataset.catalogId)
	);
	expect(broken, 'Bilder nicht geladen').toEqual([]);
	expect(problems, 'Konsolenfehler').toEqual([]);
});
