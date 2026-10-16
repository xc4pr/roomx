import type { Download } from '@playwright/test';
import { selectRoomOnBoard } from './helpers/app.ts';
import {
	closeCapture,
	countStore,
	createJob,
	expect,
	jobDialogStatus,
	openLink,
	openProject,
	openRoomCapture,
	photosOf,
	prepareProject,
	takePhotos,
	test,
	waitForProject
} from './mirror/helpers.ts';

const DAY = 24 * 60 * 60 * 1000;

test('Abgelaufener Link: Fehlermeldung, kein Auftrag auf dem Handy', async ({ world }) => {
	test.setTimeout(90_000);
	const desktop = await world.desktop();
	await prepareProject(desktop);
	const link = await createJob(desktop);

	const phone = await world.phone({ clockAt: new Date(Date.now() + 8 * DAY) });
	await phone.goto(link);
	await expect(phone.getByText('Dieser Foto-Auftrag ist abgelaufen')).toBeVisible();
	await expect(phone).not.toHaveURL(/\/m\//);
	expect(await countStore(phone, 'mirrorJobs')).toBe(0);
	expect(phone.url()).not.toContain('#pair=');
});

test('Widerruf: Auftrag beenden bei verbundenem Handy zeigt dort das Ende', async ({ world }) => {
	test.setTimeout(120_000);
	const desktop = await world.desktop();
	await prepareProject(desktop);
	const link = await createJob(desktop);

	const phone = await world.phone();
	await openLink(phone, link);
	await expect(phone.getByTestId('camera-status')).toContainText('Verbunden', { timeout: 45_000 });
	await expect(jobDialogStatus(desktop)).toContainText('Verbunden', { timeout: 45_000 });

	await desktop.getByRole('dialog').getByTestId('mirror-revoke').click();
	await desktop.getByRole('button', { name: 'Auftrag beenden' }).last().click();
	await expect(phone.getByTestId('camera-ended')).toBeVisible({ timeout: 30_000 });
	await expect(phone.getByTestId('camera-status')).toContainText('Auftrag beendet');
});

test('Rückfall: ohne PC nach 30 s Teilen, Dateien am PC importieren', async ({
	world,
	browserName
}, testInfo) => {
	test.setTimeout(180_000);
	const desktop = await world.desktop();
	const { id } = await prepareProject(desktop);
	const link = await createJob(desktop);
	await desktop.goto('/');
	await expect(desktop.getByTestId('project-card')).toHaveCount(1);

	const phone = await world.phone({ clockAt: new Date() });
	const downloads: Download[] = [];
	phone.on('download', (download) => downloads.push(download));
	await openLink(phone, link);
	await openRoomCapture(phone, 'now');
	await takePhotos(phone, 2, browserName);
	await closeCapture(phone);
	await expect(phone.getByTestId('camera-status')).toContainText('Suche PC');
	await expect(phone.getByTestId('camera-fallback')).toHaveCount(0);

	await phone.clock.fastForward(31_000);
	await expect(phone.getByTestId('camera-fallback')).toBeVisible();
	const share = phone.getByTestId('camera-share');
	await expect(share).toBeEnabled();
	await share.click();
	await expect.poll(() => downloads.length, { timeout: 30_000 }).toBe(2);
	const files: string[] = [];
	for (const [i, download] of downloads.entries()) {
		const path = testInfo.outputPath(`rueckfall-${i}.jpg`);
		await download.saveAs(path);
		files.push(path);
	}
	await phone.close();

	await openProject(desktop, id);
	await selectRoomOnBoard(desktop);
	await desktop.getByTestId('tab-photos').click();
	await desktop.getByTestId('mirror-import').click();
	await desktop.getByTestId('mirror-import-input').setInputFiles(files);
	const items = desktop.getByTestId('mirror-import-item');
	await expect(items).toHaveCount(2);
	await expect(items.locator('[data-state="ready"]')).toHaveCount(2);
	await desktop.getByTestId('mirror-import-confirm').click();
	const project = await waitForProject(desktop, id, (p) => photosOf(p).length === 2, 'importiert');
	const photos = photosOf(project);
	expect(new Set(photos.map((photo) => photo.stepKey)).size).toBe(2);
	for (const photo of photos) expect(photo.caption).not.toBe('Foto vom Handy');

	await expect(desktop.getByTestId('mirror-import-input')).toHaveCount(0);
	await desktop.getByTestId('mirror-import').click();
	await desktop.getByTestId('mirror-import-input').setInputFiles(files);
	await expect(items).toHaveCount(2);
	await expect(items.locator('[data-state="duplicate"]')).toHaveCount(2);
	await expect(desktop.getByTestId('mirror-import-confirm')).toBeDisabled();
	expect(photosOf(project)).toHaveLength(2);
});

test('Zweiter Auftrag nach dem Beenden des ersten verbindet sich wieder', async ({
	world,
	browserName
}) => {
	// WebKit on Linux forms no ICE candidate pairs in about one of three runs once a closed offer pool
	// preceded the new one in the same tab (logs: both sides "checking", no pairs, "failed" after 15 s).
	// Chromium covers the reconnect; Safari is checked by hand (Prüfliste).
	test.skip(
		browserName === 'webkit',
		'WebKit on Linux: ICE without candidate pairs after a closed offer pool'
	);
	test.setTimeout(150_000);
	const desktop = await world.desktop();
	await prepareProject(desktop);
	await createJob(desktop);
	await desktop.getByRole('dialog').getByTestId('mirror-revoke').click();
	await desktop.getByRole('button', { name: 'Auftrag beenden' }).last().click();
	await expect(desktop.getByTestId('mirror-link')).toHaveCount(0);
	await desktop.waitForTimeout(1500);

	const create = desktop.getByTestId('mirror-create');
	if (!(await create.isVisible())) await desktop.getByTestId('mirror-open').click();
	await create.click();
	const link = desktop.getByTestId('mirror-link');
	await expect(link).toHaveValue(/#pair=/);

	const phone = await world.phone();
	await openLink(phone, await link.inputValue());
	await expect(phone.getByTestId('camera-status')).toContainText('Verbunden', { timeout: 45_000 });
	await expect(jobDialogStatus(desktop)).toContainText('Verbunden', { timeout: 45_000 });
});
