import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PHOTO = fileURLToPath(new URL('../fixtures/pages/foto.jpg', import.meta.url));

export interface Profile {
	dir: string;
	open: () => Promise<BrowserContext>;
}

interface Fixtures {
	newProfile: () => Profile;
	errors: string[];
}

export const test = base.extend<Fixtures>({
	newProfile: async (
		{ playwright, browserName, viewport, userAgent, locale, baseURL, deviceScaleFactor },
		use
	) => {
		const dirs: string[] = [];
		const opened: BrowserContext[] = [];
		await use(() => {
			const dir = mkdtempSync(join(tmpdir(), 'roomx-pages-'));
			dirs.push(dir);
			return {
				dir,
				open: async () => {
					const context = await playwright[browserName].launchPersistentContext(dir, {
						viewport,
						userAgent,
						locale,
						baseURL,
						deviceScaleFactor,
						serviceWorkers: 'allow',
						acceptDownloads: true
					});
					opened.push(context);
					return context;
				}
			};
		});
		await Promise.all(opened.map((context) => context.close().catch(() => undefined)));
		for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	},
	errors: [
		async ({ page }, use) => {
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await use(errors);
			expect(
				errors.filter((message) => !/due to access control checks/.test(message)),
				'uncaught page errors'
			).toEqual([]);
		},
		{ auto: true }
	]
});

export { expect };

export function projectIdOf(page: Page): string {
	const match = /\/p\/([^/?#]+)/.exec(new URL(page.url()).pathname);
	if (!match) throw new Error(`no project in ${page.url()}`);
	return match[1];
}

export async function startPage(context: BrowserContext): Promise<Page> {
	const page = context.pages()[0] ?? (await context.newPage());
	return page;
}

export async function skipTour(page: Page): Promise<void> {
	await page.goto('./');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	const skip = page.getByTestId('guide-skip').first();
	await skip.waitFor({ timeout: 10_000 });
	await skip.click();
	await expect(page.getByTestId('guide-card')).toHaveCount(0);
}

export async function createProject(page: Page, name: string): Promise<string> {
	const empty = page.getByTestId('empty-create');
	const fab = page.getByTestId('new-project');
	await expect(empty.or(fab)).toBeVisible();
	await ((await empty.isVisible()) ? empty : fab).click();
	await page.getByTestId('project-name').fill(name);
	await page.getByTestId('create-project').click();
	await expect(page).toHaveURL(/\/p\/[^/]+$/);
	await expect(page.getByTestId('board')).toBeVisible();
	return projectIdOf(page);
}

export async function addRoom(page: Page): Promise<void> {
	const empty = page.getByTestId('empty-add');
	const fab = page.getByTestId('add-room');
	await expect(empty.or(fab)).toBeVisible();
	await ((await empty.isVisible()) ? empty : fab).click();
	await expect(page.getByTestId('room-name')).toHaveCount(1);
}

export async function addPhoto(page: Page): Promise<void> {
	await page.getByTestId('tab-photos').click();
	await page.getByTestId('tour-start').click();
	await page.getByTestId('tour-library-input').setInputFiles(PHOTO);
}

export interface Stored {
	name: string;
	rooms: {
		polygon: { x: number; y: number }[];
		elements: { kind: string }[];
		photos: { hash: string }[];
	}[];
	variants: { id: string; items: unknown[] }[];
	activeVariantId?: string;
}

export async function readProject(page: Page, id: string): Promise<Stored | undefined> {
	return page.evaluate(
		(projectId) =>
			new Promise<Stored | undefined>((resolve, reject) => {
				const open = indexedDB.open('roomx');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const database = open.result;
					const request = database.transaction('projects').objectStore('projects').get(projectId);
					request.onerror = () => reject(request.error);
					request.onsuccess = () => {
						database.close();
						resolve(request.result as Stored | undefined);
					};
				};
			}),
		id
	);
}

export async function roomPointToClient(
	page: Page,
	polygon: { x: number; y: number }[],
	point: { x: number; y: number }
): Promise<{ x: number; y: number }> {
	const rect = await page.locator('[data-catcher]').evaluate((node) => {
		const box = node.getBoundingClientRect();
		return { left: box.left, bottom: box.bottom, width: box.width };
	});
	const xs = polygon.map((p) => p.x);
	const ys = polygon.map((p) => p.y);
	const margin = 1500;
	const minX = Math.min(...xs) - margin;
	const minY = Math.min(...ys) - margin;
	const scale = rect.width / (Math.max(...xs) - Math.min(...xs) + margin * 2);
	return { x: rect.left + (point.x - minX) * scale, y: rect.bottom - (point.y - minY) * scale };
}

export async function placeElement(
	page: Page,
	id: string,
	kind: string,
	point: { x: number; y: number }
): Promise<void> {
	const before = (await readProject(page, id))?.rooms[0].elements.length ?? 0;
	await page.getByTestId('tab-elements').click();
	await page.getByTestId('fit-all').click();
	await page.waitForTimeout(600);
	await page.locator(`[data-testid="element-palette"] [data-kind="${kind}"]`).click();
	const polygon = (await readProject(page, id))!.rooms[0].polygon;
	const target = await roomPointToClient(page, polygon, point);
	await page.mouse.click(target.x, target.y);
	await expect
		.poll(async () => (await readProject(page, id))?.rooms[0].elements.length)
		.toBe(before + 1);
}
