import { readProject, waitForProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';
import {
	addNamedRoom,
	dockNextTo,
	open3d,
	placeFreeAt,
	placeOnSide,
	reloadProject,
	roomsOf,
	selectRoomById,
	trackConsole
} from './helpers/raeume.ts';
import { createProject } from './helpers/app.ts';

test('Terrasse an der Küche: Tür, zwei Stützen, Überdachung, Plan und 3D', async ({ page }) => {
	const consoleErrors = trackConsole(page);
	const id = await createProject(page, 'Terrasse E2E');
	await addNamedRoom(page, id, 'Küche', 'kitchen', 4000, 3000);
	await addNamedRoom(page, id, 'Terrasse', 'terrace', 4000, 3000);
	let project = (await readProject(page, id))!;
	const [kitchen, terrace] = roomsOf(project);

	await dockNextTo(page, id, terrace.id, kitchen.id, 'right');

	await placeOnSide(page, id, kitchen.id, 'door', 'right', 0.5);
	project = (await readProject(page, id))!;
	const door = roomsOf(project)[0].elements.find((e) => e.kind === 'door')!;
	expect(door.wall).toBe(2);

	await selectRoomById(page, terrace.id);
	await page.getByTestId('tab-dims').click();
	await expect(page.getByTestId('outdoor-section')).toBeVisible();
	const first = await placeFreeAt(page, id, terrace.id, 'column', { x: 1000, y: 1500 });
	const second = await placeFreeAt(page, id, terrace.id, 'column', { x: 3000, y: 1500 });
	expect([first.kind, second.kind]).toEqual(['column', 'column']);

	await page.getByTestId('tab-dims').click();
	await page.getByRole('radio', { name: 'Streifen' }).click();
	await page.getByLabel('Entlang Wand').selectOption({ value: '4' });
	project = await waitForProject(
		page,
		id,
		(p) => {
			const cover = roomsOf(p)[1].cover;
			return !!cover && Math.max(...cover.polygon.map((c) => c.y)) === 3000;
		},
		'Überdachung als Streifen an der Hauswand'
	);
	const cover = roomsOf(project)[1].cover!;
	const ys = cover.polygon.map((p) => p.y);
	const xs = cover.polygon.map((p) => p.x);
	expect(Math.min(...xs)).toBe(0);
	expect(Math.max(...xs)).toBeLessThan(4000);
	expect(Math.max(...ys) - Math.min(...ys)).toBe(3000);

	await expect(
		page.locator(`[data-room-id="${terrace.id}"] [data-testid="open-air-outline"]`)
	).toHaveCount(1);
	await expect(
		page.locator(`[data-room-id="${terrace.id}"] [data-testid="wall-band"]`)
	).toHaveCount(0);
	await expect(
		page.locator(`[data-room-id="${terrace.id}"] [data-testid="cover-outline"]`)
	).toHaveCount(1);
	await expect(
		page.locator(`[data-room-id="${kitchen.id}"] [data-testid="wall-band"]`)
	).toHaveCount(1);

	await reloadProject(page);
	const stored = roomsOf((await readProject(page, id))!);
	expect(stored[1].elements.filter((e) => e.kind === 'column')).toHaveLength(2);
	expect(stored[1].cover).toBeTruthy();

	await open3d(page);
	expect(consoleErrors).toEqual([]);
});
