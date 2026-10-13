import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import {
	addRoom,
	createProject,
	jpegUpload,
	lPolygon,
	makeJpeg,
	placeElement,
	setLTemplate,
	waitForProject
} from './helpers/app.ts';
import { exportPackage } from './helpers/export.ts';
import { test, expect } from './helpers/fixtures.ts';
import { buildPlan, planMessage } from './helpers/plan.ts';

const OUTPUT = process.env.PW_SCREENSHOT_DIR ?? 'test-results/visual';
const L = { a: 5400, b: 4200, c: 2600, d: 2200 };

async function settled(page: Page): Promise<void> {
	await page.evaluate(() => document.fonts.ready.then(() => undefined));
	await page.waitForTimeout(700);
}

for (const scheme of ['light', 'dark'] as const) {
	test(`Sichtprüfung ${scheme}`, async ({ launchContext }, testInfo) => {
		test.setTimeout(300_000);
		mkdirSync(OUTPUT, { recursive: true });
		const context = await launchContext({ colorScheme: scheme });
		const page = await context.newPage();
		const project = testInfo.project.name;
		const shot = async (name: string) => {
			await settled(page);
			await page.screenshot({ path: join(OUTPUT, `l-${project}-${name}-${scheme}.png`) });
		};
		const polygon = lPolygon(L);

		await page.goto('/');
		await expect(page.getByTestId('empty-create')).toBeVisible();
		await shot('projects-empty');

		const id = await createProject(page, 'Wohnung Muster');
		await shot('plan-empty');
		await addRoom(page);
		await setLTemplate(page, L);
		await page.getByTestId('room-type-living').click();
		await waitForProject(
			page,
			id,
			(p) => JSON.stringify(p.rooms[0]?.polygon) === JSON.stringify(polygon)
		);
		await page.getByTestId('fit-all').click();
		await shot('plan-dims');

		await placeElement(page, id, 'door', polygon, { x: 1500, y: 150 });
		await placeElement(page, id, 'window', polygon, { x: 1300, y: L.b - 150 });
		await placeElement(page, id, 'switch', polygon, { x: 2600, y: 150 });
		await placeElement(page, id, 'socket', polygon, { x: 150, y: 2500 });
		await page.getByTestId('fit-all').click();
		await shot('plan-elements');

		await page.getByTestId('wall-view-toggle').scrollIntoViewIfNeeded();
		await page.getByTestId('wall-view-toggle').click();
		await expect(page.getByTestId('wall-elevation')).toBeVisible();
		await page.getByTestId('wall-elevation').scrollIntoViewIfNeeded();
		await shot('wall-view');
		await page.getByTestId('wall-view-toggle').click();

		await page.getByTestId('tab-photos').click();
		await shot('photos-empty');
		await page.getByTestId('tour-start').click();
		await shot('tour-step');
		await page.getByTestId('tour-library-input').setInputFiles(jpegUpload(await makeJpeg(page)));
		await waitForProject(page, id, (p) => p.rooms[0].photos.length === 1);
		await shot('tour-photo');
		await page.getByTestId('tour-close').click();
		await shot('photos-gallery');

		await page.getByTestId('tab-dims').click();
		await page.getByTestId('room-delete').scrollIntoViewIfNeeded();
		await shot('plan-dims-bottom');

		await addRoom(page);
		await page.getByTestId('room-type-bedroom').click();
		await page.getByTestId('fit-all').click();
		await shot('plan-two-rooms');

		await page.getByTestId('build').click();
		await expect(page.getByTestId('check-list')).toBeVisible();
		await shot('build-dialog');
		await page.getByTestId('check-proceed').click();
		await expect(page.getByTestId('canvas3d')).toBeVisible();
		await page.waitForTimeout(2500);
		await shot('3d-intro');
		for (const mode of ['up', 'cutaway', 'down']) {
			await page.getByTestId(`seg-${mode}`).click();
			await page.waitForTimeout(900);
			await shot(`3d-${mode}`);
		}

		const first = await exportPackage(page);
		await shot('share-ready');
		writeFileSync(join(OUTPUT, `l-${project}-export-${scheme}.pdf`), first.pdf);
		await page.evaluate(() => scrollTo(0, 0));

		await page.getByTestId('import-text').fill(planMessage(buildPlan(first)));
		await expect(page.getByTestId('import-preview')).toBeVisible();
		await page.getByTestId('import-preview').scrollIntoViewIfNeeded();
		await shot('import-preview');
		await page.getByTestId('import-apply').click();
		await waitForProject(page, id, (p) => p.variants.some((v) => v.items.length === 4));

		await page.getByTestId('seg-furnish').click();
		await expect(page.getByTestId('furnish-screen')).toBeVisible();
		await page.getByTestId('fit-all').click();
		await shot('furnish-2d');
		const furnish = page.getByTestId('furnish-screen');
		const catalog = page.getByTestId('catalog-panel');
		if (!(await catalog.isVisible())) {
			await page.getByTestId('catalog-fab').click();
		}
		await expect(catalog).toBeVisible();
		await shot('furnish-catalog');
		await page.locator('[data-catalog-id="ikea-kivik-sofa-3-228x95x83"]').scrollIntoViewIfNeeded();
		await page.locator('[data-catalog-id="ikea-kivik-sofa-3-228x95x83"]').click();
		await shot('furnish-sofa-selected');
		await furnish.getByTestId('seg-3d').click();
		await page.waitForTimeout(1500);
		await shot('furnish-3d');
		await page.getByTestId('open-list').click();
		await shot('furnish-list');
		await page.getByTestId('open-brief').click();
		await shot('furnish-brief');
		await furnish.getByTestId('seg-2d').click();

		await page.goto('/');
		await expect(page.getByTestId('project-card')).toHaveCount(1);
		await page.waitForTimeout(1500);
		await shot('projects');
		await page.getByTestId('open-settings').click();
		await expect(page.getByTestId('settings-back')).toBeVisible();
		await shot('settings');
		await page.evaluate(() => {
			for (const node of document.querySelectorAll<HTMLElement>('div')) {
				if (
					node.scrollHeight > node.clientHeight + 40 &&
					getComputedStyle(node).overflowY === 'auto'
				) {
					node.scrollTop = node.scrollHeight;
				}
			}
		});
		await shot('settings-bottom');
	});
}
