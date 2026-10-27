import { createProject, readProject, waitForProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';
import {
	addNamedRoom,
	dockNextTo,
	open3d,
	reloadProject,
	roomsOf,
	selectRoomById,
	slopeWall,
	trackConsole
} from './helpers/raeume.ts';
import { fillNumber } from './helpers/app.ts';

test('Balkon: Geländer an und aus, Höhe, Wohn- und Aussenfläche getrennt', async ({ page }) => {
	const id = await createProject(page, 'Balkon E2E');
	await addNamedRoom(page, id, 'Wohnen', 'living', 4000, 3000);
	await addNamedRoom(page, id, 'Balkon', 'balcony', 4000, 1500);
	const [living, balcony] = roomsOf((await readProject(page, id))!);
	await dockNextTo(page, id, balcony.id, living.id, 'below');

	await selectRoomById(page, balcony.id);
	await expect(page.getByTestId('outdoor-section')).toBeVisible();
	const railing = page.getByRole('switch', { name: 'Geländer' });
	await railing.click();
	let project = await waitForProject(
		page,
		id,
		(p) => roomsOf(p)[1].railing !== undefined,
		'Geländer an'
	);
	const standard = roomsOf(project)[1].railing!.height;
	const room = page.locator(`[data-room-id="${balcony.id}"]`);
	await expect(room.getByTestId('railing-line')).toHaveCount(3);

	await fillNumber(page.getByTestId('railing-height'), '110');
	project = await waitForProject(
		page,
		id,
		(p) => roomsOf(p)[1].railing?.height === 1100,
		'Geländerhöhe 110 cm'
	);
	expect(standard).not.toBe(1100);

	await expect(page.getByTestId('area-living')).toHaveText('12 m²');
	await expect(page.getByTestId('area-outdoor')).toHaveText('6 m²');

	await reloadProject(page);
	expect(roomsOf((await readProject(page, id))!)[1].railing?.height).toBe(1100);
	await selectRoomById(page, balcony.id);
	await page.getByRole('switch', { name: 'Geländer' }).click();
	await waitForProject(page, id, (p) => roomsOf(p)[1].railing === undefined, 'Geländer aus');
	await expect(room.getByTestId('railing-line')).toHaveCount(0);
	await expect(page.getByTestId('railing-height')).toHaveCount(0);
});

test('Wintergarten mit Pultdach: Glaswand im Plan, 3D ohne Fehler', async ({ page }) => {
	const consoleErrors = trackConsole(page);
	const id = await createProject(page, 'Wintergarten E2E');
	await addNamedRoom(page, id, 'Wohnen', 'living', 4000, 3000);
	await addNamedRoom(page, id, 'Wintergarten', 'winterGarden', 3000, 3000);
	const [living, garden] = roomsOf((await readProject(page, id))!);
	await dockNextTo(page, id, garden.id, living.id, 'right');

	await selectRoomById(page, garden.id);
	await expect(
		page.locator(`[data-room-id="${garden.id}"] [data-testid="glass-band"]`)
	).toHaveCount(1);
	await slopeWall(page, 4);
	const project = await waitForProject(
		page,
		id,
		(p) => (roomsOf(p)[1].slopes?.length ?? 0) === 1,
		'Pultdach'
	);
	expect(roomsOf(project)[1].slopes![0].wall).toBe(4);
	await expect(page.getByTestId('area-outdoor')).toHaveText('9 m²');

	await open3d(page);
	expect(consoleErrors).toEqual([]);
});
