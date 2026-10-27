import { createProject, fillChecked, readProject } from './helpers/app.ts';
import { exportPackage } from './helpers/export.ts';
import { test, expect } from './helpers/fixtures.ts';
import { planMessage } from './helpers/plan.ts';
import { contract } from './helpers/contract.ts';
import { validate } from './helpers/schema.ts';
import { addNamedRoom, dockNextTo, roomsOf, selectRoomById } from './helpers/raeume.ts';
import { fillNumber } from './helpers/app.ts';

const SHELF = 'generic-shelf-120x35x200';

test('KI-Paket und Plan-Import: Aussenbereich, Überdachung, zu hohes Möbel', async ({ page }) => {
	const id = await createProject(page, 'Aussen Paket E2E');
	await addNamedRoom(page, id, 'Wohnen', 'living', 4000, 3000);
	await addNamedRoom(page, id, 'Balkon', 'balcony', 4000, 3000);
	const [living, balcony] = roomsOf((await readProject(page, id))!);
	await dockNextTo(page, id, balcony.id, living.id, 'right');

	await selectRoomById(page, balcony.id);
	await page.getByRole('switch', { name: 'Geländer' }).click();
	await page.getByRole('radio', { name: 'Streifen' }).click();
	await page.getByLabel('Entlang Wand').selectOption({ value: '4' });
	await fillNumber(page.getByTestId('cover-height'), '180');
	await fillNumber(page.getByTestId('cover-depth'), '150');
	await page.waitForTimeout(500);

	const exported = await exportPackage(page);
	const { exportSchema, planSchema } = contract();
	expect(validate(exported.json, exportSchema)).toEqual([]);
	const rooms = exported.json.rooms;
	const out = rooms.find((room) => room.id === balcony.id)!;
	expect(out.outdoor).toBe(true);
	expect(out.openAir).toBe(true);
	expect(out.railing?.height).toBeGreaterThan(0);
	expect(out.railing?.runs.length).toBeGreaterThan(0);
	expect(out.cover?.height).toBe(1800);
	expect(out.cover?.polygon.length).toBeGreaterThanOrEqual(4);
	expect(rooms.find((room) => room.id === living.id)!.outdoor).toBeUndefined();
	expect(exported.json.areas).toEqual({ livingM2: 12, outdoorM2: 12 });
	expect(exported.instructions).toMatch(/openAir/);
	expect(exported.instructions).toMatch(/areas/);

	const cover = out.cover!.polygon;
	const middle = (points: { x: number; y: number }[], pick: 'x' | 'y') =>
		Math.round(points.reduce((sum, p) => sum + p[pick], 0) / points.length);
	const under = { x: middle(cover, 'x'), y: middle(cover, 'y') };
	const plan = {
		format: 'roomx-plan',
		schemaVersion: 1,
		projectId: exported.json.project.id,
		variants: [
			{
				name: 'A: Regal',
				rooms: [
					{
						roomId: balcony.id,
						items: [
							{ id: 'unter', catalogId: SHELF, x: under.x, y: under.y, rotation: 0 },
							{ id: 'frei', catalogId: SHELF, x: 3300, y: under.y, rotation: 0 }
						]
					}
				]
			}
		]
	};
	expect(validate(plan, planSchema)).toEqual([]);

	await fillChecked(page.getByTestId('import-text'), planMessage(plan));
	await expect(page.getByTestId('import-preview')).toBeVisible();
	const conflicts = page.getByTestId('import-conflicts');
	await expect(conflicts).toBeVisible();
	await expect(conflicts).toContainText('ist höher als');
	await expect(conflicts.locator('p.bg-danger-soft')).toHaveCount(1);
});
