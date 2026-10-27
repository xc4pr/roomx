import { fillNumber, waitForProject } from './helpers/app.ts';
import { exportPackage } from './helpers/export.ts';
import { test, expect } from './helpers/fixtures.ts';
import { elementsOf, newRoom, selectRow, slopeWall, slopesOf } from './helpers/raeume.ts';

test('Gaube mit Fenster: ein Fenster auf der Schrägwand, kein Befund, Stufe in der Wandansicht', async ({
	page
}) => {
	const id = await newRoom(page, 'Gaube E2E', 'bedroom');
	await slopeWall(page, 1);
	await fillNumber(page.getByTestId('slope-knee-1-0'), '100');

	await page.getByTestId('dormer-add-1-0').click();
	await expect(page.getByTestId('slope-dormer-1-0-0')).toBeVisible();
	const withDormer = await waitForProject(
		page,
		id,
		(p) => (slopesOf(p)[0]?.dormers?.length ?? 0) === 1,
		'Gaube angelegt'
	);
	const dormer = slopesOf(withDormer)[0].dormers![0];
	expect(dormer.to).toBeGreaterThan(dormer.from);

	await page.getByTestId('dormer-window-1-0-0').click();
	const built = await waitForProject(
		page,
		id,
		(p) => elementsOf(p).filter((e) => e.kind === 'window').length === 1,
		'Fenster in der Gaube'
	);
	const windows = elementsOf(built).filter((e) => e.kind === 'window');
	expect(windows).toHaveLength(1);
	expect(windows[0].wall).toBe(1);
	expect(windows[0].offset!).toBeGreaterThanOrEqual(dormer.from);
	expect(windows[0].offset! + windows[0].width).toBeLessThanOrEqual(dormer.to);

	await selectRow(page, windows[0].id);
	await expect(page.getByTestId('element-editor')).not.toContainText(
		'Ragt über die Raumhöhe hinaus'
	);
	await page.getByTestId('wall-view-toggle').click();
	const profile = page.getByTestId('wall-profile');
	await expect(profile).toBeAttached();
	const points = (await profile.getAttribute('points'))!.trim().split(/\s+/);
	// A plain sloped wall has a flat profile outline; the dormer adds steps.
	expect(points.length).toBeGreaterThanOrEqual(6);
	await expect(
		page.getByTestId('wall-elevation').locator(`[data-hit="${windows[0].id}"]`)
	).toHaveCount(1);
});

test('KI-Paket: Schrägen mit Abschnitt und Gauben, Dachfenster', async ({ page }) => {
	const id = await newRoom(page, 'Paket Schräge E2E', 'bedroom');
	await slopeWall(page, 1);
	await page.getByTestId('dormer-add-1-0').click();
	await waitForProject(
		page,
		id,
		(p) => (slopesOf(p)[0]?.dormers?.length ?? 0) === 1,
		'Gaube angelegt'
	);
	await page.getByTestId('slope-part-1').click();
	await waitForProject(
		page,
		id,
		(p) => slopesOf(p)[0]?.from !== undefined && slopesOf(p)[0]?.to !== undefined,
		'Abschnitt'
	);
	await page.getByTestId('tab-elements').click();
	await page.getByTestId('fit-all').click();
	await page.waitForTimeout(600);
	await page.locator('[data-testid="element-palette"] [data-kind="roofWindow"]').click();
	const target = await (async () => {
		const { roomPointToClient } = await import('./helpers/app.ts');
		return roomPointToClient(
			page,
			[
				{ x: 0, y: 0 },
				{ x: 4000, y: 0 },
				{ x: 4000, y: 3000 },
				{ x: 0, y: 3000 }
			],
			{ x: 3000, y: 60 }
		);
	})();
	await page.mouse.click(target.x, target.y);
	await waitForProject(
		page,
		id,
		(p) => elementsOf(p).some((e) => e.kind === 'roofWindow'),
		'Dachfenster'
	);

	const exported = await exportPackage(page);
	const slopes = (exported.json.rooms[0] as unknown as { slopes?: Record<string, unknown>[] })
		.slopes!;
	expect(slopes).toHaveLength(1);
	expect(slopes[0]).toMatchObject({ wall: 1 });
	expect(typeof slopes[0].from).toBe('number');
	expect(typeof slopes[0].to).toBe('number');
	expect((slopes[0].dormers as unknown[]).length).toBe(1);
	const roof = (
		exported.json.rooms[0] as unknown as { roofWindows?: { floorPolygon: unknown[] }[] }
	).roofWindows!;
	expect(roof).toHaveLength(1);
	expect(roof[0].floorPolygon.length).toBeGreaterThanOrEqual(4);
	expect(exported.instructions).toMatch(/dormers/);
	expect(exported.instructions).toMatch(/roofWindows/);
});
