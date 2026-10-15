import type { Page, Request } from '@playwright/test';
import { relayReset, relayStats, RELAY_WS, type RelayAgent } from '../mirror/helpers.ts';
import { addRoom, createProject, expect, skipTour, startPage, test } from './helpers.ts';

async function selectRoom(page: Page): Promise<void> {
	await page.waitForTimeout(500);
	const box = (await page.getByTestId('board').boundingBox())!;
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await expect(page.getByTestId('tab-photos')).toBeVisible();
}

interface Seen {
	url: string;
	source: string;
}

test('Spiegelung: ohne Auftrag keine Verbindung, mit Auftrag nur das lokale Relay, nach dem Ende wieder still', async ({
	newProfile,
	baseURL,
	browserName
}) => {
	test.setTimeout(180_000);
	const agent: RelayAgent = browserName === 'webkit' ? 'webkit' : 'chromium';
	await relayReset(agent);
	const origin = new URL(baseURL!).origin;
	const context = await newProfile().open();
	const seen: Seen[] = [];
	const note = (source: string) => (request: Request) =>
		seen.push({ url: request.url(), source: request.serviceWorker() ? 'serviceworker' : source });
	context.on('request', note('context'));
	context.on('page', (opened) => {
		opened.on('websocket', (socket) => seen.push({ url: socket.url(), source: 'websocket' }));
	});
	const page = await startPage(context);
	page.on('websocket', (socket) => seen.push({ url: socket.url(), source: 'websocket' }));

	const foreign = (allowed: string[]) =>
		seen.filter(
			(entry) =>
				!entry.url.startsWith('data:') &&
				!entry.url.startsWith('blob:') &&
				!entry.url.startsWith('about:') &&
				new URL(entry.url).origin !== origin &&
				!allowed.includes(new URL(entry.url).origin.replace(/^http/, 'ws'))
		);

	await skipTour(page);
	await createProject(page, 'Audit');
	await addRoom(page);
	for (const tab of ['tab-photos', 'tab-elements', 'tab-dims', 'tab-photos']) {
		await page.getByTestId(tab).click();
	}
	await page.goto('./');
	await page.getByTestId('project-card').click();
	await expect(page.getByTestId('board')).toBeVisible();
	await selectRoom(page);
	await page.getByTestId('tab-photos').click();
	await page.waitForTimeout(2500);
	expect(await relayStats(agent), 'Verbindungen ohne Auftrag').toMatchObject({
		connections: 0,
		open: 0
	});
	expect(foreign([]), 'fremde Anfragen ohne Auftrag').toEqual([]);
	expect(seen.filter((entry) => entry.source === 'websocket')).toEqual([]);

	await page.getByTestId('mirror-open').click();
	await page.getByTestId('mirror-create').click();
	await expect(page.getByTestId('mirror-link')).toHaveValue(/#pair=/);
	await expect
		.poll(async () => (await relayStats(agent)).connections, { timeout: 30_000 })
		.toBeGreaterThan(0);
	await page.waitForTimeout(1500);
	expect(foreign([RELAY_WS]), 'fremde Anfragen mit Auftrag').toEqual([]);
	const sockets = seen.filter((entry) => entry.source === 'websocket');
	expect(sockets.length).toBeGreaterThan(0);
	for (const socket of sockets) expect(socket.url.replace(/\/$/, '')).toBe(RELAY_WS);

	await page.getByRole('dialog').getByTestId('mirror-revoke').click();
	await page.getByRole('button', { name: 'Auftrag beenden' }).last().click();
	await expect(page.getByTestId('mirror-link')).toHaveCount(0);
	await page.waitForTimeout(1500);
	await expect.poll(async () => (await relayStats(agent)).open, { timeout: 15_000 }).toBe(0);
	const after = (await relayStats(agent)).connections;

	await page.reload();
	await expect(page.getByTestId('board')).toBeVisible();
	await selectRoom(page);
	await page.getByTestId('tab-photos').click();
	await page.waitForTimeout(2500);
	expect(await relayStats(agent), 'Verbindungen nach dem Ende').toMatchObject({
		connections: after
	});
	expect(foreign([RELAY_WS])).toEqual([]);
});
