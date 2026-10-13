import { expect, type Locator, type Page } from '@playwright/test';

export interface PolyPoint {
	x: number;
	y: number;
}

export interface StoredElement {
	id: string;
	kind: string;
	status: string;
	wall?: number;
	offset?: number;
	width?: number;
	elevation?: number;
}

export interface StoredItem {
	id: string;
	roomId: string;
	name: string;
	catalogId?: string;
	x: number;
	y: number;
	rotation: number;
	elevation: number;
	onItemId?: string;
	dims: { w: number; d: number; h: number };
	priceChf?: number;
}

export interface StoredRoom {
	id: string;
	name: string;
	height: number;
	polygon: PolyPoint[];
	elements: StoredElement[];
	photos: { id: string; perspective: { kind: string } }[];
	boardPos: { x: number; y: number; rot: number };
}

export interface StoredProject {
	id: string;
	name: string;
	rev: number;
	deleted?: boolean;
	rooms: StoredRoom[];
	variants: { id: string; name: string; items: StoredItem[]; suggestions: unknown[] }[];
	activeVariantId?: string;
}

export const TOKEN = 'e2e-token';

export function projectIdOf(page: Page): string {
	const match = /\/p\/([^/?#]+)/.exec(new URL(page.url()).pathname);
	if (!match) throw new Error(`no project in ${page.url()}`);
	return match[1];
}

export async function readProject(page: Page, id: string): Promise<StoredProject | undefined> {
	return page.evaluate(
		(projectId) =>
			new Promise<StoredProject | undefined>((resolve, reject) => {
				const open = indexedDB.open('roomx');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const database = open.result;
					const request = database.transaction('projects').objectStore('projects').get(projectId);
					request.onerror = () => reject(request.error);
					request.onsuccess = () => {
						database.close();
						resolve(request.result as StoredProject | undefined);
					};
				};
			}),
		id
	);
}

export async function readAllProjects(page: Page): Promise<StoredProject[]> {
	return page.evaluate(
		() =>
			new Promise<StoredProject[]>((resolve, reject) => {
				const open = indexedDB.open('roomx');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const database = open.result;
					const request = database.transaction('projects').objectStore('projects').getAll();
					request.onerror = () => reject(request.error);
					request.onsuccess = () => {
						database.close();
						resolve(request.result as StoredProject[]);
					};
				};
			})
	);
}

export async function waitForProject(
	page: Page,
	id: string,
	check: (project: StoredProject) => boolean,
	message = 'project state'
): Promise<StoredProject> {
	let latest: StoredProject | undefined;
	await expect
		.poll(
			async () => {
				latest = await readProject(page, id);
				return latest ? check(latest) : false;
			},
			{ message, timeout: 10_000 }
		)
		.toBe(true);
	return latest as StoredProject;
}

export async function openProjects(page: Page): Promise<void> {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

export async function createProject(page: Page, name: string): Promise<string> {
	await openProjects(page);
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

export async function fillNumber(field: Locator, value: string): Promise<void> {
	await field.fill(value);
	await field.press('Enter');
}

export async function setLTemplate(
	page: Page,
	values: Record<'a' | 'b' | 'c' | 'd', number>
): Promise<void> {
	await page.getByTestId('tab-dims').click();
	await page.getByTestId('seg-template').click();
	await page.getByTestId('template-l').click();
	for (const [key, mm] of Object.entries(values)) {
		const input = page.locator(`[data-key="${key}"] input`);
		await fillNumber(input, String(mm / 10));
	}
}

export function lPolygon(v: Record<'a' | 'b' | 'c' | 'd', number>): PolyPoint[] {
	return [
		{ x: 0, y: 0 },
		{ x: v.a, y: 0 },
		{ x: v.a, y: v.d },
		{ x: v.c, y: v.d },
		{ x: v.c, y: v.b },
		{ x: 0, y: v.b }
	];
}

export async function tapAt(page: Page, x: number, y: number): Promise<void> {
	const touch = await page.evaluate(() => navigator.maxTouchPoints > 0);
	if (touch) await page.touchscreen.tap(x, y);
	else await page.mouse.click(x, y);
}

export async function roomPointToClient(
	page: Page,
	polygon: PolyPoint[],
	point: PolyPoint
): Promise<{ x: number; y: number }> {
	const catcher = page.locator('[data-catcher]');
	await expect(catcher).toBeAttached();
	const rect = await catcher.evaluate((node) => {
		const box = node.getBoundingClientRect();
		return { left: box.left, bottom: box.bottom, width: box.width };
	});
	const xs = polygon.map((p) => p.x);
	const ys = polygon.map((p) => p.y);
	const margin = 1500;
	const minX = Math.min(...xs) - margin;
	const minY = Math.min(...ys) - margin;
	const spanX = Math.max(...xs) - Math.min(...xs) + margin * 2;
	const scale = rect.width / spanX;
	return { x: rect.left + (point.x - minX) * scale, y: rect.bottom - (point.y - minY) * scale };
}

export async function placeElement(
	page: Page,
	id: string,
	kind: string,
	polygon: PolyPoint[],
	point: PolyPoint
): Promise<StoredProject> {
	const before = (await readProject(page, id))?.rooms[0].elements.length ?? 0;
	await page.getByTestId('tab-elements').click();
	await page.getByTestId('fit-all').click();
	await page.waitForTimeout(600);
	await page.locator(`[data-testid="element-palette"] [data-kind="${kind}"]`).click();
	const target = await roomPointToClient(page, polygon, point);
	await tapAt(page, target.x, target.y);
	return waitForProject(
		page,
		id,
		(project) => project.rooms[0].elements.length === before + 1,
		`${kind} placed`
	);
}

export async function makeJpeg(
	page: Page,
	options: { width?: number; height?: number; hue?: number } = {}
): Promise<Buffer> {
	const base64 = await page.evaluate(async ({ width = 1600, height = 1200, hue = 30 }) => {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('no 2d context');
		const gradient = context.createLinearGradient(0, 0, width, height);
		gradient.addColorStop(0, `hsl(${hue} 70% 55%)`);
		gradient.addColorStop(1, `hsl(${(hue + 120) % 360} 60% 35%)`);
		context.fillStyle = gradient;
		context.fillRect(0, 0, width, height);
		context.fillStyle = 'rgba(255,255,255,0.8)';
		for (let i = 0; i < 12; i++) {
			context.fillRect(60 + i * 110, 200 + (i % 4) * 150, 80, 220);
		}
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/jpeg', 0.85)
		);
		if (!blob) throw new Error('jpeg encoding failed');
		const bytes = new Uint8Array(await blob.arrayBuffer());
		let binary = '';
		for (let i = 0; i < bytes.length; i += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		}
		return btoa(binary);
	}, options);
	return Buffer.from(base64, 'base64');
}

export function jpegUpload(buffer: Buffer, name = 'foto.jpg') {
	return { name, mimeType: 'image/jpeg', buffer };
}

export async function selectRoomOnBoard(page: Page): Promise<void> {
	await page.waitForTimeout(500);
	const box = (await page.getByTestId('board').boundingBox())!;
	await tapAt(page, box.x + box.width / 2, box.y + box.height / 2);
	await expect(page.getByTestId('tab-dims')).toHaveCount(1);
}
