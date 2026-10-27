import { catalogCard } from './helpers/catalog.ts';
import { readProject, waitForProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';
import { editor, elementsOf, newRoom, place, selectRow, setField } from './helpers/raeume.ts';

const DESK = 'generic-desk-160x80';

test('Kaminofen und Stütze: andocken, drehen, Sperrzone im Einrichten', async ({ page }) => {
	const id = await newRoom(page, 'Ofen E2E', 'living');

	const stove = await place(page, id, 'stove', { x: 2000, y: 1000 });
	const column = await place(page, id, 'column', { x: 3500, y: 2400 });
	expect(stove.x).toBeCloseTo(2000, -2);
	expect(column.x).toBeCloseTo(3500, -2);

	await selectRow(page, stove.id);
	await expect(editor(page).getByTestId('free-fields')).toBeVisible();
	await editor(page).getByTestId('to-wall').click();
	const docked = await waitForProject(
		page,
		id,
		(p) => elementsOf(p).find((e) => e.id === stove.id)!.y !== stove.y,
		'Ofen an der Wand'
	);
	const wallStove = elementsOf(docked).find((e) => e.id === stove.id)!;
	expect(wallStove.y! - wallStove.depth! / 2).toBeLessThanOrEqual(2);
	expect(wallStove.rotation).toBe(0);

	await selectRow(page, column.id);
	await editor(page).getByTestId('to-wall').click();
	await selectRow(page, column.id);
	await editor(page).getByRole('button', { name: 'Um 90° drehen' }).click();
	await waitForProject(
		page,
		id,
		(p) => (elementsOf(p).find((e) => e.id === column.id)!.rotation ?? 0) % 360 !== 0,
		'Stütze gedreht'
	);

	await selectRow(page, stove.id);
	await setField(page, 'Sperrzone vor dem Feuerraum', 3000);
	await waitForProject(
		page,
		id,
		(p) => elementsOf(p).find((e) => e.id === stove.id)!.clearance === 3000,
		'Sperrzone 3 m'
	);

	await page.getByTestId('seg-furnish').click();
	const panel = page.getByTestId('catalog-panel');
	const fab = page.getByTestId('catalog-fab');
	await expect(panel.or(fab)).toHaveCount(1);
	if (!(await panel.isVisible())) await fab.click();
	await (await catalogCard(page, DESK)).click();
	const withDesk = await waitForProject(
		page,
		id,
		(p) => p.variants.find((v) => v.id === p.activeVariantId)!.items.length === 1,
		'Schreibtisch'
	);
	const desk = withDesk.variants.find((v) => v.id === withDesk.activeVariantId)!.items[0];
	await page.getByTestId('panel-close').click();

	await page.getByTestId('fit-all').click();
	await page.waitForTimeout(600);
	await page.locator(`[data-hit="${desk.id}"]`).click();
	await page.getByTestId('sel-details').click();
	const hints = page.getByTestId('item-editor').getByRole('list', { name: /Hinweise/ });
	await expect(hints).toContainText('Sperrzone');
	await expect(page.locator('polygon[style*="--color-danger"]').first()).toBeAttached();

	await page.getByTestId('panel-close').click();
	await page.getByTestId('seg-plan').click();
	await selectRow(page, stove.id);
	await setField(page, 'Sperrzone vor dem Feuerraum', 0);
	await waitForProject(
		page,
		id,
		(p) => elementsOf(p).find((e) => e.id === stove.id)!.clearance === 0,
		'Sperrzone 0'
	);
	await page.getByTestId('seg-furnish').click();
	await page.getByTestId('fit-all').click();
	await page.waitForTimeout(600);
	await page.locator(`[data-hit="${desk.id}"]`).click();
	await page.getByTestId('sel-details').click();
	await expect(page.getByTestId('item-editor')).toBeVisible();
	await expect(page.getByTestId('item-editor')).not.toContainText('Sperrzone');
	await expect(page.locator('polygon[style*="--color-danger"]')).toHaveCount(0);
	expect((await readProject(page, id))!.variants[0].items).toHaveLength(1);
});
