import type { Download, Request } from '@playwright/test';
import {
	addPhoto,
	addRoom,
	createProject,
	expect,
	placeElement,
	readProject,
	skipTour,
	startPage,
	test
} from './helpers.ts';

interface Seen {
	url: string;
	source: string;
}

test('Netzwerk-Audit: ganzer Ablauf, nur eigene Origin', async ({
	newProfile,
	baseURL,
	browserName
}) => {
	test.setTimeout(240_000);
	const origin = new URL(baseURL!).origin;
	const context = await newProfile().open();
	const seen: Seen[] = [];
	const downloads: Download[] = [];
	const note = (source: string) => (request: Request) =>
		seen.push({ url: request.url(), source: request.serviceWorker() ? 'serviceworker' : source });

	context.on('request', note('context'));
	context.on('page', (opened) => {
		opened.on('websocket', (socket) => seen.push({ url: socket.url(), source: 'websocket' }));
		opened.on('download', (download) => downloads.push(download));
		opened.on('popup', (popup) => seen.push({ url: popup.url(), source: 'popup' }));
	});

	const page = await startPage(context);
	page.on('websocket', (socket) => seen.push({ url: socket.url(), source: 'websocket' }));
	page.on('download', (download) => downloads.push(download));

	await skipTour(page);
	const id = await createProject(page, 'Audit');
	await addRoom(page);

	const polygon = (await readProject(page, id))!.rooms[0].polygon;
	const xs = polygon.map((p) => p.x);
	const ys = polygon.map((p) => p.y);
	const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
	await placeElement(page, id, 'door', { x: midX, y: Math.min(...ys) + 150 });
	await placeElement(page, id, 'window', { x: midX, y: Math.max(...ys) - 150 });

	await addPhoto(page);
	await expect.poll(async () => (await readProject(page, id))?.rooms[0].photos.length).toBe(1);

	await page.getByTestId('seg-furnish').click();
	await expect(page.getByTestId('furnish-screen')).toBeVisible();
	const panel = page.getByTestId('catalog-panel');
	if (!(await panel.isVisible())) await page.getByTestId('catalog-fab').click();
	await expect(panel).toBeVisible();
	await page.locator('[data-catalog-id="generic-desk-160x80"]').click();
	await expect
		.poll(async () => {
			const project = await readProject(page, id);
			return project?.variants.find((v) => v.id === project.activeVariantId)?.items.length;
		})
		.toBe(1);

	await page.goto(`p/${id}`);
	await expect(page.getByTestId('board')).toBeVisible();
	await page.getByTestId('build').click();
	await page.getByTestId('check-proceed').click();
	await expect(page).toHaveURL(/\/3d/);
	await expect(page.getByTestId('canvas3d')).toBeVisible();
	await page.waitForTimeout(2000);

	await page.getByTestId('to-package').click();
	await expect(page).toHaveURL(/\/share/);
	await expect(page.getByTestId('export-panel')).toBeVisible();
	await page.getByTestId('create-package').click();
	const proceed = page.getByTestId('check-proceed');
	const ready = page.getByTestId('package-ready');
	await expect(proceed.or(ready)).toBeVisible({ timeout: 60_000 });
	if (await proceed.isVisible()) await proceed.click();
	await expect(ready).toBeVisible({ timeout: 60_000 });
	await page.getByTestId('download-package').click();
	await expect.poll(() => downloads.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);

	await page.goto('settings');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await page.goto('rechtliches');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await page.goto('./');
	await expect(page.getByTestId('project-card')).toHaveCount(1);
	await page.reload();
	await expect(page.getByTestId('project-card')).toHaveCount(1);
	await page.waitForTimeout(1000);

	const foreign = seen.filter(
		(entry) =>
			!entry.url.startsWith('data:') &&
			!entry.url.startsWith('blob:') &&
			!entry.url.startsWith('about:') &&
			new URL(entry.url).origin !== origin
	);
	expect(foreign, `fremde Anfragen (${browserName})`).toEqual([]);
	expect(seen.length).toBeGreaterThan(20);
	expect(seen.filter((entry) => entry.source === 'serviceworker').length).toBeGreaterThan(0);
	expect(seen.filter((entry) => entry.source === 'websocket')).toEqual([]);
});
