import { addRoom, createProject, fillNumber, readProject, waitForProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';

test('Rückgängig überlebt den Wechsel zu Einrichten und zurück', async ({ page }) => {
	const id = await createProject(page, 'Navigation Undo');
	await addRoom(page);
	await waitForProject(page, id, (p) => p.rooms[0]?.polygon[1].x === 4000, 'Raum angelegt');
	await fillNumber(page.getByTestId('room-length'), '500');
	await waitForProject(page, id, (p) => p.rooms[0].polygon[1].x === 5000, 'Länge 500 cm');

	await page.getByTestId('seg-furnish').click();
	await expect(page.getByTestId('furnish-screen')).toBeVisible();
	await expect(page.getByTestId('undo')).toBeEnabled();

	await page.getByTestId('seg-plan').click();
	await expect(page.getByTestId('board')).toBeVisible();
	await expect(page.getByTestId('undo')).toBeEnabled();

	await page.getByTestId('undo').click();
	await waitForProject(page, id, (p) => p.rooms[0].polygon[1].x === 4000, 'Länge zurück');
	await expect(page.getByTestId('redo')).toBeEnabled();
	expect((await readProject(page, id))?.rooms).toHaveLength(1);
});
