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
	selectRow,
	setField
} from './helpers/raeume.ts';

test('Bad: Sanitär platzieren, Werte ändern, speichern, Typwechsel behält Elemente', async ({
	page
}) => {
	const id = await newRoom(page, 'Bad E2E', 'bath');

	const kinds = await paletteKinds(page);
	for (const kind of ['toilet', 'washbasin', 'shower', 'bathtub']) expect(kinds).toContain(kind);
	await expect(page.locator('[data-group="sanitary"]')).toBeVisible();

	const toilet = await place(page, id, 'toilet', { x: 800, y: 60 });
	const basin = await place(page, id, 'washbasin', { x: 2400, y: 60 });
	const shower = await place(page, id, 'shower', { x: 3940, y: 1500 });
	expect(toilet.wall).toBe(1);
	expect(basin.wall).toBe(1);
	expect(shower.wall).toBe(2);

	await selectRow(page, shower.id);
	await editor(page).getByTestId('corner-end').click();
	await editor(page).getByRole('switch', { name: 'Trennwand' }).click();
	let project = await waitForProject(
		page,
		id,
		(p) => {
			const found = elementsOf(p).find((e) => e.id === shower.id)!;
			return found.screen === true && found.offset !== shower.offset;
		},
		'Dusche in der Ecke mit Trennwand'
	);
	const corner = elementsOf(project).find((e) => e.id === shower.id)!;
	expect(corner.offset! + corner.width).toBe(3000);

	await selectRow(page, basin.id);
	await setField(page, 'Breite', 700);
	project = await waitForProject(
		page,
		id,
		(p) => elementsOf(p).find((e) => e.id === basin.id)!.width === 700,
		'Waschtisch 70 cm'
	);

	await reloadProject(page);
	const stored = (await readProject(page, id))!;
	const again = elementsOf(stored);
	expect(again).toHaveLength(3);
	expect(again.find((e) => e.id === basin.id)!.width).toBe(700);
	expect(again.find((e) => e.id === shower.id)!.screen).toBe(true);
	await page.locator('[data-room-id]').first().click();
	await page.getByTestId('tab-elements').click();
	await expect(page.locator(`[data-row="${shower.id}"]`)).toBeVisible();

	await page.getByTestId('tab-dims').click();
	await page.getByTestId('room-type-office').click();
	project = await waitForProject(page, id, (p) => roomOf(p).type === 'office', 'Büro');
	expect(elementsOf(project)).toHaveLength(3);
	await page.getByTestId('tab-elements').click();
	await expect(page.getByTestId('unfit-badge')).toHaveCount(3);
	await expect(page.getByTestId('unfit-badge').first()).toHaveText('Passt nicht zum Raumtyp');
	expect(await paletteKinds(page)).not.toContain('toilet');
});

test('Wohnzimmer: keine Gruppe Sanitär', async ({ page }) => {
	await newRoom(page, 'Wohnen E2E', 'living');
	const kinds = await paletteKinds(page);
	expect(kinds).not.toContain('toilet');
	expect(kinds).not.toContain('washbasin');
	expect(kinds).toContain('fireplace');
	await expect(page.locator('[data-group="sanitary"]')).toHaveCount(0);
	await expect(page.locator('[data-group="kitchen"]')).toHaveCount(0);
});
