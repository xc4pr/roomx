import { addRoom, createProject, readProject, waitForProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';

declare global {
	interface Window {
		__roomxCopied?: string;
	}
}

const DESK = 'generic-desk-160x80';
const RUG = 'generic-rug-120x180';

async function prepare(page: import('@playwright/test').Page, name: string) {
	const id = await createProject(page, name);
	await addRoom(page);
	const project = await waitForProject(page, id, (p) => p.rooms.length === 1, 'Raum angelegt');
	await page.getByTestId('seg-share').click();
	await expect(page.getByTestId('import-panel')).toBeVisible();
	return { id, roomId: project.rooms[0].id };
}

function planOf(id: string, roomId: string, items: unknown[]) {
	return {
		format: 'roomx-plan',
		schemaVersion: 1,
		projectId: id,
		variants: [{ name: 'A: Sicherheit', rooms: [{ roomId, items }] }]
	};
}

async function captureClipboard(page: import('@playwright/test').Page) {
	await page.evaluate(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (text: string) => {
					window.__roomxCopied = text;
				}
			}
		});
	});
}

async function dangerousLinks(page: import('@playwright/test').Page): Promise<number> {
	return page.locator('a[href^="javascript:" i], a[href^="data:" i]').count();
}

test('Unsichere Links aus einem Plan landen nie als Link im DOM', async ({ page }) => {
	const dialogs: string[] = [];
	page.on('dialog', (dialog) => {
		dialogs.push(dialog.message());
		void dialog.dismiss();
	});
	const { id, roomId } = await prepare(page, 'Unsichere Links');
	const plan = planOf(id, roomId, [
		{ id: 'desk', catalogId: DESK, x: 2000, y: 1500, url: 'javascript:alert(1)' },
		{
			id: 'rug',
			catalogId: RUG,
			x: 2000,
			y: 2500,
			url: 'data:text/html,<script>alert(1)</script>'
		},
		{ id: 'ok', catalogId: DESK, x: 1000, y: 1000, url: 'https://example.com/schreibtisch' }
	]);
	await page.getByTestId('import-text').fill(JSON.stringify(plan));
	await expect(page.getByTestId('import-invalid')).toBeVisible();
	await expect(page.getByTestId('import-apply')).toHaveCount(0);
	expect(await dangerousLinks(page)).toBe(0);
	const stored = await readProject(page, id);
	expect(stored?.variants.flatMap((variant) => variant.items)).toHaveLength(0);
	expect(dialogs).toEqual([]);
});

test('Unsichere Links in gespeicherten Daten werden nicht zu Links', async ({ page }) => {
	const dialogs: string[] = [];
	page.on('dialog', (dialog) => {
		dialogs.push(dialog.message());
		void dialog.dismiss();
	});
	const { id, roomId } = await prepare(page, 'Gespeicherte Links');
	await page
		.getByTestId('import-text')
		.fill(JSON.stringify(planOf(id, roomId, [{ id: 'desk', catalogId: DESK, x: 2000, y: 1500 }])));
	await page.getByTestId('import-apply').click();
	await waitForProject(page, id, (p) => p.variants.some((v) => v.items.length === 1), 'Möbel da');

	await page.evaluate(
		(projectId) =>
			new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('roomx');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const database = open.result;
					const transaction = database.transaction('projects', 'readwrite');
					const store = transaction.objectStore('projects');
					const request = store.get(projectId);
					request.onsuccess = () => {
						const project = request.result as {
							variants: { items: { url?: string }[] }[];
						};
						project.variants[0].items[0].url = 'javascript:alert(1)';
						store.put(project);
					};
					transaction.oncomplete = () => {
						database.close();
						resolve();
					};
					transaction.onerror = () => reject(transaction.error);
				};
			}),
		id
	);
	await page.goto(`/p/${id}/furnish`);
	await expect(page.getByTestId('furnish-screen')).toBeVisible();
	await page.getByTestId('open-list').click();
	await expect(page.getByTestId('shopping-list')).toBeVisible();
	await expect(page.getByTestId('shopping-list').locator('li')).not.toHaveCount(0);
	expect(await dangerousLinks(page)).toBe(0);
	expect(dialogs).toEqual([]);
});

test('Import verträgt Codeblock, Kommentare und nachgestellte Kommas', async ({ page }) => {
	const { id, roomId } = await prepare(page, 'Toleranter Import');
	const message = [
		'Gerne, hier ist dein Plan. Ich habe das Sofa an die lange Wand gestellt.',
		'',
		'```json',
		'{',
		'  // Format und Version',
		'  "format": "roomx-plan",',
		'  "schemaVersion": 1,',
		`  "projectId": "${id}",`,
		'  "variants": [',
		'    {',
		'      "name": "A: Tolerant", // Name der Variante',
		'      "rooms": [',
		'        {',
		`          "roomId": "${roomId}",`,
		'          "items": [',
		`            { "id": "desk", "catalogId": "${DESK}", "x": 2000, "y": 1500, },`,
		`            { "id": "rug", "catalogId": "${RUG}", "x": 2000, "y": 2200 /* Teppich */ },`,
		'          ],',
		'        },',
		'      ],',
		'    },',
		'  ],',
		'}',
		'```',
		'',
		'Sag Bescheid, wenn du etwas ändern möchtest.'
	].join('\n');
	await page.getByTestId('import-text').fill(message);
	await expect(page.getByTestId('import-preview')).toBeVisible();
	await expect(page.getByTestId('import-variant')).toHaveCount(1);
	await expect(page.getByTestId('import-invalid')).toHaveCount(0);
	await expect(page.getByTestId('import-unreadable')).toHaveCount(0);
	await page.getByTestId('import-apply').click();
	const imported = await waitForProject(
		page,
		id,
		(p) =>
			p.variants.some((variant) => variant.name === 'A: Tolerant' && variant.items.length === 2),
		'Plan übernommen'
	);
	expect((await readProject(page, id))?.variants).toHaveLength(imported.variants.length);
});

test('Fehlerhafter Plan liefert Korrekturtext zum Kopieren', async ({ page }) => {
	const { id, roomId } = await prepare(page, 'Korrekturen');
	await captureClipboard(page);
	const plan = planOf(id, roomId, [
		{ id: 'desk', catalogId: DESK, x: 2000, y: 1500, rotation: 'schräg' }
	]);
	await page.getByTestId('import-text').fill(JSON.stringify(plan));
	await expect(page.getByTestId('import-invalid')).toBeVisible();
	await expect(page.getByTestId('import-apply')).toHaveCount(0);
	await page.getByTestId('import-copy-corrections').click();
	await expect
		.poll(() => page.evaluate(() => window.__roomxCopied ?? ''))
		.toContain('Bitte korrigiere');
	const copied = await page.evaluate(() => window.__roomxCopied ?? '');
	expect(copied).toContain('rotation');
	expect(copied).toContain('roomx-plan');
});
