import { expect, type Locator, type Page } from '@playwright/test';
import {
	addRoom,
	createProject,
	openProjects,
	projectIdOf,
	fillChecked,
	fillNumber,
	placeElement,
	readProject,
	tapAt,
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

// WebKit may still scroll the panel back to a focused field, so the click repeats until it took.
export async function chooseRoomType(page: Page, type: string): Promise<void> {
	const chip = page.getByTestId(`room-type-${type}`);
	await expect(async () => {
		await chip.click();
		await expect(chip).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
	}).toPass({ timeout: 10_000 });
}

export async function newRoom(page: Page, name: string, type: string): Promise<string> {
	const id = await createProject(page, name);
	await addRoom(page);
	await chooseRoomType(page, type);
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

export interface SlopeFields {
	id: string;
	wall: number;
	kneeHeight: number;
	angle: number;
	from?: number;
	to?: number;
	dormers?: { id: string; from: number; to: number; height: number }[];
}

export const slopesOf = (project: StoredProject): SlopeFields[] =>
	(project.rooms[0] as unknown as { slopes?: SlopeFields[] }).slopes ?? [];

export async function openSlopes(page: Page): Promise<void> {
	await page.getByTestId('tab-dims').click();
	const toggle = page.getByTestId('slopes-toggle');
	await expect(toggle).toBeVisible();
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
	await expect(page.getByTestId('slopes-section')).toBeVisible();
}

export async function slopeWall(page: Page, wall: number): Promise<void> {
	await openSlopes(page);
	await page.getByTestId(`slope-wall-${wall}`).getByRole('switch').click();
	await expect(page.getByTestId(`slope-section-${wall}-0`)).toBeVisible();
}

export async function setRoomHeight(page: Page, id: string, mm: number): Promise<void> {
	await page.getByTestId('tab-dims').click();
	await fillNumber(page.getByTestId('room-height'), String(mm / 10));
	await waitForProject(page, id, (p) => p.rooms[0].height === mm, `Raumhöhe ${mm}`);
}

export interface BoardRoomFields {
	id: string;
	name: string;
	type: string;
	polygon: PolyPoint[];
	boardPos: { x: number; y: number; rot: number };
	elements: Fields[];
	railing?: { height: number };
	cover?: { polygon: PolyPoint[]; height: number };
	slopes?: SlopeFields[];
}

export const roomsOf = (project: StoredProject): BoardRoomFields[] =>
	project.rooms as unknown as BoardRoomFields[];

// Maps a point of a room (room coordinates) to the screen using the room's own box.
export async function roomPointToClient(
	page: Page,
	room: BoardRoomFields,
	point: PolyPoint
): Promise<{ x: number; y: number }> {
	const box = await roomBox(page, room.id);
	const xs = room.polygon.map((p) => p.x);
	const ys = room.polygon.map((p) => p.y);
	const width = Math.max(...xs) - Math.min(...xs);
	const height = Math.max(...ys) - Math.min(...ys);
	return {
		x: box.x + ((point.x - Math.min(...xs)) / width) * box.width,
		y: box.y + ((point.y - Math.min(...ys)) / height) * box.height
	};
}

export async function roomBox(page: Page, roomId: string) {
	const room = page.locator(`[data-room-id="${roomId}"]`).first();
	await expect(room).toBeAttached();
	const box = await room.boundingBox();
	if (!box) throw new Error(`room ${roomId} has no box`);
	return box;
}

/** A point in the room's box where the room itself is on top, not the panel or a neighbour. */
async function openPoint(page: Page, roomId: string): Promise<{ x: number; y: number } | null> {
	const box = await roomBox(page, roomId);
	return page.evaluate(
		({ box, roomId }) => {
			const steps = [0.5, 0.35, 0.65, 0.2, 0.8];
			for (const fy of steps)
				for (const fx of steps) {
					const x = box.x + fx * box.width;
					const y = box.y + fy * box.height;
					const hit = document.elementFromPoint(x, y)?.closest('[data-room-id]');
					if (hit?.getAttribute('data-room-id') === roomId) return { x, y };
				}
			return null;
		},
		{ box, roomId }
	);
}

export async function selectRoomById(page: Page, roomId: string): Promise<void> {
	const project = await readProject(page, projectIdOf(page));
	const name = project?.rooms.find((room) => room.id === roomId)?.name;
	// On a narrow screen the bottom sheet can cover the room and the fit button, and a tap right after fit-all can
	// still land on the neighbour: close the panel when nothing of the room is on top, and tap until the panel shows
	// this room.
	const close = page.getByTestId('panel-close');
	await expect(async () => {
		if (!(await openPoint(page, roomId)) && (await close.isVisible())) await close.click();
		await page.getByTestId('fit-all').click({ timeout: 3000 });
		await page.waitForTimeout(700);
		const point = await openPoint(page, roomId);
		if (!point) {
			if (await close.isVisible()) await close.click();
			throw new Error(`room ${roomId} is covered`);
		}
		await tapAt(page, point.x, point.y);
		await page.getByTestId('tab-dims').click();
		await expect(page.getByTestId('room-name')).toBeVisible({ timeout: 2000 });
		if (name !== undefined)
			await expect(page.getByTestId('room-name')).toHaveValue(name, { timeout: 2000 });
	}).toPass({ timeout: 20_000 });
}

export async function addNamedRoom(
	page: Page,
	id: string,
	name: string,
	type: string,
	length: number,
	width: number
): Promise<void> {
	const count = (await readProject(page, id))!.rooms.length;
	await addRoom(page);
	await waitForProject(page, id, (p) => p.rooms.length === count + 1, 'Raum angelegt');
	await fillChecked(page.getByTestId('room-name'), name);
	for (const [testId, mm] of [
		['room-length', length],
		['room-width', width]
	] as const) {
		const field = page.getByTestId(testId);
		await fillChecked(field, String(mm / 10));
		await field.press('Enter');
	}
	await chooseRoomType(page, type);
	await waitForProject(
		page,
		id,
		(p) => {
			const room = roomsOf(p)[count];
			return (
				room.name === name &&
				room.type === type &&
				room.polygon[1].x === length &&
				room.polygon[2].y === width
			);
		},
		`${name} (${type})`
	);
}

// Places an element on the edge of a room by tapping next to it; `along` is 0..1 along the side.
export async function placeOnSide(
	page: Page,
	id: string,
	roomId: string,
	kind: string,
	side: 'bottom' | 'right' | 'top' | 'left',
	along: number
): Promise<void> {
	const index = (await readProject(page, id))!.rooms.findIndex((room) => room.id === roomId);
	const before = (await readProject(page, id))!.rooms[index].elements.length;
	await page.getByTestId('tab-elements').click();
	await page.getByTestId('fit-all').click();
	await page.waitForTimeout(700);
	await page.locator(`[data-testid="element-palette"] [data-kind="${kind}"]`).click();
	const box = await roomBox(page, roomId);
	const inset = 6;
	const point = {
		bottom: { x: box.x + box.width * along, y: box.y + box.height - inset },
		top: { x: box.x + box.width * along, y: box.y + inset },
		left: { x: box.x + inset, y: box.y + box.height * (1 - along) },
		right: { x: box.x + box.width - inset, y: box.y + box.height * (1 - along) }
	}[side];
	await tapAt(page, point.x, point.y);
	await waitForProject(
		page,
		id,
		(p) => p.rooms[index].elements.length === before + 1,
		`${kind} in Raum ${index + 1}`
	);
}

// Places a free element (column, stove ...) at a room point of the open room.
export async function placeFreeAt(
	page: Page,
	id: string,
	roomId: string,
	kind: string,
	point: PolyPoint
): Promise<Fields> {
	const project = (await readProject(page, id))!;
	const index = project.rooms.findIndex((room) => room.id === roomId);
	const room = roomsOf(project)[index];
	const known = room.elements.map((e) => e.id);
	await page.getByTestId('tab-elements').click();
	await page.getByTestId('fit-all').click();
	await page.waitForTimeout(700);
	await page.locator(`[data-testid="element-palette"] [data-kind="${kind}"]`).click();
	const target = await roomPointToClient(page, room, point);
	await tapAt(page, target.x, target.y);
	const after = await waitForProject(
		page,
		id,
		(p) => roomsOf(p)[index].elements.length === known.length + 1,
		`${kind} placed`
	);
	return roomsOf(after)[index].elements.find((e) => !known.includes(e.id))!;
}

export async function open3d(page: Page): Promise<void> {
	await page.getByTestId('seg-3d').first().click();
	await expect(page.getByTestId('canvas3d')).toBeVisible();
	await expect(page.getByTestId('viewer3d')).toHaveAttribute('data-context', 'ok');
	await page.waitForTimeout(1500);
}

export function trackConsole(page: Page): string[] {
	const errors: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	return errors;
}

// Puts `movingId` next to `targetId` (right of it or below it) with a 200 mm wall between them.
// A drag lands a few cm off in WebKit and leaves the wall only partly shared, so the position is
// written straight to the stored project and the page reloaded; everything else stays real use.
export async function dockNextTo(
	page: Page,
	id: string,
	movingId: string,
	targetId: string,
	side: 'right' | 'below'
): Promise<void> {
	const project = (await readProject(page, id))!;
	const rooms = roomsOf(project);
	const moving = rooms.find((room) => room.id === movingId)!;
	const target = rooms.find((room) => room.id === targetId)!;
	const extent = (room: BoardRoomFields, axis: 'x' | 'y') => {
		const values = room.polygon.map((p) => p[axis]);
		return Math.max(...values) - Math.min(...values);
	};
	// Board y points up: "below" means a smaller y.
	const goal =
		side === 'right'
			? { x: target.boardPos.x + extent(target, 'x') + 200, y: target.boardPos.y }
			: { x: target.boardPos.x, y: target.boardPos.y - extent(moving, 'y') - 200 };
	await page.evaluate(
		({ projectId, roomId, to }) =>
			new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('roomx');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const database = open.result;
					const transaction = database.transaction('projects', 'readwrite');
					const store = transaction.objectStore('projects');
					const request = store.get(projectId);
					request.onsuccess = () => {
						const doc = request.result as {
							rooms: { id: string; boardPos: { x: number; y: number } }[];
						};
						const room = doc.rooms.find((candidate) => candidate.id === roomId)!;
						room.boardPos.x = to.x;
						room.boardPos.y = to.y;
						store.put(doc);
					};
					transaction.oncomplete = () => {
						database.close();
						resolve();
					};
					transaction.onerror = () => reject(transaction.error);
				};
			}),
		{ projectId: id, roomId: movingId, to: goal }
	);
	await reloadProject(page);
	await selectRoomById(page, targetId);
	await expect(page.locator('[data-neighbour]')).toHaveCount(1);
}

export interface FloorFields {
	id: string;
	name: string;
	slabThickness: number;
	height?: number;
}

export interface StairFields {
	id: string;
	fromFloorId: string;
	shape: string;
	x: number;
	y: number;
	rotation: number;
	width: number;
}

export const floorsOf = (project: StoredProject): FloorFields[] =>
	(project as unknown as { floors?: FloorFields[] }).floors ?? [];

export const stairsOf = (project: StoredProject): StairFields[] =>
	(project as unknown as { stairs?: StairFields[] }).stairs ?? [];

export const roomFloor = (room: BoardRoomFields): string | undefined =>
	(room as unknown as { floorId?: string }).floorId;

// New project with several floors, chosen in the create dialog like a person would.
export async function createFloorProject(page: Page, name: string): Promise<string> {
	await openProjects(page);
	const empty = page.getByTestId('empty-create');
	const fab = page.getByTestId('new-project');
	await expect(empty.or(fab)).toBeVisible();
	await empty.or(fab).first().click();
	await page.getByTestId('project-name').fill(name);
	await page.getByRole('radio', { name: 'Mehrere' }).click();
	await page.getByTestId('create-project').click();
	await expect(page).toHaveURL(/\/p\/[^/]+$/);
	await expect(page.getByTestId('board')).toBeVisible();
	const id = projectIdOf(page);
	await waitForProject(page, id, (p) => floorsOf(p).length === 2, 'Stockwerke');
	return id;
}

export async function showFloor(page: Page, name: string): Promise<void> {
	await page.getByTestId('floor-switcher').getByRole('button', { name, exact: true }).click();
	await page.waitForTimeout(500);
}

export interface House {
	id: string;
	lowerId: string;
	upperId: string;
	lowerFloorId: string;
	upperFloorId: string;
}

// Two floors with one room each; the upper room is left selected.
export async function buildHouse(
	page: Page,
	name: string,
	length: number,
	width: number,
	upperType = 'bedroom'
): Promise<House> {
	const id = await createFloorProject(page, name);
	const [lowerFloor, upperFloor] = floorsOf((await readProject(page, id))!);
	await showFloor(page, lowerFloor.name);
	await addNamedRoom(page, id, 'Wohnen unten', 'living', length, width);
	await showFloor(page, upperFloor.name);
	await addNamedRoom(page, id, 'Zimmer oben', upperType, length, width);
	const [lower, upper] = roomsOf((await readProject(page, id))!);
	return {
		id,
		lowerId: lower.id,
		upperId: upper.id,
		lowerFloorId: lowerFloor.id,
		upperFloorId: upperFloor.id
	};
}

export async function addStairOnFloor(
	page: Page,
	id: string,
	floorName: string
): Promise<StairFields> {
	await showFloor(page, floorName);
	await page.mouse.click(5, 5);
	await page.getByTestId('stair-add').click();
	await expect(page.getByTestId('stair-editor')).toBeVisible();
	const project = await waitForProject(page, id, (p) => stairsOf(p).length > 0, 'Treppe');
	await page.getByTestId('stair-close').click();
	return stairsOf(project)[0];
}
