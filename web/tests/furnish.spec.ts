import {
	addRoom,
	createProject,
	readProject,
	waitForProject,
	type StoredProject
} from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';

const BED = 'ikea-malm-bed-160x200';
const DESK = 'generic-desk-160x80';

const active = (project: StoredProject) =>
	project.variants.find((variant) => variant.id === project.activeVariantId);

test('Möbel einrichten, bewegen, drehen, löschen, Budget und Variante kopieren', async ({
	page
}) => {
	const id = await createProject(page, 'Einrichten');
	await addRoom(page);
	await page.getByTestId('seg-furnish').click();
	await expect(page.getByTestId('furnish-screen')).toBeVisible();
	await expect(page.getByTestId('budget-pill')).toBeVisible();
	const budget = page.getByTestId('budget-sum');
	const before = await budget.innerText();

	const panel = page.getByTestId('catalog-panel');
	const fab = page.getByTestId('catalog-fab');
	await expect(panel.or(fab)).toHaveCount(1);
	if (!(await panel.isVisible())) await fab.click();
	await expect(panel).toHaveCount(1);
	await expect(panel).toBeVisible();
	await page.locator(`[data-catalog-id="${DESK}"]`).click();
	const first = await waitForProject(
		page,
		id,
		(p) => (active(p)?.items.length ?? 0) === 1,
		'Schreibtisch'
	);
	await expect(budget).not.toHaveText(before);
	const afterDesk = await budget.innerText();
	expect(afterDesk).toContain('250');

	await page.locator(`[data-catalog-id="${BED}"]`).click();
	const second = await waitForProject(
		page,
		id,
		(p) => (active(p)?.items.length ?? 0) === 2,
		'Bett'
	);
	await expect(budget).not.toHaveText(afterDesk);
	await expect(budget).toContainText('495');
	const bed = active(second)!.items.find((item) => item.catalogId === BED)!;
	const desk = active(first)!.items[0];
	expect(bed.roomId).toBe(second.rooms[0].id);

	await page.getByTestId('panel-close').click();
	await expect(page.getByTestId('catalog-panel')).toBeHidden();
	await page.getByTestId('fit-all').click();
	await page.waitForTimeout(600);

	const hit = page.locator(`[data-hit="${bed.id}"]`);
	const spot = (await hit.boundingBox())!;
	const cx = spot.x + spot.width / 2;
	const cy = spot.y + spot.height / 2;
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx + 25, cy, { steps: 5 });
	await page.mouse.move(cx + 70, cy + 20, { steps: 8 });
	await page.mouse.up();
	const moved = await waitForProject(
		page,
		id,
		(p) => {
			const item = active(p)!.items.find((entry) => entry.id === bed.id)!;
			return item.x !== bed.x || item.y !== bed.y;
		},
		'Bett verschoben'
	);
	const movedBed = active(moved)!.items.find((entry) => entry.id === bed.id)!;
	expect(Math.hypot(movedBed.x - bed.x, movedBed.y - bed.y)).toBeGreaterThan(50);
	const deskAfterMove = active(moved)!.items.find((entry) => entry.id === desk.id)!;
	expect([deskAfterMove.x, deskAfterMove.y]).toEqual([desk.x, desk.y]);

	await expect(page.getByTestId('selection-bar')).toBeVisible();
	await page.getByTestId('sel-rotate-right').click();
	const turned = await waitForProject(
		page,
		id,
		(p) => active(p)!.items.find((entry) => entry.id === bed.id)!.rotation !== movedBed.rotation,
		'Bett gedreht'
	);
	const rotation = active(turned)!.items.find((entry) => entry.id === bed.id)!.rotation;
	expect(Math.abs(((rotation - movedBed.rotation + 540) % 360) - 180)).toBe(90);

	await page.getByTestId('variant-add').click();
	await page.getByRole('menuitem').nth(1).click();
	const copied = await waitForProject(page, id, (p) => p.variants.length === 2, 'Variante kopiert');
	const copy = active(copied)!;
	const original = copied.variants.find((variant) => variant.id !== copy.id)!;
	expect(copy.name).not.toBe(original.name);
	expect(copy.items).toHaveLength(2);
	expect(copy.items.map((item) => item.catalogId).sort()).toEqual([BED, DESK].sort());
	const copiedBed = copy.items.find((item) => item.catalogId === BED)!;
	expect(copiedBed.x).toBe(movedBed.x);
	expect(copiedBed.id).not.toBe(bed.id);

	await page.locator(`[data-hit="${copiedBed.id}"]`).click();
	await expect(page.getByTestId('selection-bar')).toBeVisible();
	await page.getByTestId('sel-delete').click();
	const trimmed = await waitForProject(
		page,
		id,
		(p) => active(p)!.items.length === 1 && p.variants.length === 2,
		'Bett gelöscht'
	);
	expect(active(trimmed)!.items[0].catalogId).toBe(DESK);
	expect(
		trimmed.variants.find((variant) => variant.id !== trimmed.activeVariantId)!.items
	).toHaveLength(2);
	await expect(budget).toContainText('250');
	await expect(budget).not.toContainText('495');

	await page.getByTestId('undo').click();
	await waitForProject(page, id, (p) => active(p)!.items.length === 2, 'Löschen rückgängig');
	await expect(budget).toContainText('495');
	const final = (await readProject(page, id))!;
	expect(final.variants).toHaveLength(2);
});
