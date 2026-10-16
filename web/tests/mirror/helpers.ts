import {
	test as base,
	expect,
	type BrowserContext,
	type Locator,
	type Page
} from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	addRoom,
	createProject,
	jpegUpload,
	lPolygon,
	makeJpeg,
	placeElement,
	readProject,
	setLTemplate,
	waitForProject,
	type StoredProject
} from '../helpers/app.ts';

export { expect, jpegUpload, makeJpeg, readProject, waitForProject };

export const RELAY_HTTP = 'http://127.0.0.1:4275';
export const RELAY_WS = 'ws://127.0.0.1:4275';

const SEED = { tourSeen: true, installHintSeen: true, language: 'de', unit: 'cm' };
const ROOM = { a: 5400, b: 4200, c: 2600, d: 2200 };
const PHONE_VIEWPORT = { width: 390, height: 844 };

// WebKit hides host addresses behind mDNS names that nothing resolves in a container. Both peers run on this machine, so every name is replaced by each of its own addresses and ICE picks the one that answers.
export function resolveMirrorMdns(hosts: string[]): void {
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

// Logs the state changes of every peer connection to the console, so a failed run shows where the connection stopped.
function traceRtc(): void {
	const Native = window.RTCPeerConnection;
	if (!Native) return;
	let count = 0;
	window.RTCPeerConnection = class extends Native {
		constructor(...args: ConstructorParameters<typeof RTCPeerConnection>) {
			super(...args);
			const id = ++count;
			const log = (what: string) => console.debug(`[rtc ${id}] ${what}`);
			this.addEventListener('iceconnectionstatechange', () =>
				log(`ice ${this.iceConnectionState}`)
			);
			this.addEventListener('connectionstatechange', () => log(`conn ${this.connectionState}`));
		}
	};
}

export function localAddresses(): string[] {
	const found = Object.values(networkInterfaces())
		.flat()
		.filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
		.map((entry) => entry!.address);
	return ['127.0.0.1', ...new Set(found)];
}

export interface PhoneOptions {
	clockAt?: Date;
	noShare?: boolean;
}

interface World {
	desktop: () => Promise<Page>;
	phone: (options?: PhoneOptions) => Promise<Page>;
	newDesktopPage: (page: Page) => Promise<Page>;
}

export const test = base.extend<{ world: World }>({
	world: async (
		{
			browser,
			browserName,
			playwright,
			viewport,
			hasTouch,
			isMobile,
			locale,
			userAgent,
			deviceScaleFactor,
			baseURL
		},
		use,
		testInfo
	) => {
		const contexts: BrowserContext[] = [];
		const started = Date.now();
		const lines: string[] = [];
		const folders: string[] = [];
		const errors: string[] = [];

		async function open(
			options: Parameters<typeof browser.newContext>[0]
		): Promise<BrowserContext> {
			const full = {
				locale,
				baseURL,
				serviceWorkers: 'allow' as const,
				acceptDownloads: true,
				...options
			};
			let context: BrowserContext;
			if (browserName === 'webkit') {
				const folder = mkdtempSync(join(tmpdir(), 'roomx-mirror-'));
				folders.push(folder);
				context = await playwright.webkit.launchPersistentContext(folder, full);
			} else {
				context = await browser.newContext(full);
			}
			await context.addInitScript((value) => {
				try {
					if (!localStorage.getItem('roomx.settings')) {
						localStorage.setItem('roomx.settings', JSON.stringify(value));
					}
				} catch {
					return;
				}
			}, SEED);
			await context.addInitScript(traceRtc);
			if (browserName === 'webkit')
				await context.addInitScript(resolveMirrorMdns, localAddresses());
			contexts.push(context);
			return context;
		}

		function watch(page: Page, label: string): Page {
			const stamp = () => `${((Date.now() - started) / 1000).toFixed(1).padStart(6)}s ${label}`;
			page.on('pageerror', (error) => {
				errors.push(error.message);
				lines.push(`${stamp()} pageerror ${error.message}`);
			});
			page.on('console', (message) => lines.push(`${stamp()} ${message.type()} ${message.text()}`));
			return page;
		}

		const world: World = {
			desktop: async () => {
				const context = await open({
					viewport,
					hasTouch,
					isMobile,
					userAgent,
					deviceScaleFactor
				});
				return watch(context.pages()[0] ?? (await context.newPage()), 'PC');
			},
			newDesktopPage: async (page) => watch(await page.context().newPage(), 'PC'),
			phone: async ({ clockAt, noShare = true } = {}) => {
				const context = await open({
					viewport: PHONE_VIEWPORT,
					hasTouch: true,
					isMobile: true,
					deviceScaleFactor: 2,
					permissions: browserName === 'chromium' ? ['camera'] : undefined
				});
				if (noShare) {
					await context.addInitScript(() => {
						Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
						Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
					});
				}
				const page = watch(context.pages()[0] ?? (await context.newPage()), 'Handy');
				if (clockAt) await page.clock.install({ time: clockAt });
				return page;
			}
		};

		await use(world);
		// Errors while the contexts close below (a channel torn down mid-send) do not count.
		const uncaught = errors.filter((message) => !/due to access control checks/.test(message));
		if (testInfo.status !== testInfo.expectedStatus || uncaught.length > 0) {
			const stats = await fetch(`${RELAY_HTTP}/stats`)
				.then((response) => response.text())
				.catch((error: unknown) => `stats unavailable: ${String(error)}`);
			const log = testInfo.outputPath('mirror-console.txt');
			writeFileSync(log, lines.join('\n'));
			await testInfo.attach('mirror-console', { path: log, contentType: 'text/plain' });
			await testInfo.attach('relay-stats', { body: stats, contentType: 'application/json' });
		}
		await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
		for (const folder of folders) rmSync(folder, { recursive: true, force: true });
		expect(uncaught, 'uncaught page errors').toEqual([]);
	}
});

export interface Prepared {
	id: string;
	polygon: ReturnType<typeof lPolygon>;
}

export async function prepareProject(page: Page, name = 'Foto-Test'): Promise<Prepared> {
	const polygon = lPolygon(ROOM);
	const id = await createProject(page, name);
	await addRoom(page);
	await setLTemplate(page, ROOM);
	await waitForProject(
		page,
		id,
		(project) => JSON.stringify(project.rooms[0]?.polygon) === JSON.stringify(polygon),
		'L-Raum'
	);
	await placeElement(page, id, 'door', polygon, { x: 1500, y: 150 });
	await placeElement(page, id, 'window', polygon, { x: 1300, y: ROOM.b - 150 });
	return { id, polygon };
}

export async function createJob(page: Page): Promise<string> {
	await page.getByTestId('tab-photos').click();
	await page.getByTestId('mirror-open').click();
	await page.getByTestId('mirror-create').click();
	const link = page.getByTestId('mirror-link');
	await expect(link).toHaveValue(/#pair=/);
	return link.inputValue();
}

export function jobDialogStatus(page: Page): Locator {
	return page.getByRole('dialog').getByTestId('mirror-status');
}

export async function openLink(phone: Page, link: string): Promise<string> {
	await phone.goto(link);
	await expect(phone).toHaveURL(/\/m\/[^/?#]+$/);
	return new URL(phone.url()).pathname.split('/').pop()!;
}

export async function openRoomCapture(phone: Page, how: 'now' | 'later'): Promise<void> {
	if (how === 'now') {
		await phone.getByTestId('camera-now').click();
	} else {
		await phone.getByTestId('camera-later').click();
		await phone.getByTestId('camera-room-0-go').click();
	}
	await expect(phone.getByTestId('camera-capture')).toBeVisible();
}

export async function takePhotos(
	phone: Page,
	count: number,
	browserName: string,
	hueBase = 10
): Promise<string[]> {
	const captions: string[] = [];
	const caption = phone.getByTestId('camera-caption');
	for (let i = 0; i < count; i++) {
		await expect(caption).toBeVisible();
		const before = await caption.innerText();
		captions.push(before);
		if (browserName === 'webkit') {
			const bytes = await makeJpeg(phone, { hue: hueBase + i * 70 });
			await phone
				.getByTestId('camera-file-input')
				.setInputFiles(jpegUpload(bytes, `foto-${i}.jpg`));
		} else {
			const shutter = phone.getByTestId('camera-shutter');
			await expect(shutter).toBeEnabled({ timeout: 20_000 });
			await shutter.click();
		}
		await expect
			.poll(async () => (await caption.count()) === 0 || (await caption.innerText()) !== before, {
				timeout: 20_000
			})
			.toBe(true);
	}
	return captions;
}

export async function closeCapture(phone: Page): Promise<void> {
	const capture = phone.getByTestId('camera-capture');
	if (await capture.isVisible()) await phone.getByTestId('camera-exit').click();
	await expect(capture).toHaveCount(0);
}

export async function openProject(page: Page, id: string): Promise<void> {
	await page.goto(`/p/${id}`);
	await expect(page.getByTestId('board')).toBeVisible();
}

export function photosOf(project: StoredProject | undefined): {
	hash: string;
	stepKey: string | undefined;
	caption: string;
}[] {
	const rooms = (project?.rooms ?? []) as unknown as {
		photos: { hash: string; perspective: { stepKey?: string; caption: { de: string } } }[];
	}[];
	return rooms.flatMap((room) =>
		room.photos.map((photo) => ({
			hash: photo.hash,
			stepKey: photo.perspective.stepKey,
			caption: photo.perspective.caption.de
		}))
	);
}

export async function countStore(page: Page, store: 'mirrorJobs' | 'mirrorShots'): Promise<number> {
	return page.evaluate(
		(name) =>
			new Promise<number>((resolve, reject) => {
				const open = indexedDB.open('roomx');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const database = open.result;
					if (!database.objectStoreNames.contains(name)) {
						database.close();
						resolve(0);
						return;
					}
					const request = database.transaction(name).objectStore(name).count();
					request.onerror = () => reject(request.error);
					request.onsuccess = () => {
						database.close();
						resolve(request.result);
					};
				};
			}),
		store
	);
}

export interface RelayStats {
	connections: number;
	open: number;
	events: number;
}

export type RelayAgent = 'chromium' | 'webkit';

export async function relayStats(agent?: RelayAgent): Promise<RelayStats> {
	const response = await fetch(`${RELAY_HTTP}/stats${agent ? `?agent=${agent}` : ''}`);
	return (await response.json()) as RelayStats;
}

export async function relayReset(agent?: RelayAgent): Promise<void> {
	await fetch(`${RELAY_HTTP}/reset${agent ? `?agent=${agent}` : ''}`);
}
