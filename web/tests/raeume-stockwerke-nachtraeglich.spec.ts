import { createProject, readProject, waitForProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';
import {
	addNamedRoom,
	floorsOf,
	roomFloor,
	roomsOf,
	selectRoomById,
	showFloor
} from './helpers/raeume.ts';

test('Stockwerke nachträglich: einschalten, Raum verschieben, Ausschalten gesperrt', async ({
	page
}) => {
	const id = await createProject(page, 'Nachträglich E2E');
	await addNamedRoom(page, id, 'Küche', 'kitchen', 4000, 3000);
	await addNamedRoom(page, id, 'Zimmer', 'bedroom', 4000, 3000);
	await expect(page.getByTestId('floor-switcher')).toHaveCount(0);
	await expect(page.getByTestId('room-floor')).toHaveCount(0);

	await page.getByTestId('project-settings').click();
	const dialog = page.getByTestId('floors-dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('switch', { name: /Mehrere Stockwerke/ }).click();
	let project = await waitForProject(page, id, (p) => floorsOf(p).length === 2, 'Stockwerke an');
	const [first] = floorsOf(project);
	expect(first.name).toBe('EG');
	expect(roomsOf(project).map((room) => roomFloor(room) ?? first.id)).toEqual([first.id, first.id]);
	await expect(dialog.getByRole('switch', { name: /Mehrere Stockwerke/ })).toBeEnabled();

	// The chip sits below the fold of the scrolling dialog body; WebKit's actionability scroll
	// leaves it 1 px clipped on iPad landscape, so the click is dispatched to the button itself.
	await dialog.getByRole('button', { name: 'DG' }).dispatchEvent('click');
	project = await waitForProject(page, id, (p) => floorsOf(p).length === 3, 'Stockwerk DG');
	expect(floorsOf(project).map((floor) => floor.name)).toEqual(['EG', '1. OG', 'DG']);
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(page.getByTestId('floor-switcher')).toBeVisible();

	// Move the second room to the new floor with the room's own floor selector.
	await showFloor(page, 'EG');
	const [, zimmer] = roomsOf(project);
	await selectRoomById(page, zimmer.id);
	await page.getByTestId('room-floor').getByRole('combobox').selectOption({ label: 'DG' });
	project = await waitForProject(
		page,
		id,
		(p) => roomFloor(roomsOf(p)[1]) === floorsOf(p)[2].id,
		'Zimmer im DG'
	);

	await page.getByTestId('project-settings').click();
	const locked = page.getByRole('switch', { name: /Mehrere Stockwerke/ });
	await expect(locked).toBeDisabled();
	await expect(dialog).toContainText(
		'Ausschalten geht nur, wenn alle Räume im selben Stockwerk liegen'
	);
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();

	// Back to the first floor: switching off works again.
	await showFloor(page, 'DG');
	await selectRoomById(page, zimmer.id);
	await page.getByTestId('room-floor').getByRole('combobox').selectOption({ label: 'EG' });
	await waitForProject(
		page,
		id,
		(p) => (roomFloor(roomsOf(p)[1]) ?? floorsOf(p)[0].id) === floorsOf(p)[0].id,
		'Zimmer wieder im EG'
	);
	await page.getByTestId('project-settings').click();
	await expect(locked).toBeEnabled();
	await locked.click();
	project = await waitForProject(page, id, (p) => floorsOf(p).length === 0, 'Stockwerke aus');
	expect(roomsOf(project)).toHaveLength(2);
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('floor-switcher')).toHaveCount(0);
	expect((await readProject(page, id))!.rooms).toHaveLength(2);
});
