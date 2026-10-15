import { addRoom, createProject, fillNumber, readProject, waitForProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';

test('Zweiter Tab ist nur lesend, Übernahme klappt und nichts geht verloren', async ({
	context,
	page
}) => {
	const id = await createProject(page, 'Zwei Tabs');
	await addRoom(page);
	await fillNumber(page.getByTestId('room-length'), '500');
	await waitForProject(page, id, (p) => p.rooms[0]?.polygon[1].x === 5000, 'Länge 500 cm');
	await expect(page.getByTestId('readonly-banner')).toHaveCount(0);

	const second = await context.newPage();
	await second.goto(`/p/${id}`);
	await expect(second.getByTestId('board')).toBeVisible();
	await expect(second.getByTestId('readonly-banner')).toBeVisible();
	await expect(second.getByTestId('take-over')).toBeVisible();
	await expect(page.getByTestId('readonly-banner')).toHaveCount(0);

	await fillNumber(page.getByTestId('room-width'), '350');
	await waitForProject(page, id, (p) => p.rooms[0]?.polygon[2].y === 3500, 'Breite 350 cm');
	await expect(second.getByTestId('readonly-banner')).toBeVisible();

	await second.getByTestId('take-over').click();
	await expect(second.getByTestId('readonly-banner')).toHaveCount(0);
	await expect(page.getByTestId('readonly-banner')).toBeVisible();

	await second.getByTestId('add-room').click();
	await waitForProject(page, id, (p) => p.rooms.length === 2, 'zweiter Raum aus Tab 2');

	await expect(page.getByTestId('readonly-banner')).toBeVisible();
	await page.close();
	await second.close();

	const fresh = await context.newPage();
	await fresh.goto('/');
	const stored = await readProject(fresh, id);
	expect(stored?.rooms).toHaveLength(2);
	expect(stored?.rooms[0].polygon[1].x).toBe(5000);
	expect(stored?.rooms[0].polygon[2].y).toBe(3500);

	await fresh.goto(`/p/${id}`);
	await expect(fresh.getByTestId('board')).toBeVisible();
	await expect(fresh.getByTestId('readonly-banner')).toHaveCount(0);
	await expect(fresh.locator('[data-room-id]')).toHaveCount(2);
});
