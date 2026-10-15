import {
	addRoom,
	createProject,
	expect,
	projectIdOf,
	readProject,
	skipTour,
	startPage,
	test
} from './helpers.ts';

test('Nach der Installation des Service Workers läuft die App offline', async ({
	newProfile,
	browserName
}) => {
	const context = await newProfile().open();
	const page = await startPage(context);
	await skipTour(page);
	const id = await createProject(page, 'Offline-Wohnung');
	await addRoom(page);
	await expect.poll(async () => (await readProject(page, id))?.rooms.length).toBe(1);

	await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
	await page.reload();
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);
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

	await context.setOffline(true);

	const start = await page.goto('./');
	if (browserName === 'chromium') expect(start?.fromServiceWorker()).toBe(true);
	await expect(page.getByTestId('project-card')).toContainText('Offline-Wohnung');

	await page.goto(`p/${id}`);
	await expect(page.getByTestId('board')).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Offline-Wohnung');
	expect(projectIdOf(page)).toBe(id);

	await page.goto(`p/${id}/3d`);
	await expect(page.getByTestId('canvas3d')).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Offline-Wohnung');

	await page.reload();
	await expect(page.getByTestId('canvas3d')).toBeVisible();

	await context.setOffline(false);
});
