import { fillChecked } from './helpers/app.ts';
import { exportPackage } from './helpers/export.ts';
import { test, expect } from './helpers/fixtures.ts';
import { planMessage } from './helpers/plan.ts';
import { contract } from './helpers/contract.ts';
import { validate } from './helpers/schema.ts';
import { newRoom, place, selectRow } from './helpers/raeume.ts';
import { editor } from './helpers/raeume.ts';

const DESK = 'generic-desk-160x80';

test('KI-Paket und Plan-Import: freie Elemente, Sperrzonen, Kollisionen im Klartext', async ({
	page
}) => {
	const id = await newRoom(page, 'Paket E2E', 'living');
	const stove = await place(page, id, 'stove', { x: 2000, y: 1000 });
	const column = await place(page, id, 'column', { x: 3300, y: 2300 });
	const air = await place(page, id, 'acWall', { x: 3950, y: 1500 });
	await selectRow(page, stove.id);
	await editor(page).getByTestId('to-wall').click();
	await page.waitForTimeout(300);

	const exported = await exportPackage(page);
	const { exportSchema, planSchema } = contract();
	expect(validate(exported.json, exportSchema)).toEqual([]);
	const room = exported.json.rooms[0];
	const free = room.freeElements ?? [];
	expect(free.map((e) => e.kind).sort()).toEqual(['column', 'stove']);
	expect(free.find((e) => e.id === column.id)?.footprint.length).toBeGreaterThanOrEqual(4);
	const zones = room.keepClear?.zones ?? [];
	const fire = zones.find((zone) => zone.kind === 'fire');
	expect(fire?.elementId).toBe(stove.id);
	expect((room.keepClear?.fixtures ?? []).map((f) => f.elementId)).toEqual(
		expect.arrayContaining([stove.id, column.id])
	);
	const wallKinds = room.walls.flatMap((wall) => wall.elements.map((element) => element.kind));
	expect(wallKinds).toContain('acWall');
	expect(room.walls.flatMap((w) => w.elements).find((e) => e.id === air.id)).toBeTruthy();
	expect(exported.instructions).toMatch(/keepClear/);
	expect(exported.instructions).toMatch(/freeElements/);

	const centre = (points: { x: number; y: number }[]) => ({
		x: Math.round(points.reduce((sum, p) => sum + p.x, 0) / points.length),
		y: Math.round(points.reduce((sum, p) => sum + p.y, 0) / points.length)
	});
	const inZone = centre(fire!.polygon);
	const atColumn = free.find((e) => e.id === column.id)!;
	const plan = {
		format: 'roomx-plan',
		schemaVersion: 1,
		projectId: exported.json.project.id,
		variants: [
			{
				name: 'A: Kollision',
				rooms: [
					{
						roomId: room.id,
						items: [
							{ id: 'inzone', catalogId: DESK, x: inZone.x, y: inZone.y, rotation: 0 },
							{ id: 'incolumn', catalogId: DESK, x: atColumn.x, y: atColumn.y, rotation: 0 }
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
	await expect(conflicts).toContainText('Sperrzone vor der Feuerstelle');
	await expect(conflicts).toContainText('kollidiert mit');
	await expect(conflicts).toContainText('Stütze');
});
