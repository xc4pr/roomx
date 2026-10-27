import { fillNumber, waitForProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';
import {
	newRoom,
	openSlopes,
	reloadProject,
	setRoomHeight,
	slopeWall,
	slopesOf
} from './helpers/raeume.ts';

test('Schräge: Tiefe statt Neigung, umgekehrt, gespeichert', async ({ page }) => {
	const id = await newRoom(page, 'Schräge Tiefe E2E', 'bedroom');
	await setRoomHeight(page, id, 2500);
	await slopeWall(page, 1);
	const section = 'slope-section-1-0';

	await fillNumber(page.getByTestId(`slope-knee-1-0`), '50');
	await page.getByRole('radio', { name: 'Tiefe' }).click();
	await fillNumber(page.getByTestId('slope-depth-1-0'), '200');
	const byDepth = await waitForProject(
		page,
		id,
		(p) => Math.abs(slopesOf(p)[0]?.angle - 45) < 0.2 && slopesOf(p)[0].kneeHeight === 500,
		'45° aus Tiefe 2 m'
	);
	expect(slopesOf(byDepth)).toHaveLength(1);
	await expect(page.getByTestId('slope-both-1-0')).toContainText('45');

	await page.getByRole('radio', { name: 'Neigung' }).click();
	await fillNumber(page.getByTestId('slope-angle-1-0'), '30');
	await waitForProject(page, id, (p) => slopesOf(p)[0].angle === 30, 'Neigung 30°');
	const expected = Math.round((2500 - 500) / Math.tan((30 * Math.PI) / 180));
	await expect(page.getByTestId('slope-both-1-0')).toContainText('30');
	await page.getByRole('radio', { name: 'Tiefe' }).click();
	const raw = await page.getByTestId('slope-depth-1-0').inputValue();
	const shown = Number(raw.replace(',', '.').replace(/[^\d.]/g, ''));
	expect(Math.abs(shown * 10 - expected)).toBeLessThan(15);

	await reloadProject(page);
	await page.locator('[data-room-id]').first().click();
	await openSlopes(page);
	await expect(page.getByTestId(section)).toBeVisible();
	await expect(page.getByTestId('slope-both-1-0')).toContainText('30');
	await expect(page.getByTestId('slope-knee-1-0')).toHaveValue('50');
});

test('Teil-Schräge: zwei Abschnitte, Schraffur nur dort, 3D ohne Fehler', async ({ page }) => {
	const consoleErrors: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error') consoleErrors.push(message.text());
	});
	const id = await newRoom(page, 'Teilschräge E2E', 'bedroom');
	await slopeWall(page, 1);
	await expect(page.getByTestId('slope-layer')).toBeAttached();

	await page.getByTestId('slope-part-1').click();
	await fillNumber(page.getByTestId('slope-from-1-0'), '50');
	await fillNumber(page.getByTestId('slope-to-1-0'), '150');
	await waitForProject(
		page,
		id,
		(p) => slopesOf(p)[0]?.from === 500 && slopesOf(p)[0]?.to === 1500,
		'Abschnitt 50 bis 150 cm'
	);
	await page.getByTestId('slope-add-1').click();
	await expect(page.getByTestId('slope-section-1-1')).toBeVisible();
	const two = await waitForProject(page, id, (p) => slopesOf(p).length === 2, 'zwei Abschnitte');
	const [first, second] = slopesOf(two);
	expect(first.wall).toBe(1);
	expect(second.wall).toBe(1);
	expect(second.from!).toBeGreaterThanOrEqual(first.to!);
	expect(second.to!).toBeLessThanOrEqual(4000);

	const shapes = page.locator('[data-testid="slope-layer"] [data-testid]');
	await expect(shapes.first()).toBeAttached();
	const hatch = page.locator('[data-testid="slope-layer"] path[fill^="url(#slope-hatch"]');
	await expect.poll(() => hatch.count()).toBeGreaterThanOrEqual(2);
	// Hatching sits on the sloped stretches only: the strip along the wall is shorter than the wall.
	const widths = await hatch.evaluateAll((nodes) =>
		nodes.map((node) => (node as SVGGraphicsElement).getBBox().width)
	);
	for (const width of widths) expect(width).toBeLessThan(4000 * 0.9);

	await reloadProject(page);
	const stored = await waitForProject(page, id, (p) => slopesOf(p).length === 2, 'gespeichert');
	expect(slopesOf(stored).map((s) => s.from)).toEqual([first.from, second.from]);

	await page.getByTestId('seg-3d').click();
	await expect(page.getByTestId('canvas3d')).toBeVisible();
	await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-context', 'ok');
	await page.waitForTimeout(1500);
	expect(consoleErrors).toEqual([]);
});
