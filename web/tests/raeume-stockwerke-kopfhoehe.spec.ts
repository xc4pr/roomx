import { fillNumber } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';
import {
	addStairOnFloor,
	buildHouse,
	selectRoomById,
	showFloor,
	slopeWall
} from './helpers/raeume.ts';

test('Treppe unter einer Schräge im Obergeschoss: Befund Kopfhöhe in der Bau-Prüfung', async ({
	page
}) => {
	const house = await buildHouse(page, 'Kopfhöhe E2E', 6000, 6000);
	await addStairOnFloor(page, house.id, 'EG');

	await page.getByTestId('build').click();
	await expect(page.getByTestId('check-list')).toBeVisible();
	await expect(page.getByTestId('check-list')).not.toContainText('Kopfhöhe');
	await page.getByTestId('check-proceed').click();
	await expect(page).toHaveURL(/\/3d\?build=1/);

	await page.getByTestId('seg-plan').click();
	await showFloor(page, '1. OG');
	await selectRoomById(page, house.upperId);
	for (const wall of [1, 3]) {
		await slopeWall(page, wall);
		await fillNumber(page.getByTestId(`slope-knee-${wall}-0`), '10');
		await fillNumber(page.getByTestId(`slope-angle-${wall}-0`), '15');
	}

	await page.getByTestId('build').click();
	await expect(page.getByTestId('check-list')).toContainText('Kopfhöhe nur');
	await expect(page.getByTestId('check-list')).toContainText('Treppe EG → 1. OG');
});
