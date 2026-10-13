import { addRoom, createProject, projectIdOf, readProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';

test('Service Worker, Offline-Start und Deep-Links', async ({ page, context }) => {
	const id = await createProject(page, 'Offline-Wohnung');
	await addRoom(page);
	await expect.poll(async () => (await readProject(page, id))?.rooms.length).toBe(1);

	await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
	await expect
		.poll(async () =>
			page.evaluate(async () => {
				const names = await caches.keys();
				const sizes = await Promise.all(
					names.map(async (name) => (await (await caches.open(name)).keys()).length)
				);
				return sizes.reduce((sum, size) => sum + size, 0);
			})
		)
		.toBeGreaterThan(20);
	await page.reload();
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);

	await context.setOffline(true);

	const start = await page.goto('/');
	expect(start?.fromServiceWorker()).toBe(true);
	await expect(page.getByTestId('project-card')).toContainText('Offline-Wohnung');

	const plan = await page.goto(`/p/${id}`);
	expect(plan?.fromServiceWorker()).toBe(true);
	await expect(page.getByTestId('board')).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Offline-Wohnung');
	expect(projectIdOf(page)).toBe(id);
	await expect.poll(async () => (await readProject(page, id))?.rooms.length).toBe(1);

	const view = await page.goto(`/p/${id}/3d`);
	expect(view?.fromServiceWorker()).toBe(true);
	await expect(page.getByTestId('canvas3d')).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Offline-Wohnung');

	await page.reload();
	await expect(page.getByTestId('canvas3d')).toBeVisible();

	await page.goto(`/p/${id}/furnish`);
	await expect(page.getByTestId('furnish-screen')).toBeVisible();

	await context.setOffline(false);
});

test('Offline erstellte Änderungen bleiben nach Neustart erhalten', async ({ page, context }) => {
	const id = await createProject(page, 'Lokal');
	await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
	await page.reload();
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);

	await context.setOffline(true);
	await page.reload();
	await addRoom(page);
	await expect.poll(async () => (await readProject(page, id))?.rooms.length).toBe(1);
	await page.goto('/');
	await expect(page.getByTestId('project-card')).toContainText('Lokal');
	await page.reload();
	await expect(page.getByTestId('project-card')).toHaveCount(1);
	await context.setOffline(false);
});

test('Manifest, Icons und Meta-Tags', async ({ page, request }) => {
	await page.goto('/');

	const href = await page.locator('link[rel="manifest"]').getAttribute('href');
	expect(href).toBeTruthy();
	const response = await request.get(href!);
	expect(response.ok()).toBe(true);
	const manifest = await response.json();
	expect(manifest.name).toBeTruthy();
	expect(manifest.short_name).toBeTruthy();
	expect(manifest.display).toBe('standalone');
	expect(manifest.start_url).toBeTruthy();

	const icons = manifest.icons as { src: string; sizes: string; purpose?: string; type?: string }[];
	expect(icons.some((icon) => icon.sizes === '192x192')).toBe(true);
	expect(icons.some((icon) => icon.sizes === '512x512' && !icon.purpose)).toBe(true);
	expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
	for (const icon of icons) {
		const file = await request.get(icon.src);
		expect(file.ok(), icon.src).toBe(true);
		expect(file.headers()['content-type']).toContain('image/png');
	}

	const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
	expect(touchIcon).toBeTruthy();
	expect((await request.get(touchIcon!)).ok()).toBe(true);

	const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
	expect(viewport).toContain('viewport-fit=cover');
	await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
		'content',
		'yes'
	);
	await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', /#/);
});
