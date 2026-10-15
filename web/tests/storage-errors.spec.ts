import { addRoom, createProject, fillNumber, readProject, waitForProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';

declare global {
	interface Window {
		__roomxFailWrites?: boolean;
	}
}

test('Speicherfehler zeigt Meldung mit «Jetzt sichern» und heilt nach erneutem Versuch', async ({
	context,
	page
}) => {
	await context.addInitScript(() => {
		const put = IDBObjectStore.prototype.put;
		const add = IDBObjectStore.prototype.add;
		const fail = () => {
			if (window.__roomxFailWrites) {
				throw new DOMException('Speicher voll (Test)', 'QuotaExceededError');
			}
		};
		IDBObjectStore.prototype.put = function (value, key) {
			fail();
			return put.call(this, value, key);
		};
		IDBObjectStore.prototype.add = function (value, key) {
			fail();
			return add.call(this, value, key);
		};
	});

	const id = await createProject(page, 'Speicherfehler');
	await addRoom(page);
	await waitForProject(page, id, (p) => p.rooms.length === 1, 'Raum gespeichert');
	await expect(page.getByTestId('storage-alert')).toHaveCount(0);

	await page.evaluate(() => (window.__roomxFailWrites = true));
	await fillNumber(page.getByTestId('room-length'), '500');
	const alert = page.getByTestId('storage-alert');
	await expect(alert).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId('storage-backup')).toHaveText('Jetzt sichern');
	expect((await readProject(page, id))?.rooms[0].polygon[1].x).toBe(4000);

	await page.evaluate(() => (window.__roomxFailWrites = false));
	const retry = page.getByTestId('storage-retry');
	if (await retry.isVisible()) await retry.click();
	await expect(alert).toHaveCount(0, { timeout: 20_000 });
	await waitForProject(page, id, (p) => p.rooms[0].polygon[1].x === 5000, 'Länge nachgespeichert');

	await page.reload();
	await expect(page.getByTestId('board')).toBeVisible();
	expect((await readProject(page, id))?.rooms[0].polygon[1].x).toBe(5000);
	await expect(page.getByTestId('storage-alert')).toHaveCount(0);
});
