import type { APIRequestContext, Page } from '@playwright/test';
import { TOKEN } from './helpers/app.ts';
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
	readProject,
	takePhotos,
	test,
	waitForProject
} from './mirror/helpers.ts';

const auth = { Authorization: `Bearer ${TOKEN}` };
// The collect interval on both sides is 20 s, so the waits below allow a bit more than one round.
const ROUND = 35_000;

async function connectSync(page: Page, base: string): Promise<void> {
	await page.goto('/settings');
	const url = page.getByTestId('server-url');
	await url.fill(base);
	await url.press('Tab');
	const token = page.getByTestId('server-token');
	await token.fill(TOKEN);
	await token.press('Tab');
	await expect
		.poll(() => page.evaluate(() => localStorage.getItem('roomx.settings') ?? ''))
		.toContain(TOKEN);
}

// The mailbox exists on the server exactly when the shot listing answers.
async function mailboxStatus(request: APIRequestContext, jobId: string): Promise<number> {
	const response = await request.get(`/api/mirror/${jobId}/shots`, { headers: auth });
	return response.status();
}

// Keeps the phone off the relay, so only the server can carry the photos.
async function relayBlocked(phone: Page): Promise<void> {
	await phone.routeWebSocket(/:4275/, (socket) => void socket.close());
}

test('Briefkasten: Handy lädt hoch, PC holt beim Öffnen des Projekts ab, Handy räumt auf', async ({
	world,
	browserName,
	request,
	baseURL
}) => {
	test.setTimeout(240_000);
	const desktop = await world.desktop();
	await connectSync(desktop, baseURL!);
	// Sync shares projects between all tests of the run, so the list is checked by a unique name.
	const name = `Briefkasten ${Math.random().toString(36).slice(2, 8)}`;
	const { id } = await prepareProject(desktop, name);
	const link = await createJob(desktop);

	await desktop.goto('/');
	await expect(desktop.getByTestId('project-card').filter({ hasText: name })).toHaveCount(1);

	const phone = await world.phone();
	await relayBlocked(phone);
	const jobId = await openLink(phone, link);
	await expect.poll(() => mailboxStatus(request, jobId)).toBe(200);
	await openRoomCapture(phone, 'later');
	const captions = await takePhotos(phone, 2, browserName);
	await closeCapture(phone);

	await expect(phone.getByTestId('camera-server')).toContainText('2 Fotos auf dem Server', {
		timeout: 30_000
	});
	await expect
		.poll(async () => (await request.get(`/api/mirror/${jobId}/shots`, { headers: auth })).json())
		.toHaveLength(2);
	expect(photosOf(await readProject(desktop, id))).toHaveLength(0);

	await openProject(desktop, id);
	await expect
		.poll(async () => photosOf(await readProject(desktop, id)).length, { timeout: ROUND + 15_000 })
		.toBe(2);
	const project = (await readProject(desktop, id))!;
	const photos = photosOf(project);
	expect(new Set(photos.map((photo) => photo.stepKey)).size).toBe(2);
	expect(photos.map((photo) => photo.caption).sort()).toEqual([...captions].sort());
	expect(photosOf({ ...project, rooms: project.rooms.slice(0, 1) })).toHaveLength(2);

	await expect
		.poll(async () => (await request.get(`/api/mirror/${jobId}/shots`, { headers: auth })).json())
		.toHaveLength(0);
	await expect.poll(() => countStore(phone, 'mirrorShots'), { timeout: ROUND }).toBe(0);
});

// The relay is blocked, so the phone can learn that the job ended only from the server.
test('Briefkasten: Auftrag beenden leert ihn, das Handy erfährt das Ende über den Server', async ({
	world,
	browserName,
	request,
	baseURL
}) => {
	test.setTimeout(150_000);
	const desktop = await world.desktop();
	await connectSync(desktop, baseURL!);
	await prepareProject(desktop);
	const link = await createJob(desktop);

	const phone = await world.phone();
	await relayBlocked(phone);
	const jobId = await openLink(phone, link);
	await expect.poll(() => mailboxStatus(request, jobId)).toBe(200);
	await openRoomCapture(phone, 'now');

	await desktop.getByRole('dialog').getByTestId('mirror-revoke').click();
	await desktop.getByRole('button', { name: 'Auftrag beenden' }).last().click();
	await expect.poll(() => mailboxStatus(request, jobId)).toBe(410);

	await takePhotos(phone, 1, browserName);
	await expect(phone.getByTestId('camera-status')).toContainText('Auftrag beendet', {
		timeout: 30_000
	});
	expect(await countStore(phone, 'mirrorShots')).toBe(1);
});

test('Ohne Sync-Einstellung gibt es keinen Briefkasten, der Relay-Weg läuft wie bisher', async ({
	world,
	browserName,
	request
}) => {
	test.setTimeout(150_000);
	const desktop = await world.desktop();
	const { id } = await prepareProject(desktop);
	const link = await createJob(desktop);

	const phone = await world.phone();
	const jobId = await openLink(phone, link);
	expect(await mailboxStatus(request, jobId)).toBe(404);
	await openRoomCapture(phone, 'now');
	await takePhotos(phone, 2, browserName);
	await closeCapture(phone);

	await expect(jobDialogStatus(desktop)).toContainText('2 Fotos angekommen', { timeout: 45_000 });
	await waitForProject(desktop, id, (p) => photosOf(p).length === 2, 'zwei Fotos');
	await expect(phone.getByTestId('camera-status')).toContainText('Alle Fotos übertragen', {
		timeout: 30_000
	});
	await expect.poll(() => countStore(phone, 'mirrorShots')).toBe(0);
	await expect(phone.getByTestId('camera-server')).toHaveCount(0);
	expect(await mailboxStatus(request, jobId)).toBe(404);
});
