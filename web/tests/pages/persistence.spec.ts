import {
	addPhoto,
	addRoom,
	createProject,
	expect,
	readProject,
	skipTour,
	startPage,
	test
} from './helpers.ts';

test('Projekt, Raum und Foto überstehen einen Neustart', async ({ newProfile }) => {
	const profile = newProfile();
	const first = await profile.open();
	const page = await startPage(first);
	await skipTour(page);
	const id = await createProject(page, 'Neustart');
	await addRoom(page);
	await addPhoto(page);
	await expect
		.poll(async () => {
			const project = await readProject(page, id);
			return `${project?.rooms.length}/${project?.rooms[0]?.photos.length}`;
		})
		.toBe('1/1');
	await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const shell = new URL((await navigator.serviceWorker.ready).scope).pathname;
				const name = (await caches.keys()).find((key) => key.startsWith('roomx-'));
				if (!name) return false;
				const cache = await caches.open(name);
				return (await cache.match(shell)) !== undefined;
			})
		)
		.toBe(true);
	await first.close();

	const second = await profile.open();
	const again = await startPage(second);
	await again.goto('./');
	await expect(again.getByTestId('project-card')).toContainText('Neustart');
	await again.goto(`p/${id}`);
	await expect(again.getByTestId('board')).toBeVisible();
	await expect.poll(async () => (await readProject(again, id))?.rooms.length).toBe(1);
	const stored = (await readProject(again, id))!;
	expect(stored.rooms[0].photos).toHaveLength(1);

	await again.waitForTimeout(500);
	const box = (await again.getByTestId('board').boundingBox())!;
	await again.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	const tour = again.getByTestId('tour-close');
	if (await tour.isVisible()) await tour.click();
	await again.getByTestId('tab-photos').click();
	const tile = again.getByTestId('photo-tile').first();
	await expect(tile).toBeVisible();
	await expect
		.poll(() =>
			tile.locator('img').evaluate((img) => (img as HTMLImageElement).naturalWidth, undefined, {
				timeout: 2000
			})
		)
		.toBeGreaterThan(0);
	await tile.click();
	const full = again.getByTestId('photo-full');
	await expect(full).toBeVisible();
	await expect
		.poll(() => full.evaluate((img) => (img as HTMLImageElement).naturalWidth))
		.toBeGreaterThan(0);
});

test('Der Service Worker fällt bei abgelehntem Cache aufs Netz zurück', async ({
	newProfile,
	browserName
}) => {
	test.skip(
		browserName !== 'chromium',
		'Das Skript des Service Workers lässt sich nur in Chromium abfangen'
	);
	const context = await newProfile().open();
	// After activation, Cache Storage rejects like WebKit's "Internal error" after a profile restart.
	await context.route('**/service-worker.js', async (route) => {
		const response = await route.fetch();
		const patch = `const open = CacheStorage.prototype.open;
let broken = false;
CacheStorage.prototype.open = function (name) {
	return broken ? Promise.reject(new TypeError('Internal error')) : open.call(this, name);
};
addEventListener('activate', () => { broken = true; });
`;
		await route.fulfill({ response, body: patch + (await response.text()) });
	});
	const page = await startPage(context);
	await skipTour(page);
	await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
	await page.reload();
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);

	const response = await page.goto('./');
	expect(response?.ok()).toBe(true);
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
