import { addRoom, createProject } from './helpers/app.ts';
import { canvasStats } from './helpers/canvas.ts';
import { test, expect } from './helpers/fixtures.ts';

declare global {
	interface Window {
		__roomxLoseContext?: WEBGL_lose_context;
	}
}

test('3D-Ansicht übersteht Verlust und Wiederherstellung des WebGL-Kontexts', async ({ page }) => {
	await createProject(page, 'WebGL');
	await addRoom(page);
	await page.getByTestId('seg-3d').click();
	await expect(page).toHaveURL(/\/3d/);
	const viewer = page.getByTestId('viewer3d');
	const canvas = page.getByTestId('canvas3d');
	await expect(canvas).toBeVisible();
	await expect(viewer).toHaveAttribute('data-context', 'ok');
	await expect
		.poll(async () => (await canvasStats(page, canvas)).distinctColors, { timeout: 20_000 })
		.toBeGreaterThan(12);

	const hasLoseExtension = await canvas.evaluate((element) => {
		const target = element as HTMLCanvasElement;
		const gl = target.getContext('webgl2') ?? target.getContext('webgl');
		const extension = gl?.getExtension('WEBGL_lose_context');
		if (!extension) return false;
		window.__roomxLoseContext = extension;
		extension.loseContext();
		return true;
	});
	expect(hasLoseExtension).toBe(true);
	await expect(viewer).toHaveAttribute('data-context', 'lost');
	await expect(page.getByTestId('viewer-context-lost')).toBeVisible();

	await page.evaluate(() => window.__roomxLoseContext?.restoreContext());
	await expect(viewer).toHaveAttribute('data-context', 'ok', { timeout: 15_000 });
	await expect(page.getByTestId('viewer-context-lost')).toHaveCount(0);
	await expect(page.getByTestId('viewer-context-failed')).toHaveCount(0);
	await expect
		.poll(async () => (await canvasStats(page, canvas)).distinctColors, { timeout: 20_000 })
		.toBeGreaterThan(12);
	expect((await canvasStats(page, canvas)).luminanceDeviation).toBeGreaterThan(6);
});
