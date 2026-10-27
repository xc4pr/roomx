import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openProjects, readProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';

const FIXTURES = resolve(import.meta.dirname, '..', 'src', 'lib', 'state', 'fixtures');

test('Projekt der Version 1 mit Schrägen öffnet unverändert', async ({ page }) => {
	const old = JSON.parse(readFileSync(resolve(FIXTURES, 'slopes-v1.json'), 'utf8')) as {
		id: string;
		name: string;
		rooms: { id: string; slopes?: unknown[] }[];
	};
	expect(old.rooms.some((room) => (room.slopes?.length ?? 0) > 0)).toBe(true);
	await openProjects(page);
	await page.evaluate(
		(document) =>
			new Promise<void>((done, fail) => {
				const open = indexedDB.open('roomx');
				open.onerror = () => fail(open.error);
				open.onsuccess = () => {
					const database = open.result;
					const transaction = database.transaction('projects', 'readwrite');
					transaction.objectStore('projects').put(document);
					transaction.oncomplete = () => {
						database.close();
						done();
					};
					transaction.onerror = () => fail(transaction.error);
				};
			}),
		old
	);
	await page.reload();
	await page.getByTestId('project-card').filter({ hasText: old.name }).getByRole('link').click();
	await expect(page).toHaveURL(new RegExp(`/p/${old.id}$`));
	await expect(page.getByTestId('board')).toBeVisible();
	const withSlope = old.rooms.find((room) => (room.slopes?.length ?? 0) > 0)!;
	await expect(page.locator(`[data-room-id="${withSlope.id}"]`).first()).toBeAttached();
	await expect(page.getByTestId('slope-layer').first()).toBeAttached();
	const stored = (await readProject(page, old.id))!;
	expect(stored.rooms).toHaveLength(old.rooms.length);
	expect(stored.name).toBe(old.name);
});
