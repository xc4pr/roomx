import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { waitForProject } from './helpers/app.ts';
import { catalogCard } from './helpers/catalog.ts';
import { test, expect } from './helpers/fixtures.ts';
import { editor, elementsOf, newRoom, place, roomOf, selectRow } from './helpers/raeume.ts';

const DIR = process.env.RAEUME_SHOTS_DIR ?? 'test-results/raeume-shots';

test.skip(!process.env.RAEUME_SHOTS, 'Bildschirmfotos nur mit RAEUME_SHOTS=1');
test.use({ viewport: { width: 1280, height: 800 } });

async function shot(page: Page, name: string): Promise<void> {
	mkdirSync(DIR, { recursive: true });
	await page.waitForTimeout(800);
	await page.screenshot({ path: resolve(DIR, name) });
}

async function threeD(page: Page, name: string): Promise<void> {
	await page.getByTestId('seg-3d').click();
	await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-context', 'ok');
	await page.waitForTimeout(1500);
	await shot(page, name);
	await page.getByTestId('seg-plan').click();
	await expect(page.getByTestId('board')).toBeVisible();
}

test('Bad und Küche', async ({ page }) => {
	const bath = await newRoom(page, 'Bad Fotos', 'bath');
	await page.getByTestId('tab-elements').click();
	await shot(page, 'palette-bad.png');
	await place(page, bath, 'toilet', { x: 60, y: 700 });
	await place(page, bath, 'washbasin', { x: 60, y: 1900 });
	const shower = await place(page, bath, 'shower', { x: 3300, y: 2950 });
	await selectRow(page, shower.id);
	await editor(page).getByTestId('corner-start').click();
	await editor(page).getByRole('switch', { name: 'Trennwand' }).click();
	await place(page, bath, 'bathtub', { x: 1500, y: 2950 });
	await waitForProject(page, bath, (p) => elementsOf(p).length === 4, '4 Elemente');
	await page.getByTestId('fit-all').click();
	await shot(page, 'bad-2d.png');
	await threeD(page, 'bad-3d.png');

	const kitchen = await newRoom(page, 'Küche Fotos', 'kitchen');
	const run = await place(page, kitchen, 'kitchenRun', { x: 2000, y: 2940 });
	await selectRow(page, run.id);
	const fields = editor(page).getByTestId('kitchen-fields');
	await fields.getByTestId('module-add').click();
	const last = fields.locator('[data-module]').last();
	await last.getByLabel('Art', { exact: true }).selectOption({ label: 'Hochschrank' });
	await last.getByRole('button', { name: 'Kühlschrank' }).click();
	await fields.getByRole('switch', { name: 'Oberschränke' }).click();
	await waitForProject(page, kitchen, (p) => !!elementsOf(p)[0].upper, 'Oberschränke');
	await page.getByTestId('wall-view-toggle').click();
	await expect(page.getByTestId('wall-elevation')).toBeVisible();
	await shot(page, 'kueche-wand.png');
	await page.getByTestId('wall-view-toggle').click();
	await page.getByTestId('fit-all').click();
	await shot(page, 'kueche-2d.png');
	await threeD(page, 'kueche-3d.png');
	expect(roomOf(await waitForProject(page, kitchen, () => true)).type).toBe('kitchen');
});

test('Wohnen und Ofen', async ({ page }) => {
	const id = await newRoom(page, 'Wohnen Fotos', 'living');
	await page.getByTestId('tab-elements').click();
	await shot(page, 'palette-wohnen.png');
	const stove = await place(page, id, 'stove', { x: 2000, y: 1000 });
	await selectRow(page, stove.id);
	await editor(page).getByTestId('to-wall').click();
	await page.getByTestId('seg-furnish').click();
	const panel = page.getByTestId('catalog-panel');
	const fab = page.getByTestId('catalog-fab');
	await expect(panel.or(fab)).toHaveCount(1);
	if (!(await panel.isVisible())) await fab.click();
	await (await catalogCard(page, 'generic-desk-160x80')).click();
	const placed = await waitForProject(
		page,
		id,
		(p) => p.variants.find((v) => v.id === p.activeVariantId)!.items.length === 1,
		'Schreibtisch'
	);
	const desk = placed.variants.find((v) => v.id === placed.activeVariantId)!.items[0];
	await page.getByTestId('panel-close').click();
	await page.getByTestId('fit-all').click();
	await page.waitForTimeout(600);
	await page.locator(`[data-hit="${desk.id}"]`).click();
	await shot(page, 'ofen-einrichten.png');
});
