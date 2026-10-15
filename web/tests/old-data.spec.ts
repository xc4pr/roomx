import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openProjects, tapAt } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';

const FIXTURES = resolve(import.meta.dirname, '..', 'src', 'lib', 'state', 'fixtures');

function fixture(name: string): Record<string, unknown> {
	return JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8'));
}

test('Alte Daten (v0 und v1 mit langer Notiz) laden und lassen sich öffnen', async ({ page }) => {
	const old = fixture('project-v0.json');
	const long = fixture('long-text-v1.json');
	await openProjects(page);

	await page.evaluate(
		(documents) =>
			new Promise<void>((resolveWrite, reject) => {
				const open = indexedDB.open('roomx');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const database = open.result;
					const transaction = database.transaction('projects', 'readwrite');
					for (const document of documents) transaction.objectStore('projects').put(document);
					transaction.oncomplete = () => {
						database.close();
						resolveWrite();
					};
					transaction.onerror = () => reject(transaction.error);
				};
			}),
		[old, long]
	);

	await page.reload();
	const cards = page.getByTestId('project-card');
	await expect(cards).toHaveCount(2);
	await expect(cards.filter({ hasText: 'Alte Wohnung' })).toHaveCount(1);
	await expect(cards.filter({ hasText: 'Müller-Köhler' })).toHaveCount(1);

	const selectFirstRoom = async (roomId: string) => {
		const room = page.locator(`[data-room-id="${roomId}"]`).first();
		await expect(room).toBeAttached();
		await page.waitForTimeout(600);
		const box = (await room.boundingBox())!;
		await tapAt(page, box.x + box.width / 2, box.y + box.height / 2);
	};

	await cards.filter({ hasText: 'Alte Wohnung' }).getByRole('link').click();
	await expect(page).toHaveURL(/\/p\/fixture-v0$/);
	await expect(page.getByTestId('board')).toBeVisible();
	await expect(page.locator('[data-room-id="room-rect"]')).toHaveCount(1);
	await selectFirstRoom('room-rect');
	await expect(page.getByTestId('room-name')).toHaveValue('Schlafzimmer');

	await page.goto('/');
	await cards.filter({ hasText: 'Müller-Köhler' }).getByRole('link').click();
	await expect(page).toHaveURL(/\/p\/fixture-v1-long$/);
	await expect(page.getByTestId('board')).toBeVisible();
	const roomId = (fixture('long-text-v1.json').rooms as { id: string }[])[0].id;
	await expect(page.locator(`[data-room-id="${roomId}"]`)).toHaveCount(1);
	await selectFirstRoom(roomId);
	await expect(page.getByTestId('room-name')).toHaveValue('Schlafzimmer');
	const notes = page.locator(`#room-notes-${roomId}`);
	await expect(notes).toBeVisible();
	await expect(notes).toHaveValue(/.{6000}/s);
});
