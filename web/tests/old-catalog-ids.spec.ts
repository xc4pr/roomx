import { catalogCard } from './helpers/catalog.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { catalogAliases, lookup } from '#lib/catalog/index.ts';
import {
	addRoom,
	createProject,
	openProjects,
	readProject,
	waitForProject,
	type StoredProject
} from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';

const FIXTURES = resolve(import.meta.dirname, 'fixtures', 'old-ids');

function fixture(name: string, values: Record<string, string | number>): string {
	let text = readFileSync(resolve(FIXTURES, name), 'utf8');
	for (const [key, value] of Object.entries(values)) {
		text = text.replaceAll(
			`"__${key}__"`,
			typeof value === 'number' ? String(value) : `"${value}"`
		);
		text = text.replaceAll(`__${key}__`, String(value));
	}
	return text;
}

function center(project: StoredProject) {
	const xs = project.rooms[0].polygon.map((point) => point.x);
	const ys = project.rooms[0].polygon.map((point) => point.y);
	return {
		x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
		y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2)
	};
}

async function openFurnish(page: Page) {
	await page.getByTestId('seg-furnish').click();
	await expect(page.getByTestId('furnish-screen')).toBeVisible();
}

test('Plan mit alter Katalog-ID wird importiert, Name und Preis kommen vom neuen Eintrag', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Nur Projekt desktop');
	const oldId = 'ikea-malm-vanity-100x41x78';
	const entry = lookup(oldId);
	expect(catalogAliases[oldId]).toBe('ikea-malm-vanity-120x41x78');
	expect(entry?.id).toBe('ikea-malm-vanity-120x41x78');

	const id = await createProject(page, 'Alte IDs');
	await addRoom(page);
	const project = (await readProject(page, id))!;
	const plan = fixture('plan.json', {
		PROJECT: id,
		ROOM: project.rooms[0].id,
		X: center(project).x,
		Y: center(project).y
	});

	await page.getByTestId('seg-share').click();
	await expect(page.getByTestId('import-panel')).toBeVisible();
	await page.getByTestId('import-text').fill(plan);
	await expect(page.getByTestId('import-preview')).toBeVisible();
	await expect(page.getByTestId('import-invalid')).toHaveCount(0);
	await expect(page.getByTestId('import-unreadable')).toHaveCount(0);
	await expect(page.getByTestId('import-partial')).toHaveCount(0);
	await expect(page.getByTestId('import-corrections')).toHaveCount(0);
	await page.getByTestId('import-apply').click();

	const done = await waitForProject(
		page,
		id,
		(p) => p.variants.some((variant) => variant.items.some((item) => item.catalogId)),
		'importierte Variante'
	);
	const items = done.variants.flatMap((variant) => variant.items);
	expect(items).toHaveLength(1);
	expect(items[0].catalogId).toBe(entry!.id);
	expect(items[0].name).toBe(entry!.name.de);
	expect(items[0].priceChf).toBe(entry!.priceChf);

	await openFurnish(page);
	await page.getByTestId('open-list').click();
	await expect(page.getByTestId('shopping-list')).toBeVisible();
	await expect(page.getByTestId('list-total')).toContainText(String(entry!.priceChf));
});

test('Projekt mit alter Katalog-ID in der Datenbank lädt ohne Fehler und zeigt das Möbel', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Nur Projekt desktop');
	const oldId = 'ikea-hektar-floor-lamp-40x40x181';
	const entry = lookup(oldId)!;
	expect(entry.id).toBe(catalogAliases[oldId]);

	const id = await createProject(page, 'Alte IDs gespeichert');
	await addRoom(page);
	await openFurnish(page);
	const panel = page.getByTestId('catalog-panel');
	const fab = page.getByTestId('catalog-fab');
	await expect(panel.or(fab)).toHaveCount(1);
	if (!(await panel.isVisible())) await fab.click();
	await (await catalogCard(page, entry.id)).click();
	const project = await waitForProject(
		page,
		id,
		(p) => p.variants.some((variant) => variant.items.length === 1),
		'Möbel gesetzt'
	);
	const stored = project.variants.flatMap((variant) => variant.items)[0];
	stored.catalogId = oldId;
	stored.name = 'Stehlampe (alt)';
	delete stored.priceChf;
	project.rev += 1;
	await openProjects(page);
	await page.evaluate(
		(document) =>
			new Promise<void>((resolveWrite, reject) => {
				const open = indexedDB.open('roomx');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const database = open.result;
					const transaction = database.transaction('projects', 'readwrite');
					transaction.objectStore('projects').put(document);
					transaction.oncomplete = () => {
						database.close();
						resolveWrite();
					};
					transaction.onerror = () => reject(transaction.error);
				};
			}),
		project
	);

	await page.goto(`/p/${id}`);
	await expect(page.getByTestId('board')).toBeVisible();
	await openFurnish(page);
	await expect(page.getByTestId('budget-sum')).toContainText(String(entry.priceChf));
	await page.getByTestId('open-list').click();
	await expect(page.getByTestId('shopping-list')).toBeVisible();
	await expect(page.getByTestId('list-total')).toContainText(String(entry.priceChf));
});
