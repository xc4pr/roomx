import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	addRoom,
	createProject,
	jpegUpload,
	lPolygon,
	makeJpeg,
	placeElement,
	setLTemplate,
	waitForProject
} from './helpers/app.ts';
import { canvasStats } from './helpers/canvas.ts';
import { contract } from './helpers/contract.ts';
import { exportPackage, pdfPages } from './helpers/export.ts';
import { test, expect } from './helpers/fixtures.ts';
import { buildPlan, EXPECTED, planMessage } from './helpers/plan.ts';
import { validate } from './helpers/schema.ts';

const L = { a: 5400, b: 4200, c: 2600, d: 2200 };
const SKILL_TEST_DIR = resolve(import.meta.dirname, '..', '..', '..', 'roomx-skill', 'test');

test('Projekt anlegen bis Plan-Import und Re-Export', async ({ page }, testInfo) => {
	test.setTimeout(180_000);
	const polygon = lPolygon(L);

	const id = await createProject(page, 'Wohnung E2E');
	await addRoom(page);
	await setLTemplate(page, L);
	await waitForProject(
		page,
		id,
		(p) => JSON.stringify(p.rooms[0]?.polygon) === JSON.stringify(polygon),
		'L-Raum'
	);

	await placeElement(page, id, 'door', polygon, { x: 1500, y: 150 });
	await placeElement(page, id, 'window', polygon, { x: 1300, y: L.b - 150 });
	await placeElement(page, id, 'socket', polygon, { x: 150, y: 2500 });

	await page.getByTestId('tab-photos').click();
	await page.getByTestId('tour-start').click();
	await page.getByTestId('tour-library-input').setInputFiles(jpegUpload(await makeJpeg(page)));
	await waitForProject(page, id, (p) => p.rooms[0].photos.length === 1, 'Foto gespeichert');

	await page.getByTestId('build').click();
	await expect(page.getByTestId('check-list')).toBeVisible();
	await page.getByTestId('check-proceed').click();
	await expect(page).toHaveURL(/\/3d\?build=1/);
	const canvas = page.getByTestId('canvas3d');
	await expect(canvas).toBeVisible();
	await expect
		.poll(async () => (await canvasStats(page, canvas)).distinctColors, { timeout: 20_000 })
		.toBeGreaterThan(12);
	expect((await canvasStats(page, canvas)).luminanceDeviation).toBeGreaterThan(6);

	const first = await exportPackage(page);
	const { exportSchema, planSchema } = contract();
	expect(validate(first.json, exportSchema)).toEqual([]);
	expect(first.json.project.id).toBe(id);
	const room = first.json.rooms[0];
	expect(first.json.rooms).toHaveLength(1);
	expect(room.corners).toHaveLength(6);
	expect(room.walls).toHaveLength(6);
	expect(room.corners.map((c: { x: number; y: number }) => ({ x: c.x, y: c.y }))).toEqual(polygon);
	expect(room.walls.map((w: { length: number }) => w.length)).toEqual([
		L.a,
		L.d,
		L.a - L.c,
		L.b - L.d,
		L.c,
		L.b
	]);
	const kinds = room.walls.flatMap((w: { number: number; elements: { kind: string }[] }) =>
		w.elements.map((e) => `${w.number}:${e.kind}`)
	);
	expect(kinds.sort()).toEqual(['1:door', '5:window', '6:socket']);
	for (const wall of room.walls) {
		for (const element of wall.elements) {
			expect(element.offsetFromStart + element.width + element.offsetFromEnd).toBe(wall.length);
		}
	}
	expect(room.photos).toHaveLength(1);
	expect(room.photos[0].pdfPage).toBeGreaterThan(1);
	expect(await pdfPages(first.pdf)).toBeGreaterThanOrEqual(4);
	expect(room.photos[0].pdfPage).toBeLessThanOrEqual(await pdfPages(first.pdf));

	const plan = buildPlan(first);
	expect(validate(plan, planSchema)).toEqual([]);

	await page.getByTestId('seg-share').click();
	await page.getByTestId('import-text').fill(planMessage(plan));
	await expect(page.getByTestId('import-preview')).toBeVisible();
	await expect(page.getByTestId('import-variant')).toHaveCount(1);
	const summary = ((await page.getByTestId('import-room').first().innerText()).split(':')[1] ?? '')
		.match(/\d+/g)
		?.map(Number);
	expect(summary?.slice(0, -1).reduce((sum, n) => sum + n, 0)).toBe(4);
	expect(summary?.at(-1)).toBe(1);
	await expect(page.getByTestId('import-total')).toContainText('865');
	await expect(page.getByTestId('import-conflicts')).toHaveCount(0);
	await expect(page.getByTestId('import-apply')).toBeEnabled();
	await page.getByTestId('import-apply').click();

	const imported = await waitForProject(
		page,
		id,
		(p) => p.variants.some((v) => v.items.length === 4),
		'Plan übernommen'
	);
	expect(imported.variants).toHaveLength(1);

	const second = await exportPackage(page);
	expect(validate(second.json, exportSchema)).toEqual([]);
	const variant = second.json.variants.find((v) => v.name === 'A: E2E');
	if (!variant) throw new Error('variant A: E2E missing in export');
	const byCatalog = (catalogId: string) => {
		const found = variant.items.find((item) => item.catalogId === catalogId);
		if (!found) throw new Error(`${catalogId} missing in export`);
		return found;
	};
	const desk = byCatalog('generic-desk-160x80');
	const monitor = byCatalog('generic-monitor-27');
	const pick = (item: { x: number; y: number; rotation: number; elevation: number }) => ({
		x: item.x,
		y: item.y,
		rotation: item.rotation,
		elevation: item.elevation
	});
	expect(pick(byCatalog('ikea-malm-bed-160x200'))).toEqual(EXPECTED.bed);
	expect(pick(desk)).toEqual(EXPECTED.desk);
	expect(pick(monitor)).toEqual(EXPECTED.monitor);
	expect(pick(byCatalog('generic-rug-120x180'))).toEqual(EXPECTED.rug);
	expect(monitor.onItemId).toBe(desk.id);
	expect(variant.suggestions).toHaveLength(1);
	expect(variant.suggestions[0].roomId).toBe(room.id);
	expect(variant.suggestions[0].element).toMatchObject({
		kind: 'socket',
		status: 'suggested',
		wall: 6,
		offset: 1000,
		elevation: 300
	});
	expect(variant.totalChf).toBeGreaterThan(0);

	if (testInfo.project.name === 'desktop') {
		mkdirSync(SKILL_TEST_DIR, { recursive: true });
		writeFileSync(resolve(SKILL_TEST_DIR, 'app-export.json'), first.jsonText);
		writeFileSync(resolve(SKILL_TEST_DIR, 'app-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
	}
});
