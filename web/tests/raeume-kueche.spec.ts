import { readProject, waitForProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';
import {
	editor,
	elementsOf,
	newRoom,
	paletteKinds,
	place,
	reloadProject,
	roomOf,
	selectRow
} from './helpers/raeume.ts';

test('Küchenzeile: Raster, Hochschrank mit Kühlschrank, Oberschränke, Wandansicht, 3D', async ({
	page
}) => {
	const consoleErrors: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error') consoleErrors.push(message.text());
	});
	const id = await newRoom(page, 'Küche E2E', 'kitchen');
	expect(await paletteKinds(page)).toContain('kitchenRun');

	const run = await place(page, id, 'kitchenRun', { x: 2000, y: 2940 });
	expect(run.wall).toBe(3);
	await selectRow(page, run.id);
	const fields = editor(page).getByTestId('kitchen-fields');
	await expect(fields).toBeVisible();

	await fields.getByRole('radio', { name: 'EURO 60' }).click();
	await waitForProject(
		page,
		id,
		(p) => elementsOf(p).find((e) => e.id === run.id)!.grid === 'euro',
		'Raster EURO'
	);

	const before = elementsOf((await readProject(page, id))!).find((e) => e.id === run.id)!.modules!
		.length;
	await fields.getByTestId('module-add').click();
	await waitForProject(
		page,
		id,
		(p) => {
			const stored = elementsOf(p).find((e) => e.id === run.id)!;
			const used = stored.modules!.reduce((sum, module) => sum + module.width, 0);
			return stored.modules!.length === before + 1 && used <= stored.width!;
		},
		'Modul hinzugefügt, Zeile mitgewachsen'
	);
	const last = fields.locator('[data-module]').last();
	await last.getByLabel('Art', { exact: true }).selectOption({ label: 'Hochschrank' });
	await last.getByRole('button', { name: 'Kühlschrank' }).click();
	await fields.getByRole('switch', { name: 'Oberschränke' }).click();
	const built = await waitForProject(
		page,
		id,
		(p) => {
			const found = elementsOf(p).find((e) => e.id === run.id)!;
			const tall = found.modules!.at(-1)!;
			return tall.kind === 'tall' && !!tall.appliances?.includes('fridge') && !!found.upper;
		},
		'Hochschrank mit Kühlschrank und Oberschränke'
	);
	const stored = elementsOf(built).find((e) => e.id === run.id)!;
	expect(stored.modules).toHaveLength(before + 1);

	await reloadProject(page);
	const again = elementsOf((await readProject(page, id))!).find((e) => e.id === run.id)!;
	expect(again.upper).toBeTruthy();
	expect(again.grid).toBe('euro');

	await page.locator('[data-room-id]').first().click();
	await selectRow(page, run.id);
	await page.getByTestId('wall-view-toggle').click();
	const elevation = page.getByTestId('wall-elevation');
	await expect(elevation).toBeVisible();
	await expect(elevation.locator(`[data-hit="${run.id}"]`)).toHaveCount(1);

	await page.getByTestId('seg-3d').click();
	await expect(page.getByTestId('canvas3d')).toBeVisible();
	await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-context', 'ok');
	await page.waitForTimeout(1500);
	expect(consoleErrors).toEqual([]);
});

test('Offene Küche aus dem Katalog: Kategorie Küche oben, Möbel platzierbar', async ({ page }) => {
	const id = await newRoom(page, 'Wohnküche E2E', 'living');
	await expect(page.getByTestId('kitchen-section')).toBeVisible();
	expect(await paletteKinds(page)).not.toContain('kitchenRun');
	await page.getByTestId('tab-dims').click();
	await page.getByRole('switch', { name: 'Offene Küche' }).click();
	await page.getByRole('radio', { name: 'Aus dem Katalog' }).click();
	await waitForProject(
		page,
		id,
		(p) => roomOf(p).kitchen?.open === true && roomOf(p).kitchen?.mode === 'catalog',
		'Offene Küche aus dem Katalog'
	);
	expect(await paletteKinds(page)).not.toContain('kitchenRun');

	await page.getByTestId('seg-furnish').click();
	const panel = page.getByTestId('catalog-panel');
	const fab = page.getByTestId('catalog-fab');
	await expect(panel.or(fab)).toHaveCount(1);
	if (!(await panel.isVisible())) await fab.click();
	await expect(panel).toBeVisible();
	const chips = panel.locator('[aria-pressed]');
	await expect(chips.nth(1)).toHaveText('Küche');
	await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
	const card = panel.locator('[data-catalog-id]').first();
	await expect(card).toBeVisible();
	const catalogId = await card.getAttribute('data-catalog-id');
	expect(catalogId).toBeTruthy();
	await card.click();
	const placed = await waitForProject(
		page,
		id,
		(p) => p.variants.find((v) => v.id === p.activeVariantId)!.items.length === 1,
		'Küchenmöbel platziert'
	);
	const item = placed.variants.find((v) => v.id === placed.activeVariantId)!.items[0];
	expect(item.catalogId).toBe(catalogId);
});
