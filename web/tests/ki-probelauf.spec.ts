import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createProject, fillChecked, readAllProjects, waitForProject } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';

const DIR =
	process.env.ROOMX_PROBELAUF_DIR ?? resolve(import.meta.dirname, 'fixtures', 'probelauf');
const BACKUP = resolve(DIR, 'projekt-backup.zip');
const ANSWER = [resolve(DIR, 'antwort.md'), resolve(DIR, 'plan.json')].find(existsSync);

test('KI-Probelauf: Backup wiederherstellen, Antwort importieren, Einkaufsliste hat Preis', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Nur Projekt desktop');
	test.skip(
		!existsSync(BACKUP) || !ANSWER,
		`Fixtures fehlen: ${BACKUP} und antwort.md (oder plan.json)`
	);
	test.setTimeout(180_000);

	await createProject(page, 'Platzhalter');
	await page.getByTestId('seg-share').click();
	await page.getByTestId('restore-input').setInputFiles(BACKUP);
	await expect
		.poll(async () => (await readAllProjects(page)).filter((p) => !p.deleted).length)
		.toBe(2);
	const restored = (await readAllProjects(page)).find((p) => p.name !== 'Platzhalter');
	if (!restored) throw new Error('wiederhergestelltes Projekt fehlt');
	expect(restored.rooms.length).toBeGreaterThanOrEqual(2);
	const variantsBefore = restored.variants.length;

	await page.goto(`/p/${restored.id}`);
	await expect(page.getByTestId('board')).toBeVisible();
	await page.getByTestId('seg-share').click();
	await expect(page.getByTestId('import-panel')).toBeVisible();

	await fillChecked(page.getByTestId('import-text'), readFileSync(ANSWER!, 'utf8'));
	await expect(page.getByTestId('import-preview')).toBeVisible();
	await expect(page.getByTestId('import-invalid')).toHaveCount(0);
	await expect(page.getByTestId('import-unreadable')).toHaveCount(0);
	await expect(page.getByTestId('import-partial')).toHaveCount(0);
	await expect(page.getByTestId('import-corrections')).toHaveCount(0);
	await expect(page.getByText('Bitte korrigiere')).toHaveCount(0);
	await page.getByTestId('import-apply').click();

	const done = await waitForProject(
		page,
		restored.id,
		(p) => p.variants.length > variantsBefore,
		'neue Variante'
	);
	const active = done.variants.find((variant) => variant.id === done.activeVariantId);
	expect(active, 'neue Variante ist aktiv').toBeDefined();
	expect(done.variants.indexOf(active!)).toBeGreaterThanOrEqual(variantsBefore);
	for (const room of done.rooms) {
		expect(
			active!.items.filter((item) => item.roomId === room.id).length,
			`Möbel in ${room.name}`
		).toBeGreaterThan(0);
	}

	await page.getByTestId('seg-furnish').click();
	await page.getByTestId('open-list').click();
	await expect(page.getByTestId('shopping-list')).toBeVisible();
	const total = await page.getByTestId('list-total').innerText();
	const amount = Number(total.replace(/[^\d]/g, ''));
	expect(amount, `Gesamtpreis ${total}`).toBeGreaterThan(0);
});
