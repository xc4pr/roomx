import type { APIRequestContext, Page } from '@playwright/test';
import {
	addRoom,
	createProject,
	readAllProjects,
	readProject,
	TOKEN,
	waitForProject,
	type StoredProject
} from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';

const auth = { Authorization: `Bearer ${TOKEN}` };

async function connect(page: Page, token = TOKEN): Promise<void> {
	await page.goto('/settings');
	const field = page.getByTestId('server-token');
	await field.fill(token);
	await field.press('Tab');
}

async function syncNow(page: Page): Promise<void> {
	await page.goto('/settings');
	await expect(page.getByTestId('sync-now')).toBeEnabled({ timeout: 30_000 });
	await page.getByTestId('sync-now').click();
}

async function settleSync(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 1500));
}

async function ready(page: Page): Promise<void> {
	await page.goto('/');
	await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
	await page.reload();
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);
}

// A dropped connection counts as "not there yet", so the surrounding poll tries again.
async function serverProject(request: APIRequestContext, id: string) {
	try {
		const response = await request.get(`/api/projects/${id}`, { headers: auth });
		return response.ok() ? ((await response.json()) as StoredProject) : undefined;
	} catch {
		return undefined;
	}
}

async function named(page: Page, pattern: RegExp): Promise<StoredProject[]> {
	return (await readAllProjects(page)).filter((p) => pattern.test(p.name) && !p.deleted);
}

function uniqueName(prefix: string): string {
	return `${prefix} ${Math.random().toString(36).slice(2, 8)}`;
}

test('Projekt erscheint im zweiten Profil, Änderungen laufen in beide Richtungen', async ({
	launchContext,
	request
}) => {
	const a = await (await launchContext()).newPage();
	const b = await (await launchContext()).newPage();
	await connect(b);

	const name = uniqueName('Sync');
	const id = await createProject(a, name);
	await addRoom(a);
	await waitForProject(a, id, (p) => p.rooms.length === 1);
	await connect(a);
	await syncNow(a);
	await expect.poll(async () => (await serverProject(request, id))?.rooms.length).toBe(1);

	await syncNow(b);
	await expect
		.poll(async () => (await readProject(b, id))?.rooms.length, { timeout: 15_000 })
		.toBe(1);
	await b.goto('/');
	await expect(b.getByTestId('project-card').filter({ hasText: name })).toBeVisible();

	await b.getByTestId('project-card').filter({ hasText: name }).getByRole('link').click();
	await expect(b.getByTestId('board')).toBeVisible();
	await addRoom(b);
	await waitForProject(b, id, (p) => p.rooms.length === 2);
	await syncNow(b);
	await expect.poll(async () => (await serverProject(request, id))?.rooms.length).toBe(2);

	await syncNow(a);
	await expect
		.poll(async () => (await readProject(a, id))?.rooms.length, { timeout: 15_000 })
		.toBe(2);
	await a.goto(`/p/${id}`);
	await expect(a.getByTestId('board')).toBeVisible();
	expect((await readProject(a, id))?.rev).toBe((await serverProject(request, id))?.rev);
});

test('Gleichzeitige Änderungen ergeben eine Konflikt-Kopie, der Serverstand gilt', async ({
	launchContext,
	request
}) => {
	const contextA = await launchContext();
	const contextB = await launchContext();
	const a = await contextA.newPage();
	const b = await contextB.newPage();
	await connect(b);

	const name = uniqueName('Konflikt');
	const id = await createProject(a, name);
	await addRoom(a);
	await waitForProject(a, id, (p) => p.rooms.length === 1);
	await connect(a);
	await syncNow(a);
	await expect.poll(async () => (await serverProject(request, id))?.rooms.length).toBe(1);
	await syncNow(b);
	await expect
		.poll(async () => (await readProject(b, id))?.rooms.length, { timeout: 15_000 })
		.toBe(1);

	await a.goto(`/p/${id}`);
	await expect(a.getByTestId('board')).toBeVisible();
	await b.goto(`/p/${id}`);
	await expect(b.getByTestId('board')).toBeVisible();
	await settleSync();
	await contextA.setOffline(true);
	await contextB.setOffline(true);

	await addRoom(a);
	const changedA = await waitForProject(a, id, (p) => p.rooms.length === 2, 'A offline geändert');
	await addRoom(b);
	await addRoom(b);
	const changedB = await waitForProject(b, id, (p) => p.rooms.length === 3, 'B offline geändert');

	await contextA.setOffline(false);
	await expect
		.poll(async () => (await serverProject(request, id))?.rooms.length, { timeout: 20_000 })
		.toBe(2);
	const serverState = (await serverProject(request, id))!;

	await contextB.setOffline(false);
	await expect
		.poll(async () => (await named(b, new RegExp(`^${name} \\(`))).length, { timeout: 20_000 })
		.toBe(1);

	const [copy] = await named(b, new RegExp(`^${name} \\(`));
	expect(copy.name).toMatch(/Konflikt|Conflict/);
	expect(copy.id).not.toBe(id);
	expect(copy.rooms.map((room) => room.id)).toEqual(changedB.rooms.map((room) => room.id));

	await expect
		.poll(async () => (await readProject(b, id))?.rooms.map((room) => room.id), { timeout: 20_000 })
		.toEqual(serverState.rooms.map((room) => room.id));
	expect(serverState.rooms.map((room) => room.id)).toEqual(changedA.rooms.map((room) => room.id));
	expect((await readProject(b, id))?.name).toBe(name);

	await b.goto('/');
	await expect(b.getByTestId('project-card').filter({ hasText: name })).toHaveCount(2);
	await expect(
		b.getByTestId('project-card').filter({ hasText: new RegExp(`${name} \\(`) })
	).toHaveCount(1);
	await expect.poll(async () => (await serverProject(request, copy.id))?.rooms.length).toBe(3);
});

test('Konflikt-Hinweis ist sichtbar', async ({ launchContext, request }) => {
	const contextA = await launchContext();
	const contextB = await launchContext();
	const a = await contextA.newPage();
	const b = await contextB.newPage();
	await connect(b);
	const name = uniqueName('Hinweis');
	const id = await createProject(a, name);
	await connect(a);
	await syncNow(a);
	await expect.poll(async () => (await serverProject(request, id))?.rev).toBe(1);
	await syncNow(b);
	await expect.poll(async () => (await readProject(b, id))?.rev, { timeout: 15_000 }).toBe(1);
	await b.goto(`/p/${id}`);
	await expect(b.getByTestId('board')).toBeVisible();
	await settleSync();

	await contextB.setOffline(true);
	await addRoom(b);
	await waitForProject(b, id, (p) => p.rooms.length === 1);

	await a.goto(`/p/${id}`);
	await addRoom(a);
	await expect
		.poll(async () => (await serverProject(request, id))?.rooms.length, { timeout: 20_000 })
		.toBe(1);

	await contextB.setOffline(false);
	const toast = b.getByTestId('toast').filter({ hasText: /Konflikt|Conflict/ });
	await expect(toast).toBeVisible({ timeout: 20_000 });
	await expect(toast).toContainText(name);
});

test('Endgültig löschen in A lässt das Projekt in B verschwinden', async ({
	launchContext,
	request
}) => {
	const a = await (await launchContext()).newPage();
	const b = await (await launchContext()).newPage();
	await connect(b);

	const name = uniqueName('Loeschen');
	const id = await createProject(a, name);
	await connect(a);
	await syncNow(a);
	await expect.poll(async () => (await serverProject(request, id))?.rev).toBe(1);
	await syncNow(b);
	await b.goto('/');
	await expect(b.getByTestId('project-card').filter({ hasText: name })).toBeVisible({
		timeout: 15_000
	});

	await a.goto('/');
	const card = a.getByTestId('project-card').filter({ hasText: name });
	await card.getByTestId('project-menu').click();
	await a.getByRole('menuitem').nth(2).click();
	await a.getByTestId('confirm').click();
	await expect(card).toHaveCount(0);
	await a.getByTestId('trash-toggle').click();
	await a.getByTestId('trash-item').filter({ hasText: name }).getByTestId('trash-purge').click();
	await a.getByTestId('confirm').click();
	await expect(a.getByTestId('trash-item').filter({ hasText: name })).toHaveCount(0);
	await syncNow(a);
	await expect
		.poll(async () => (await serverProject(request, id))?.deleted, { timeout: 15_000 })
		.toBe(true);

	await syncNow(b);
	await b.goto('/');
	await expect(b.getByTestId('project-card').filter({ hasText: name })).toHaveCount(0, {
		timeout: 15_000
	});
	expect((await readProject(b, id))?.deleted).toBe(true);
});

test('Falsches Token zeigt einen klaren Status und stürzt nicht ab', async ({ page }) => {
	const name = uniqueName('Token');
	await page.goto('/settings');
	const statusBefore = await page.getByTestId('sync-status').innerText();
	await connect(page, 'falsches-token');
	await syncNow(page);
	await expect(page.getByTestId('sync-unauthorized')).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId('sync-status')).not.toHaveText(statusBefore);

	await page.getByTestId('sync-test').click();
	await expect(page.getByTestId('server-test-result')).toBeVisible();
	await expect(page.getByTestId('server-test-result')).not.toContainText(/undefined|\[object/);

	await page.getByTestId('settings-back').click();
	await expect(page.getByTestId('sync-status')).toBeVisible();
	const id = await createProject(page, name);
	await addRoom(page);
	await waitForProject(page, id, (p) => p.rooms.length === 1);
	await page.goto('/');
	await expect(page.getByTestId('project-card').filter({ hasText: name })).toBeVisible();

	await connect(page);
	await syncNow(page);
	await expect(page.getByTestId('sync-unauthorized')).toHaveCount(0, { timeout: 15_000 });
	await expect(page.getByTestId('sync-last')).not.toHaveText('');
});

test('Start ohne Netz: Sync findet den Server nach Rückkehr des Netzes', async ({
	launchContext,
	request
}) => {
	const context = await launchContext();
	const page = await context.newPage();
	await connect(page);
	await ready(page);

	await context.setOffline(true);
	await page.reload();
	const id = await createProject(page, uniqueName('Zug'));
	await waitForProject(page, id, (p) => p.rev === 0);

	await context.setOffline(false);
	await expect
		.poll(async () => (await serverProject(request, id))?.rev, { timeout: 20_000 })
		.toBe(1);
});
