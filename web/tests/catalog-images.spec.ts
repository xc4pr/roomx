import { catalog } from '#lib/catalog/index.ts';
import { addRoom, createProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';

test('Alle Katalogbilder entstehen ohne Fehler', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Nur Projekt desktop');
	test.setTimeout(150_000);

	const problems: string[] = [];
	page.on('console', (message) => {
		const text = message.text();
		if (message.type() === 'error' || /context lost|webgl.*(error|fail)|INVALID_/i.test(text)) {
			problems.push(`${message.type()}: ${message.text()}`);
		}
	});

	await createProject(page, 'Katalogbilder');
	await addRoom(page);
	await page.getByTestId('seg-furnish').click();
	await expect(page.getByTestId('furnish-screen')).toBeVisible();
	const panel = page.getByTestId('catalog-panel');
	const fab = page.getByTestId('catalog-fab');
	await expect(panel.or(fab)).toHaveCount(1);
	if (!(await panel.isVisible())) await fab.click();
	await expect(panel).toBeVisible();

	const select = panel.locator('select');
	const brands = await select
		.locator('option')
		.evaluateAll((options) =>
			options.map((option) => (option as HTMLOptionElement).value).filter((v) => v !== 'all')
		);
	expect(brands).toContain('JYSK');
	expect(brands).toContain('Tchibo');

	const expected = new Map<string, number>();
	for (const entry of catalog) expected.set(entry.brand, (expected.get(entry.brand) ?? 0) + 1);

	const missingImages = () =>
		page.evaluate(() => {
			const cards = [...document.querySelectorAll('[data-catalog-id]')];
			const missing = cards.filter((card) => !card.querySelector('img'));
			missing[0]?.scrollIntoView({ block: 'center' });
			return missing.length;
		});

	let seen = 0;
	for (const brand of brands) {
		await select.selectOption(brand);
		await expect(panel.locator('[data-catalog-id]')).toHaveCount(expected.get(brand) ?? -1);
		await expect
			.poll(missingImages, { message: `Bilder ${brand}`, timeout: 90_000, intervals: [100] })
			.toBe(0);
		seen += expected.get(brand) ?? 0;
	}
	expect(seen).toBe(catalog.length);

	await select.selectOption('all');
	await expect(panel.locator('[data-catalog-id]')).toHaveCount(catalog.length);
	await expect.poll(missingImages, { timeout: 30_000 }).toBe(0);

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
