import { createProject, readProject, waitForProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';
import {
	addNamedRoom,
	dockNextTo,
	placeOnSide,
	reloadProject,
	roomsOf,
	selectRoomById
} from './helpers/raeume.ts';

test('Raum auf Terrasse umstellen: Tür wandert in die Küchenwand, Fenster unpassend', async ({
	page
}) => {
	const id = await createProject(page, 'Umstellen E2E');
	await addNamedRoom(page, id, 'Küche', 'kitchen', 4000, 3000);
	await addNamedRoom(page, id, 'Anbau', 'living', 4000, 3000);
	const [kitchen, annex] = roomsOf((await readProject(page, id))!);
	await dockNextTo(page, id, annex.id, kitchen.id, 'right');

	await selectRoomById(page, annex.id);
	await placeOnSide(page, id, annex.id, 'door', 'left', 0.5);
	await placeOnSide(page, id, annex.id, 'window', 'top', 0.5);
	const before = roomsOf((await readProject(page, id))!);
	const door = before[1].elements.find((e) => e.kind === 'door')!;
	const window = before[1].elements.find((e) => e.kind === 'window')!;
	expect(before[0].elements.some((e) => e.id === door.id)).toBe(false);

	await selectRoomById(page, annex.id);
	await page.getByTestId('room-type-terrace').click();
	const after = roomsOf(
		await waitForProject(
			page,
			id,
			(p) => roomsOf(p)[1].type === 'terrace' && roomsOf(p)[0].elements.length > 0,
			'Tür in der Küchenwand'
		)
	);
	expect(after[0].elements.map((e) => e.id)).toContain(door.id);
	expect(after[1].elements.map((e) => e.id)).not.toContain(door.id);
	expect(after[1].elements.map((e) => e.id)).toContain(window.id);
	const moved = after[0].elements.find((e) => e.id === door.id)!;
	expect(moved.wall).toBe(2);

	const toast = page.getByTestId('toast').filter({ hasText: 'Raumtyp' });
	await expect(toast).toContainText('1 Tür oder Fenster ist in die Wand von Küche gewandert');
	await expect(toast).toContainText('Nicht passend zum Raumtyp und markiert: 1');

	await page.getByTestId('tab-elements').click();
	await expect(page.getByTestId('unfit-badge')).toHaveCount(1);
	await expect(page.locator(`[data-row="${window.id}"] [data-testid="unfit-badge"]`)).toHaveText(
		'Passt nicht zum Raumtyp'
	);

	await reloadProject(page);
	const stored = roomsOf((await readProject(page, id))!);
	expect(stored[0].elements.map((e) => e.id)).toContain(door.id);
	expect(stored[1].type).toBe('terrace');
});
