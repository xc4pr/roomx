import { fillNumber, waitForProject } from './helpers/app.ts';
import { catalogCard } from './helpers/catalog.ts';
import { test, expect } from './helpers/fixtures.ts';
import {
	editor,
	elementsOf,
	newRoom,
	paletteKinds,
	place,
	reloadProject,
	selectRow,
	setField,
	slopeWall
} from './helpers/raeume.ts';

const SHELF = 'generic-shelf-120x35x200';

test('Dachfenster: nur mit Schräge in der Palette, Werte ändern, gespeichert', async ({ page }) => {
	const id = await newRoom(page, 'Dachfenster E2E', 'bedroom');
	expect(await paletteKinds(page)).not.toContain('roofWindow');

	await slopeWall(page, 1);
	expect(await paletteKinds(page)).toContain('roofWindow');

	const roof = await place(page, id, 'roofWindow', { x: 2000, y: 60 });
	expect(roof.wall).toBe(1);
	await selectRow(page, roof.id);
	await setField(page, 'Breite', 780);
	await setField(page, 'Länge entlang der Schräge', 1180);
	await setField(page, 'Unterkante über Boden', 1100);
	const stored = await waitForProject(
		page,
		id,
		(p) => {
			const found = elementsOf(p).find((e) => e.id === roof.id) as unknown as {
				width: number;
				length: number;
				elevation: number;
			};
			return found.width === 780 && found.length === 1180 && found.elevation === 1100;
		},
		'Dachfenster 78 x 118, Unterkante 110'
	);
	expect(elementsOf(stored)).toHaveLength(1);
	await reloadProject(page);
	await page.locator('[data-room-id]').first().click();
	await selectRow(page, roof.id);
	await expect(editor(page).getByLabel('Unterkante über Boden', { exact: true })).toHaveValue(
		'110'
	);
});

test('Ausschnitt: Tür in niedriger Wand ohne Befund, Regal unter der Schräge markiert', async ({
	page
}) => {
	const id = await newRoom(page, 'Ausschnitt E2E', 'bedroom');
	await slopeWall(page, 1);
	await fillNumber(page.getByTestId('slope-knee-1-0'), '100');
	await fillNumber(page.getByTestId('slope-angle-1-0'), '15');
	const door = await place(page, id, 'door', { x: 1000, y: 60 });
	await selectRow(page, door.id);
	await setField(page, 'Höhe', 2000);
	await waitForProject(
		page,
		id,
		(p) => elementsOf(p).find((e) => e.id === door.id)!.height === 2000,
		'Tür 2 m'
	);
	await expect(editor(page)).not.toContainText('Ragt über die Raumhöhe hinaus');

	await page.getByTestId('seg-furnish').click();
	const panel = page.getByTestId('catalog-panel');
	const fab = page.getByTestId('catalog-fab');
	await expect(panel.or(fab)).toHaveCount(1);
	if (!(await panel.isVisible())) await fab.click();
	await (await catalogCard(page, SHELF)).click();
	await waitForProject(page, id, (p) => p.variants[0].items.length === 1, 'Regal');
	const item = (await (await import('./helpers/app.ts')).readProject(page, id))!.variants[0]
		.items[0];
	await page.getByTestId('panel-close').click();
	await page.getByTestId('fit-all').click();
	await page.waitForTimeout(600);
	await page.locator(`[data-hit="${item.id}"]`).click();
	await page.getByTestId('sel-details').click();
	const hints = page.getByTestId('item-editor').getByRole('list', { name: /Hinweise/ });
	await expect(hints).toContainText('Passt nicht unter die Dachschräge');
});
