import { addRoom, createProject, fillNumber, selectRoomOnBoard } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';

test('Sprache DE/EN und Einheit cm/m wirken sofort', async ({ page }) => {
	await createProject(page, 'Sprache');
	await addRoom(page);
	await fillNumber(page.getByTestId('room-length'), '450');
	await fillNumber(page.getByTestId('room-width'), '380');
	await expect(page.getByTestId('room-area')).toHaveText('17,1 m²');
	await expect(page.getByTestId('room-perimeter')).toHaveText('1660 cm');
	await expect(page.getByTestId('room-length')).toHaveValue('450');
	const furnishDe = await page.getByTestId('seg-furnish').getAttribute('aria-label');
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');

	await page.getByRole('link').first().click();
	await expect(page.getByTestId('project-card')).toBeVisible();
	await page.getByTestId('open-settings').click();
	await expect(page.getByTestId('settings-back')).toBeVisible();
	const title = page.getByRole('heading', { level: 1 });
	await expect(title).toBeVisible();
	const titleDe = await title.innerText();

	await page.getByTestId('seg-en').click();
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(title).not.toHaveText(titleDe);
	const titleEn = await title.innerText();
	await expect(page.getByTestId('seg-en')).toHaveAttribute('aria-checked', 'true');

	await page.getByTestId('seg-de').click();
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await expect(title).toHaveText(titleDe);
	await page.getByTestId('seg-en').click();
	await expect(title).toHaveText(titleEn);

	await page.getByTestId('seg-m').click();
	await expect(page.getByTestId('seg-m')).toHaveAttribute('aria-checked', 'true');

	await page.getByTestId('settings-back').click();
	await page.getByTestId('project-card').getByRole('link').click();
	await expect(page.getByTestId('board')).toBeVisible();
	await selectRoomOnBoard(page);
	await expect(page.getByTestId('room-area')).toHaveText('17.1 m²');
	await expect(page.getByTestId('room-perimeter')).toHaveText('16.6 m');
	await expect(page.getByTestId('room-length')).toHaveValue('4.5');
	expect(await page.getByTestId('seg-furnish').getAttribute('aria-label')).not.toBe(furnishDe);

	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await selectRoomOnBoard(page);
	await expect(page.getByTestId('room-perimeter')).toHaveText('16.6 m');

	await page.getByTestId('seg-furnish').click();
	await expect(page.getByTestId('furnish-screen')).toBeVisible();
	await expect(page.getByTestId('budget-sum')).toContainText('CHF');

	await page.goto('/settings');
	await page.getByTestId('seg-cm').click();
	await page.getByTestId('seg-de').click();
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await expect(title).toHaveText(titleDe);
});
