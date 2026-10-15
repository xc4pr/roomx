import { addRoom, createProject, expect, skipTour, startPage, test } from './helpers.ts';

test('Der Katalog liegt im Service Worker und lädt offline', async ({ newProfile }) => {
	const context = await newProfile().open();
	const page = await startPage(context);
	await skipTour(page);
	const id = await createProject(page, 'Katalog offline');
	await addRoom(page);

	await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
	await page.reload();
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);

	const handle = await page.waitForFunction(async () => {
		for (const name of await caches.keys()) {
			const cache = await caches.open(name);
			for (const request of await cache.keys()) {
				if (/\/full\.[^/]+\.json$/.test(request.url)) return request.url;
			}
		}
		return null;
	});
	const url = (await handle.jsonValue()) as string;

	const timing = await page.evaluate(() =>
		performance
			.getEntriesByType('resource')
			.filter((entry) => /\/full\.[^/]+\.json$/.test(entry.name))
			.map((entry) => Math.round(entry.duration))
	);
	console.log(`ladezeit full.json (ms): ${timing.join(', ')}`);

	await context.setOffline(true);
	await page.goto(`p/${id}/furnish`);
	await expect(page.getByTestId('furnish-screen')).toBeVisible();
	const panel = page.getByTestId('catalog-panel');
	const fab = page.getByTestId('catalog-fab');
	await expect(panel.or(fab)).toHaveCount(1);
	if (!(await panel.isVisible())) await fab.click();
	await expect(panel).toBeVisible();

	const result = await page.evaluate(async (target) => {
		const list: unknown = await (await fetch(target)).json();
		return Array.isArray(list) ? list.length : -1;
	}, url);
	expect(result).toBeGreaterThanOrEqual(0);
	console.log(`offline: ${result} Einträge im Cache`);
	await expect(panel.locator('[data-catalog-id]').first()).toBeVisible();
	await context.setOffline(false);
});
