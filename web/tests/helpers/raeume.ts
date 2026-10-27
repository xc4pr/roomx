import { expect, type Locator, type Page } from '@playwright/test';
import {
	addRoom,
	createProject,
	fillNumber,
	placeElement,
	readProject,
	waitForProject,
	type PolyPoint,
	type StoredProject
} from './app.ts';

export const RECT: PolyPoint[] = [
	{ x: 0, y: 0 },
	{ x: 4000, y: 0 },
	{ x: 4000, y: 3000 },
	{ x: 0, y: 3000 }
];

export interface Fields {
	id: string;
	kind: string;
	status: string;
	wall?: number;
	offset?: number;
	width: number;
	depth?: number;
	height: number;
	elevation: number;
	x?: number;
	y?: number;
	rotation?: number;
	screen?: boolean;
	clearance?: number;
	upper?: unknown;
	modules?: { id: string; kind: string; width: number; appliances?: string[] }[];
	grid?: string;
}

export const elementsOf = (project: StoredProject): Fields[] =>
	project.rooms[0].elements as unknown as Fields[];

export const roomOf = (project: StoredProject) =>
	project.rooms[0] as unknown as StoredProject['rooms'][number] & {
		type: string;
		kitchen?: { open?: boolean; mode?: string };
		freeElements?: unknown;
	};

export async function newRoom(page: Page, name: string, type: string): Promise<string> {
	const id = await createProject(page, name);
	await addRoom(page);
	await page.getByTestId(`room-type-${type}`).click();
	await waitForProject(page, id, (p) => roomOf(p).type === type, `Raumtyp ${type}`);
	return id;
}

export async function place(
	page: Page,
	id: string,
	kind: string,
	point: PolyPoint
): Promise<Fields> {
	const before = elementsOf((await readProject(page, id))!).map((e) => e.id);
	const project = await placeElement(page, id, kind, RECT, point);
	const created = elementsOf(project).filter((e) => !before.includes(e.id));
	expect(created, `${kind} placed once`).toHaveLength(1);
	expect(created[0].kind).toBe(kind);
	return created[0];
}

export function editor(page: Page): Locator {
	return page.getByTestId('element-editor');
}

export async function setField(page: Page, label: string, mm: number): Promise<void> {
	await fillNumber(editor(page).getByLabel(label, { exact: true }), String(mm / 10));
}

export async function selectRow(page: Page, elementId: string): Promise<void> {
	await page.getByTestId('tab-elements').click();
	await page.locator(`[data-row="${elementId}"]`).click();
	await expect(editor(page)).toBeVisible();
}

export async function paletteKinds(page: Page): Promise<string[]> {
	await page.getByTestId('tab-elements').click();
	return page
		.locator('[data-testid="element-palette"] [data-kind]')
		.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-kind') ?? ''));
}

export async function reloadProject(page: Page): Promise<void> {
	await page.reload();
	await expect(page.getByTestId('board')).toBeVisible();
}
