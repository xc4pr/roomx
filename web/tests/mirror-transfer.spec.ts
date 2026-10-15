import {
	closeCapture,
	createJob,
	expect,
	jobDialogStatus,
	openLink,
	openProject,
	openRoomCapture,
	photosOf,
	prepareProject,
	readProject,
	countStore,
	takePhotos,
	test,
	waitForProject
} from './mirror/helpers.ts';

test('Glücklicher Weg: Auftrag, Handy fotografiert, Fotos kommen am Raum an', async ({
	world,
	browserName
}) => {
	test.setTimeout(150_000);
	const desktop = await world.desktop();
	const { id } = await prepareProject(desktop);
	const link = await createJob(desktop);
	expect(link).toMatch(/^https?:\/\/127\.0\.0\.1:\d+\/#pair=/);

	const phone = await world.phone();
	const jobId = await openLink(phone, link);
	expect(jobId.length).toBeGreaterThan(8);
	await openRoomCapture(phone, 'now');
	const captions = await takePhotos(phone, 2, browserName);
	await closeCapture(phone);

	await expect(jobDialogStatus(desktop)).toContainText('2 Fotos angekommen', { timeout: 45_000 });
	const project = await waitForProject(desktop, id, (p) => photosOf(p).length === 2, 'zwei Fotos');
	const photos = photosOf(project);
	expect(new Set(photos.map((photo) => photo.stepKey)).size).toBe(2);
	expect(photos.map((photo) => photo.caption).sort()).toEqual([...captions].sort());
	const elementIds = project.rooms[0].elements.map((element) => element.id);
	for (const photo of photos) {
		expect(photo.stepKey).toBeTruthy();
		if (photo.stepKey!.startsWith('element:')) {
			expect(elementIds).toContain(photo.stepKey!.slice('element:'.length));
		}
	}

	await expect(phone.getByTestId('camera-status')).toContainText('Alle Fotos übertragen', {
		timeout: 30_000
	});
	await expect.poll(() => countStore(phone, 'mirrorShots')).toBe(0);
	await expect(phone.getByTestId('camera-room-0')).not.toContainText('noch auf dem Handy');
});

test('Später: Handy fotografiert ohne offenes Projekt, PC holt die Fotos beim Öffnen', async ({
	world,
	browserName
}) => {
	test.setTimeout(150_000);
	const desktop = await world.desktop();
	const { id } = await prepareProject(desktop);
	const link = await createJob(desktop);
	const reopened = await world.newDesktopPage(desktop);
	await desktop.close();
	await reopened.goto('/');
	await expect(reopened.getByTestId('project-card')).toHaveCount(1);

	const phone = await world.phone();
	await openLink(phone, link);
	await openRoomCapture(phone, 'later');
	await takePhotos(phone, 2, browserName);
	await closeCapture(phone);
	await expect(phone.getByTestId('camera-room-0')).toContainText('2');
	await expect.poll(() => countStore(phone, 'mirrorShots')).toBe(2);
	expect(photosOf(await readProject(reopened, id))).toHaveLength(0);

	await openProject(reopened, id);
	await expect(phone.getByTestId('camera-status')).toContainText('Alle Fotos übertragen', {
		timeout: 45_000
	});
	await waitForProject(reopened, id, (p) => photosOf(p).length === 2, 'Fotos angekommen');
	await expect.poll(() => countStore(phone, 'mirrorShots')).toBe(0);
});

test('Abbruch und Fortsetzen: nach dem ersten Foto schliesst der PC, der Rest kommt ohne Duplikate', async ({
	world,
	browserName
}) => {
	test.setTimeout(180_000);
	const desktop = await world.desktop();
	const { id } = await prepareProject(desktop);
	const link = await createJob(desktop);

	const phone = await world.phone();
	await openLink(phone, link);
	await openRoomCapture(phone, 'now');
	await expect(phone.getByTestId('camera-status')).toContainText('Verbunden', { timeout: 45_000 });
	const first = await takePhotos(phone, 1, browserName, 10);
	await waitForProject(desktop, id, (p) => photosOf(p).length === 1, 'erstes Foto');

	const spare = await world.newDesktopPage(desktop);
	await desktop.close();
	const rest = await takePhotos(phone, 2, browserName, 100);
	await closeCapture(phone);
	await expect.poll(() => countStore(phone, 'mirrorShots')).toBe(2);
	await spare.goto('/');
	expect(photosOf(await readProject(spare, id))).toHaveLength(1);

	await openProject(spare, id);
	const project = await waitForProject(spare, id, (p) => photosOf(p).length === 3, 'drei Fotos');
	const photos = photosOf(project);
	expect(new Set(photos.map((photo) => photo.hash)).size).toBe(3);
	expect(new Set(photos.map((photo) => photo.stepKey)).size).toBe(3);
	expect(photos.map((photo) => photo.caption).sort()).toEqual([...first, ...rest].sort());
	await expect(phone.getByTestId('camera-status')).toContainText('Alle Fotos übertragen', {
		timeout: 45_000
	});
	await expect.poll(() => countStore(phone, 'mirrorShots')).toBe(0);
	await spare.waitForTimeout(2000);
	expect(photosOf(await readProject(spare, id))).toHaveLength(3);
});
