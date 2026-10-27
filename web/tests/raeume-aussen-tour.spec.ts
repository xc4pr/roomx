import { createProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';
import { addNamedRoom, placeFreeAt, roomsOf, selectRoomById } from './helpers/raeume.ts';
import { readProject } from './helpers/app.ts';

async function stepTotal(page: import('@playwright/test').Page, roomId: string): Promise<number> {
	await selectRoomById(page, roomId);
	await page.getByTestId('tab-photos').click();
	await page.getByTestId('tour-start').click();
	await expect(page.getByTestId('tour-view')).toBeVisible();
	const text =
		(await page
			.getByText(/Schritt 1 von \d+/)
			.first()
			.textContent()) ?? '';
	await page.getByTestId('tour-close').click();
	await expect(page.getByTestId('tour-view')).toHaveCount(0);
	return Number(/von (\d+)/.exec(text)![1]);
}

test('Foto-Tour einer Terrasse: nur Boden und Einbauten, keine Wand- und Eckschritte', async ({
	page
}) => {
	const id = await createProject(page, 'Tour E2E');
	await addNamedRoom(page, id, 'Küche', 'kitchen', 4000, 3000);
	await addNamedRoom(page, id, 'Terrasse', 'terrace', 4000, 3000);
	const [kitchen, terrace] = roomsOf((await readProject(page, id))!);
	await selectRoomById(page, terrace.id);
	await placeFreeAt(page, id, terrace.id, 'column', { x: 1500, y: 1500 });

	await selectRoomById(page, terrace.id);
	await page.getByTestId('tab-photos').click();
	await page.getByTestId('tour-start').click();
	await expect(page.getByTestId('tour-view')).toBeVisible();
	await expect(page.getByTestId('tour-caption')).toHaveText('Boden und Überblick');
	const text =
		(await page
			.getByText(/Schritt 1 von \d+/)
			.first()
			.textContent()) ?? '';
	await expect(page.getByTestId('tour-caption')).not.toContainText(/Wand|Ecke/);
	const outdoor = Number(/von (\d+)/.exec(text)![1]);
	// Floor overview plus the column; an indoor room of the same size needs walls, corners and ceiling.
	expect(outdoor).toBe(2);
	await page.getByTestId('tour-close').click();

	const indoor = await stepTotal(page, kitchen.id);
	expect(indoor).toBeGreaterThan(outdoor + 4);
});
