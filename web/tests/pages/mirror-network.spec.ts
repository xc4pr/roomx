import { networkInterfaces } from 'node:os';
import type { BrowserContext, Page, Request, WebSocket } from '@playwright/test';
import {
	createJob,
	openLink,
	relayReset,
	relayStats,
	RELAY_WS,
	type RelayAgent
} from '../mirror/helpers.ts';
import { addRoom, createProject, expect, skipTour, startPage, test } from './helpers.ts';

async function selectRoom(page: Page): Promise<void> {
	await page.waitForTimeout(500);
	const box = (await page.getByTestId('board').boundingBox())!;
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await expect(page.getByTestId('tab-photos')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

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

// Same as in tests/mirror/helpers.ts: WebKit hides host addresses behind mDNS names that nothing resolves in the container, so every name becomes each local address.
function resolveMdns(hosts: string[]): void {
	const name = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.local/;
	const prototype = RTCPeerConnection.prototype;
	const setRemote = prototype.setRemoteDescription;
	prototype.setRemoteDescription = function (description) {
		const fixed = description && {
			type: description.type,
			sdp: description.sdp
				?.split('\r\n')
				.flatMap((line) =>
					line.startsWith('a=candidate:') && name.test(line)
						? hosts.map((host) => line.replace(name, host))
						: [line]
				)
				.join('\r\n')
		};
		return (setRemote as (d: unknown) => Promise<void>).call(this, fixed);
	};
	const addCandidate = prototype.addIceCandidate;
	prototype.addIceCandidate = async function (candidate) {
		const text = candidate?.candidate;
		const variants =
			text && name.test(text) ? hosts.map((host) => text.replace(name, host)) : [text];
		const results = await Promise.allSettled(
			variants.map((variant) =>
				(addCandidate as (c: unknown) => Promise<void>).call(
					this,
					candidate && {
						candidate: variant,
						sdpMid: candidate.sdpMid,
						sdpMLineIndex: candidate.sdpMLineIndex,
						usernameFragment: candidate.usernameFragment
					}
				)
			)
		);
		const failed = results.find((result) => result.status === 'rejected');
		if (failed && results.every((result) => result.status === 'rejected')) throw failed.reason;
	};
}

async function openPeer(
	newProfile: () => { open: () => Promise<BrowserContext> },
	browserName: string
): Promise<BrowserContext> {
	const context = await newProfile().open();
	if (browserName === 'webkit') {
		const found = Object.values(networkInterfaces())
			.flat()
			.filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
			.map((entry) => entry!.address);
		await context.addInitScript(resolveMdns, ['127.0.0.1', ...new Set(found)]);
	}
	return context;
}

interface PhoneAudit {
	page: Page;
	seen: Seen[];
	sockets: WebSocket[];
	foreign: (allowed: string[]) => Seen[];
	openSockets: () => number;
}

async function openPhone(context: BrowserContext, origin: string): Promise<PhoneAudit> {
	const seen: Seen[] = [];
	const sockets: WebSocket[] = [];
	context.on('request', (request: Request) =>
		seen.push({
			url: request.url(),
			source: request.serviceWorker() ? 'serviceworker' : 'context'
		})
	);
	const page = await startPage(context);
	page.on('websocket', (socket) => {
		sockets.push(socket);
		seen.push({ url: socket.url(), source: 'websocket' });
	});
	return {
		page,
		seen,
		sockets,
		openSockets: () => sockets.filter((socket) => !socket.isClosed()).length,
		foreign: (allowed) =>
			seen.filter(
				(entry) =>
					!entry.url.startsWith('data:') &&
					!entry.url.startsWith('blob:') &&
					!entry.url.startsWith('about:') &&
					new URL(entry.url).origin !== origin &&
					!allowed.includes(new URL(entry.url).origin.replace(/^http/, 'ws'))
			)
	};
}

async function startPc(page: Page): Promise<string> {
	await skipTour(page);
	await createProject(page, 'Audit');
	await addRoom(page);
	await selectRoom(page);
	return createJob(page);
}

test('Handy: ohne offenen Auftrag keine Verbindung und keine fremde Anfrage', async ({
	newProfile,
	baseURL,
	browserName
}) => {
	test.setTimeout(120_000);
	const agent: RelayAgent = browserName === 'webkit' ? 'webkit' : 'chromium';
	await relayReset(agent);
	const phone = await openPhone(await newProfile().open(), new URL(baseURL!).origin);
	await skipTour(phone.page);
	await expect(phone.page.getByTestId('open-camera-jobs')).toHaveCount(0);
	await phone.page.waitForTimeout(2500);
	expect(await relayStats(agent), 'Verbindungen ohne Auftrag').toMatchObject({
		connections: 0,
		open: 0
	});
	expect(phone.foreign([]), 'fremde Anfragen des Handys').toEqual([]);
	expect(phone.sockets).toEqual([]);
});

test('Handy: mit Link nur eigene Origin und Relay, nach Löschen still', async ({
	newProfile,
	baseURL,
	browserName
}) => {
	test.setTimeout(180_000);
	const agent: RelayAgent = browserName === 'webkit' ? 'webkit' : 'chromium';
	await relayReset(agent);
	const pc = await startPage(await openPeer(newProfile, browserName));
	const link = await startPc(pc);
	await expect
		.poll(async () => (await relayStats(agent)).open, { timeout: 30_000 })
		.toBeGreaterThan(0);

	const phone = await openPhone(await openPeer(newProfile, browserName), new URL(baseURL!).origin);
	await openLink(phone.page, link);
	await expect(phone.page.getByTestId('camera-status')).toContainText('Verbunden', {
		timeout: 30_000
	});
	await expect.poll(() => phone.openSockets(), { timeout: 30_000 }).toBeGreaterThan(0);
	await phone.page.waitForTimeout(1500);
	expect(phone.foreign([RELAY_WS]), 'fremde Anfragen des Handys mit Auftrag').toEqual([]);
	expect(phone.sockets.length).toBeGreaterThan(0);
	for (const socket of phone.sockets) expect(socket.url().replace(/\/$/, '')).toBe(RELAY_WS);

	await pc.getByRole('dialog').getByTestId('mirror-revoke').click();
	await pc.getByRole('button', { name: 'Auftrag beenden' }).last().click();
	await expect(pc.getByTestId('mirror-link')).toHaveCount(0);
	await phone.page.getByTestId('camera-delete').click();
	await phone.page
		.getByRole('dialog')
		.getByRole('button', { name: 'Löschen', exact: true })
		.click();
	await expect(phone.page).not.toHaveURL(/\/m\//);
	await expect.poll(() => phone.openSockets(), { timeout: 15_000 }).toBe(0);
	await expect.poll(async () => (await relayStats(agent)).open, { timeout: 15_000 }).toBe(0);
	const after = (await relayStats(agent)).connections;
	const socketsBefore = phone.sockets.length;

	await phone.page.reload();
	await expect(phone.page.getByRole('heading', { level: 1 })).toBeVisible();
	await phone.page.waitForTimeout(2500);
	expect(phone.sockets.length, 'neue WebSockets des Handys nach dem Löschen').toBe(socketsBefore);
	expect(phone.openSockets()).toBe(0);
	expect(await relayStats(agent), 'Relay nach dem Löschen').toMatchObject({
		connections: after,
		open: 0
	});
	expect(phone.foreign([RELAY_WS]), 'fremde Anfragen nach dem Löschen').toEqual([]);
});
