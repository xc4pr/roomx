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
	await page.waitForTimeout(1500);
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
