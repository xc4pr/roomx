import {
	addRoom,
	createProject,
	fillNumber,
	readProject,
	waitForProject,
	type StoredProject
} from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';

const width = (project: StoredProject) => project.rooms[0] && project.rooms[0].polygon[1].x;

test('Rückgängig und Wiederholen über Buttons und Tastatur', async ({ page }) => {
	const id = await createProject(page, 'Undo');
	const state = async () => (await readProject(page, id)) as StoredProject;
	const settle = async (check: (project: StoredProject) => boolean, message: string) =>
		waitForProject(page, id, check, message);

	await expect(page.getByTestId('undo')).toBeDisabled();
	await expect(page.getByTestId('redo')).toBeDisabled();

	await addRoom(page);
	await settle((p) => p.rooms.length === 1, 'Raum angelegt');
	expect(width(await state())).toBe(4000);

	await fillNumber(page.getByTestId('room-length'), '500');
	await settle((p) => width(p) === 5000, 'Länge 500 cm');

	await page.getByTestId('tab-elements').click();
	await page.getByTestId('fit-all').click();
	await page.waitForTimeout(600);
	await page.locator('[data-testid="element-palette"] [data-kind="door"]').click();
	const box = (await page.locator('[data-catcher]').boundingBox())!;
	const scale = box.width / (5000 + 3000);
	await page.mouse.click(box.x + (1000 + 1500) * scale, box.y + box.height - (150 + 1500) * scale);
	const withDoor = await settle((p) => p.rooms[0].elements.length === 1, 'Tür gesetzt');
	const door = withDoor.rooms[0].elements[0];

	const hit = page.locator(`[data-hit="${door.id}"]`);
	const spot = (await hit.boundingBox())!;
	await page.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2);
	await page.mouse.down();
	await page.mouse.move(spot.x + spot.width / 2 + 40, spot.y + spot.height / 2, { steps: 6 });
	await page.mouse.move(spot.x + spot.width / 2 + 120, spot.y + spot.height / 2, { steps: 6 });
	await page.mouse.up();
	const moved = await settle(
		(p) => p.rooms[0].elements[0].offset !== door.offset,
		'Tür verschoben'
	);
	expect(moved.rooms[0].elements[0].offset).toBeGreaterThan(door.offset!);

	await expect(page.getByTestId('undo')).toBeEnabled();
	await expect(page.getByTestId('redo')).toBeDisabled();

	await page.getByTestId('undo').click();
	const back = await settle(
		(p) => p.rooms[0].elements[0]?.offset === door.offset,
		'Verschieben zurück'
	);
	expect(back.rooms[0].elements).toHaveLength(1);
	await expect(page.getByTestId('redo')).toBeEnabled();

	await page.keyboard.press('Control+z');
	await settle((p) => p.rooms[0].elements.length === 0, 'Tür entfernt per Tastatur');
	expect(width(await state())).toBe(5000);

	await page.keyboard.press('Control+z');
	await settle((p) => width(p) === 4000, 'Länge zurück');

	await page.getByTestId('undo').click();
	await settle((p) => p.rooms.length === 0, 'Raum entfernt');
	await expect(page.getByTestId('undo')).toBeDisabled();

	await page.getByTestId('redo').click();
	await settle((p) => p.rooms.length === 1 && width(p) === 4000, 'Raum wieder da');

	await page.keyboard.press('Control+Shift+z');
	await settle((p) => width(p) === 5000, 'Länge wieder 500');

	await page.keyboard.press('Control+y');
	const again = await settle((p) => p.rooms[0].elements.length === 1, 'Tür wieder da');
	expect(again.rooms[0].elements[0].offset).toBe(door.offset);

	await page.keyboard.press('Control+y');
	const final = await settle(
		(p) => p.rooms[0].elements[0]?.offset === moved.rooms[0].elements[0].offset,
		'Verschiebung wieder'
	);
	expect(final.rooms[0].elements).toHaveLength(1);
	await expect(page.getByTestId('redo')).toBeDisabled();
});
