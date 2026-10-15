import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import {
	addRoom,
	createProject,
	fillNumber,
	jpegUpload,
	tapAt,
	waitForProject,
	type StoredProject
} from './helpers/app.ts';
import { exportPackage } from './helpers/export.ts';
import { test, expect } from './helpers/fixtures.ts';

interface WithBrief extends StoredProject {
	brief?: { budgetChf?: number; wishes?: string };
}

const OUT = process.env.ROOMX_PACKAGE_OUT;
const PHOTO = resolve(import.meta.dirname, 'fixtures', 'wohnzimmer.jpg');
const WISHES = 'Sofa für 3 Personen, Esstisch für 4, helles Holz, Budget 3000 CHF';

async function roomBox(page: Page, roomId: string) {
	const room = page.locator(`[data-room-id="${roomId}"]`).first();
	await expect(room).toBeAttached();
	const box = await room.boundingBox();
	if (!box) throw new Error(`room ${roomId} has no box`);
	return box;
}

async function selectRoom(page: Page, roomId: string): Promise<void> {
	await page.getByTestId('fit-all').click();
	await page.waitForTimeout(700);
	const box = await roomBox(page, roomId);
	await tapAt(page, box.x + box.width / 2, box.y + box.height / 2);
	await page.getByTestId('tab-dims').click();
	await expect(page.getByTestId('room-name')).toBeVisible();
}

async function placeOn(
	page: Page,
	id: string,
	roomIndex: number,
	kind: string,
	side: 'bottom' | 'right' | 'top' | 'left',
	along: number
): Promise<void> {
	const project = (await waitForProject(page, id, () => true)) as StoredProject;
	const room = project.rooms[roomIndex];
	const before = room.elements.length;
	await page.getByTestId('tab-elements').click();
	await page.getByTestId('fit-all').click();
	await page.waitForTimeout(700);
	await page.locator(`[data-testid="element-palette"] [data-kind="${kind}"]`).click();
	const box = await roomBox(page, room.id);
	const inset = 6;
	const point = {
		bottom: { x: box.x + box.width * along, y: box.y + box.height - inset },
		top: { x: box.x + box.width * along, y: box.y + inset },
		left: { x: box.x + inset, y: box.y + box.height * (1 - along) },
		right: { x: box.x + box.width - inset, y: box.y + box.height * (1 - along) }
	}[side];
	await tapAt(page, point.x, point.y);
	await waitForProject(
		page,
		id,
		(p) => p.rooms[roomIndex].elements.length === before + 1,
		`${kind} in Raum ${roomIndex + 1}`
	);
}

test('KI-Paket eines realistischen Projekts erzeugen und speichern', async ({ page }, testInfo) => {
	test.skip(!OUT, 'ROOMX_PACKAGE_OUT nicht gesetzt');
	test.skip(testInfo.project.name !== 'desktop', 'Nur Projekt desktop');
	test.setTimeout(240_000);

	const id = await createProject(page, 'Wohnung Beispiel');

	await addRoom(page);
	await page.getByTestId('room-name').fill('Wohnzimmer');
	await fillNumber(page.getByTestId('room-length'), '500');
	await fillNumber(page.getByTestId('room-width'), '400');
	await page.getByTestId('room-type-living').click();
	await waitForProject(
		page,
		id,
		(p) => p.rooms[0]?.name === 'Wohnzimmer' && p.rooms[0].polygon[1].x === 5000,
		'Wohnzimmer'
	);

	await page.getByTestId('add-room').click();
	await waitForProject(page, id, (p) => p.rooms.length === 2, 'zweiter Raum');
	await page.getByTestId('room-name').fill('Küche');
	await fillNumber(page.getByTestId('room-length'), '350');
	await fillNumber(page.getByTestId('room-width'), '400');
	await page.getByTestId('room-type-kitchen').click();
	const withKitchen = await waitForProject(
		page,
		id,
		(p) => p.rooms[1]?.name === 'Küche' && p.rooms[1].polygon[1].x === 3500,
		'Küche'
	);

	await page.getByTestId('fit-all').click();
	await page.waitForTimeout(700);
	const living = await roomBox(page, withKitchen.rooms[0].id);
	const kitchen = await roomBox(page, withKitchen.rooms[1].id);
	const pxPerMm =
		(kitchen.x - living.x) / (withKitchen.rooms[1].boardPos.x - withKitchen.rooms[0].boardPos.x);
	const start = { x: kitchen.x + kitchen.width / 2, y: kitchen.y + kitchen.height / 2 };
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x - 150 * pxPerMm, start.y, { steps: 8 });
	await page.mouse.move(start.x - 350 * pxPerMm, start.y, { steps: 8 });
	await page.mouse.up();
	await waitForProject(
		page,
		id,
		(p) => p.rooms[1].boardPos.x !== withKitchen.rooms[1].boardPos.x,
		'Küche angedockt'
	);

	await selectRoom(page, withKitchen.rooms[0].id);
	await expect(page.locator('[data-neighbour]')).toHaveCount(1);
	await placeOn(page, id, 0, 'door', 'right', 0.5);
	await placeOn(page, id, 0, 'window', 'top', 0.4);
	await placeOn(page, id, 0, 'socket', 'left', 0.3);

	await selectRoom(page, withKitchen.rooms[1].id);
	await placeOn(page, id, 1, 'window', 'top', 0.5);
	await placeOn(page, id, 1, 'socket', 'bottom', 0.5);

	await selectRoom(page, withKitchen.rooms[0].id);
	await page.getByTestId('tab-photos').click();
	await page.getByTestId('tour-start').click();
	await page.getByTestId('tour-library-input').setInputFiles(jpegUpload(readFileSync(PHOTO)));
	await waitForProject(page, id, (p) => p.rooms[0].photos.length === 1, 'Foto gespeichert');

	await page.getByTestId('seg-furnish').click();
	await expect(page.getByTestId('furnish-screen')).toBeVisible();
	await page.getByTestId('open-brief').click();
	await expect(page.getByTestId('brief-editor')).toBeVisible();
	await page.getByTestId('brief-budget').fill('3000');
	await page.getByTestId('brief-budget').blur();
	await page.locator('#brief-wishes').fill(WISHES);
	await page.locator('#brief-wishes').blur();
	const finished = await waitForProject(
		page,
		id,
		(p) => (p as WithBrief).brief?.budgetChf === 3000 && (p as WithBrief).brief?.wishes === WISHES,
		'Brief gespeichert'
	);

	const connected = finished.rooms.reduce((sum, room) => sum + room.elements.length, 0);
	expect(connected).toBeGreaterThanOrEqual(5);

	await page.getByTestId('seg-share').click();
	const exported = await exportPackage(page);
	expect(exported.json.rooms).toHaveLength(2);
	expect(exported.json.brief?.wishes).toBe(WISHES);

	mkdirSync(OUT!, { recursive: true });
	writeFileSync(resolve(OUT!, exported.jsonName), exported.jsonText);
	writeFileSync(resolve(OUT!, exported.pdfName), exported.pdf);
	writeFileSync(resolve(OUT!, exported.instructionsName), exported.instructions);
	writeFileSync(resolve(OUT!, 'roomx-plan.schema.json'), exported.schemaText);
	writeFileSync(resolve(OUT!, 'roomx-katalog.json'), exported.catalogText);
});
