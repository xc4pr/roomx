import { fillChecked, readProject, waitForProject } from './helpers/app.ts';
import { exportPackage } from './helpers/export.ts';
import { test, expect } from './helpers/fixtures.ts';
import { planMessage } from './helpers/plan.ts';
import {
	addNamedRoom,
	createFloorProject,
	floorsOf,
	open3d,
	roomFloor,
	roomsOf,
	showFloor,
	stairsOf,
	trackConsole
} from './helpers/raeume.ts';

const DESK = 'generic-desk-160x80';

test('Zwei Stockwerke: Umschalter, Vorlage, Treppe, Treppenauge, Möbel auf der Treppe, 3D', async ({
	page
}) => {
	const errors = trackConsole(page);
	const id = await createFloorProject(page, 'Haus E2E');
	const [eg, og] = floorsOf((await readProject(page, id))!);
	expect([eg.name, og.name]).toEqual(['EG', '1. OG']);

	await showFloor(page, 'EG');
	await addNamedRoom(page, id, 'Wohnen unten', 'living', 6000, 4000);
	await showFloor(page, '1. OG');
	await addNamedRoom(page, id, 'Schlafen oben', 'bedroom', 6000, 4000);
	let project = (await readProject(page, id))!;
	const [lower, upper] = roomsOf(project);
	expect(roomFloor(lower)).toBe(eg.id);
	expect(roomFloor(upper)).toBe(og.id);

	await expect(page.getByTestId('floor-switcher')).toBeVisible();
	await page.getByTestId('fit-all').click();
	await expect(page.locator(`[data-room-id="${upper.id}"]`)).toHaveCount(1);
	await expect(page.locator(`[data-room-id="${lower.id}"]`)).toHaveCount(0);
	await expect(page.getByTestId('floor-underlay').first()).toBeAttached();

	await showFloor(page, 'EG');
	await expect(page.locator(`[data-room-id="${lower.id}"]`)).toHaveCount(1);
	await expect(page.locator(`[data-room-id="${upper.id}"]`)).toHaveCount(0);

	await page.mouse.click(5, 5);
	await page.getByTestId('stair-add').click();
	await expect(page.getByTestId('stair-editor')).toBeVisible();
	project = await waitForProject(page, id, (p) => stairsOf(p).length === 1, 'Treppe');
	expect(stairsOf(project)[0].fromFloorId).toBe(eg.id);
	await expect(page.getByTestId('stair-steps')).toHaveText(/^\d+$/);
	await expect(page.getByTestId('stair-riser')).toContainText('cm');
	await expect(page.getByTestId('stair-tread')).toContainText('cm');
	const steps = Number(await page.getByTestId('stair-steps').innerText());
	expect(steps).toBeGreaterThan(10);
	await page.getByTestId('stair-close').click();
	await expect(page.getByTestId('stair')).toHaveCount(1);

	await showFloor(page, '1. OG');
	await expect(page.getByTestId('stairwell')).toHaveCount(1);

	// A desk placed by an imported plan inside the stair and inside the stairwell.
	const exported = await exportPackage(page);
	const rooms = exported.json.rooms;
	const zoneOf = (roomId: string, kind: string) =>
		rooms.find((r) => r.id === roomId)!.stairZones!.find((z) => z.kind === kind)!;
	const centre = (points: { x: number; y: number }[]) => ({
		x: Math.round(points.reduce((sum, p) => sum + p.x, 0) / points.length),
		y: Math.round(points.reduce((sum, p) => sum + p.y, 0) / points.length)
	});
	const onStair = centre(zoneOf(lower.id, 'stair').polygon);
	const inWell = centre(zoneOf(upper.id, 'stairwell').polygon);
	const plan = {
		format: 'roomx-plan',
		schemaVersion: 1,
		projectId: exported.json.project.id,
		variants: [
			{
				name: 'A: Treppe',
				rooms: [
					{ roomId: lower.id, items: [{ id: 'unten', catalogId: DESK, ...onStair, rotation: 0 }] },
					{ roomId: upper.id, items: [{ id: 'oben', catalogId: DESK, ...inWell, rotation: 0 }] }
				]
			}
		]
	};
	await fillChecked(page.getByTestId('import-text'), planMessage(plan));
	await expect(page.getByTestId('import-preview')).toBeVisible();
	const conflicts = page.getByTestId('import-conflicts');
	await expect(conflicts).toHaveCount(2);
	await expect(conflicts.filter({ hasText: 'steht auf der Treppe' })).toHaveCount(1);
	await expect(conflicts.filter({ hasText: 'steht im Treppenauge' })).toHaveCount(1);
	await page.getByTestId('import-apply').click();
	await waitForProject(
		page,
		id,
		(p) => p.variants.some((v) => v.items.length === 2),
		'Plan übernommen'
	);

	await page.getByTestId('seg-furnish').click();
	await showFloor(page, 'EG');
	await page.getByTestId('fit-all').click();
	await page.waitForTimeout(600);
	const items = (await readProject(page, id))!.variants.find((v) => v.items.length === 2)!.items;
	const lowerItem = items.find((item) => item.roomId === lower.id)!;
	await page.locator(`[data-hit="${lowerItem.id}"]`).click();
	await page.getByTestId('sel-details').click();
	const hints = page.getByTestId('item-editor').getByRole('list', { name: /Hinweise/ });
	await expect(hints).toContainText('Steht auf der Treppe');
	await expect(
		page.locator(`[data-item="${lowerItem.id}"] [style*="--color-danger"]`).first()
	).toBeAttached();
	await page.getByTestId('panel-close').click();

	await showFloor(page, '1. OG');
	await page.getByTestId('fit-all').click();
	await page.waitForTimeout(600);
	const upperItem = items.find((item) => item.roomId === upper.id)!;
	await page.locator(`[data-hit="${upperItem.id}"]`).click();
	await page.getByTestId('sel-details').click();
	await expect(
		page.getByTestId('item-editor').getByRole('list', { name: /Hinweise/ })
	).toContainText('Steht im Treppenauge');
	await expect(
		page.locator(`[data-item="${upperItem.id}"] [style*="--color-danger"]`).first()
	).toBeAttached();

	await page.getByTestId('seg-plan').click();
	await open3d(page);
	const toggles = page.getByTestId('floor-toggle');
	await expect(toggles).toHaveCount(2);
	await toggles.first().click();
	await expect(toggles.first()).toHaveAttribute('aria-pressed', 'false');
	await page.waitForTimeout(500);
	await toggles.first().click();
	await expect(toggles.first()).toHaveAttribute('aria-pressed', 'true');
	await page.waitForTimeout(500);
	expect(errors).toEqual([]);
});
