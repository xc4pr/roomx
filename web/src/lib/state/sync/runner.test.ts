import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoom } from '#lib/core/defaults.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import type { Photo, Project } from '#lib/core/schema.ts';
import { sha256Hex } from '#lib/features/photos/hash.ts';
import { db } from '../db.ts';
import { emptyProject, loadProject, saveProject } from '../persistence.ts';
import { createApi } from './api.ts';
import { FakeServer } from './fakeServer.ts';
import { ensurePhoto, setPhotoSource, setThumbnailer } from './photos.ts';
import { runSync, type Host, type RunContext } from './runner.ts';

const BASE = 'https://s.example';
const ids = sequentialIds('copy');

interface Setup {
	server: FakeServer;
	host: Host & { open: string | null; replaced: Project[]; closed: number; changes: number };
	ctx: RunContext;
}

function setup(token = 'token'): Setup {
	const server = new FakeServer();
	const host = {
		open: null as string | null,
		replaced: [] as Project[],
		closed: 0,
		changes: 0,
		openProjectId() {
			return this.open;
		},
		async flush() {},
		changeCount() {
			return this.changes;
		},
		replaceOpen(project: Project) {
			this.replaced.push(project);
		},
		closeOpen() {
			this.closed += 1;
		}
	};
	const ctx: RunContext = {
		api: createApi(BASE, token, server.fetch),
		host,
		newId: ids,
		now: () => new Date('2026-10-30T10:00:00.000Z'),
		conflictName: (name, date) => `${name} (Konflikt Test ${date})`
	};
	return { server, host, ctx };
}

function project(id: string, patch: Partial<Project> = {}): Project {
	return { ...emptyProject(id, `Projekt ${id}`, '2026-10-01T00:00:00.000Z'), ...patch };
}

async function jpeg(text: string): Promise<{ blob: Blob; hash: string }> {
	const bytes = new TextEncoder().encode(`\xff\xd8\xff${text}`);
	return { blob: new Blob([bytes], { type: 'image/jpeg' }), hash: await sha256Hex(bytes) };
}

function photo(hash: string): Photo {
	return {
		id: `photo-${hash.slice(0, 4)}`,
		hash,
		perspective: { kind: 'free', caption: { de: 'x', en: 'x' } },
		w: 10,
		h: 10,
		takenAt: '2026-10-01T00:00:00.000Z'
	};
}

async function storePhoto(blob: Blob, hash: string, uploaded = false): Promise<void> {
	await db.photos.put({ hash, blob, thumbnail: blob, w: 10, h: 10, uploaded });
}

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
	setPhotoSource(null);
});

describe('runSync', () => {
	it('uploads a new project and records the server revision', async () => {
		const { server, ctx } = setup();
		await saveProject(project('a'));
		const result = await runSync(ctx);
		expect(result).toMatchObject({ outcome: 'ok', pushed: 1, again: false });
		expect(server.projects.get('a')?.rev).toBe(1);
		expect(await db.sync.get('a')).toMatchObject({ baseRev: 1, dirty: false });
		expect((await loadProject('a'))?.rev).toBe(1);
	});

	it('does not touch the server again when nothing changed', async () => {
		const { server, ctx } = setup();
		await saveProject(project('a'));
		await runSync(ctx);
		server.log.length = 0;
		const result = await runSync(ctx);
		expect(result).toMatchObject({ outcome: 'ok', pushed: 0 });
		expect(server.log).toEqual(['GET /api/projects']);
	});

	it('pushes later edits with the stored base revision', async () => {
		const { server, ctx } = setup();
		await saveProject(project('a'));
		await runSync(ctx);
		await saveProject({ ...(await loadProject('a'))!, name: 'Neu', updatedAt: '2026-10-02' });
		await runSync(ctx);
		expect(server.projects.get('a')).toMatchObject({ name: 'Neu', rev: 2 });
		expect(await db.sync.get('a')).toMatchObject({ baseRev: 2, dirty: false });
	});

	it('downloads unknown projects and skips tombstones of unknown ones', async () => {
		const { server, ctx } = setup();
		server.seed(project('remote'), 3);
		server.seed(project('gone', { deleted: true }), 2);
		const result = await runSync(ctx);
		expect(result.pulled).toEqual(['remote']);
		expect(await db.sync.get('remote')).toMatchObject({ baseRev: 3, dirty: false });
		expect((await loadProject('remote'))?.rev).toBe(3);
		expect(await db.projects.get('gone')).toBeUndefined();
	});

	it('takes over a newer server state and replaces the open project', async () => {
		const { server, host, ctx } = setup();
		await saveProject(project('a'));
		await runSync(ctx);
		server.seed(project('a', { name: 'Vom iPad' }), 2);
		host.open = 'a';
		await runSync(ctx);
		expect((await loadProject('a'))?.name).toBe('Vom iPad');
		expect(host.replaced.map((entry) => entry.name)).toEqual(['Vom iPad']);
		expect(await db.sync.get('a')).toMatchObject({ baseRev: 2, dirty: false });
	});

	it('closes the open project when the server deleted it', async () => {
		const { server, host, ctx } = setup();
		await saveProject(project('a'));
		await runSync(ctx);
		server.seed(project('a', { deleted: true }), 2);
		host.open = 'a';
		await runSync(ctx);
		expect(host.closed).toBe(1);
		expect(await loadProject('a')).toBeUndefined();
		expect((await db.projects.get('a'))?.deleted).toBe(true);
	});

	it('pushes a local deletion as tombstone', async () => {
		const { server, ctx } = setup();
		await saveProject(project('a'));
		await runSync(ctx);
		await saveProject({ ...(await db.projects.get('a'))!, deleted: true, rooms: [] });
		await runSync(ctx);
		expect(server.projects.get('a')).toMatchObject({ deleted: true, rev: 2 });
	});

	it('keeps a copy when the server moved on and the project was edited locally', async () => {
		const { server, host, ctx } = setup();
		await saveProject(project('a'));
		await runSync(ctx);
		await saveProject({ ...(await loadProject('a'))!, name: 'Lokal', updatedAt: '2026-10-05' });
		server.seed(project('a', { name: 'Server' }), 2);
		host.open = 'a';
		const result = await runSync(ctx);
		expect(result.conflicts).toHaveLength(1);
		const [conflict] = result.conflicts;
		expect(conflict.name).toBe('Lokal (Konflikt Test 2026-10-30)');
		expect((await loadProject('a'))?.name).toBe('Server');
		expect(await db.sync.get('a')).toMatchObject({ baseRev: 2, dirty: false });
		const copy = await loadProject(conflict.copyId);
		expect(copy?.name).toBe(conflict.name);
		expect(await db.sync.get(conflict.copyId)).toMatchObject({ baseRev: 0, dirty: true });
		expect(host.replaced.map((entry) => entry.name)).toEqual(['Server']);
		expect(result.again).toBe(true);
		await runSync(ctx);
		expect(server.projects.get(conflict.copyId)?.name).toBe(conflict.name);
	});

	it('handles a 409 that appears after the list was read', async () => {
		const { server, ctx } = setup();
		await saveProject(project('a'));
		await runSync(ctx);
		await saveProject({ ...(await loadProject('a'))!, name: 'Lokal', updatedAt: '2026-10-05' });
		server.beforePut = () => {
			server.seed(project('a', { name: 'Parallel' }), 2);
			server.beforePut = null;
		};
		const result = await runSync(ctx);
		expect(result.conflicts).toHaveLength(1);
		expect((await loadProject('a'))?.name).toBe('Parallel');
		expect((await loadProject(result.conflicts[0].copyId))?.name).toContain('Lokal');
	});

	it('keeps the server version when it changed after a local delete', async () => {
		const { server, ctx } = setup();
		await saveProject(project('a'));
		await runSync(ctx);
		await saveProject({ ...(await db.projects.get('a'))!, deleted: true, rooms: [] });
		server.seed(project('a', { name: 'Weiter' }), 2);
		const result = await runSync(ctx);
		expect(result.conflicts).toEqual([]);
		expect((await loadProject('a'))?.name).toBe('Weiter');
	});

	it('re-seeds a server that lost its data', async () => {
		const { server, ctx } = setup();
		await saveProject(project('a'));
		await runSync(ctx);
		server.projects.clear();
		await runSync(ctx);
		expect(server.projects.get('a')?.rev).toBe(1);
		expect(await db.sync.get('a')).toMatchObject({ baseRev: 1, dirty: false });
	});

	it('reports offline without touching local state', async () => {
		const { server, ctx } = setup();
		await saveProject(project('a'));
		server.offline = true;
		const result = await runSync(ctx);
		expect(result.outcome).toBe('offline');
		expect(await db.sync.get('a')).toMatchObject({ dirty: true, baseRev: 0 });
	});

	it('reports unauthorized for a wrong token', async () => {
		const { server, ctx } = setup('wrong');
		await saveProject(project('a'));
		const result = await runSync(ctx);
		expect(result.outcome).toBe('unauthorized');
		expect(server.projects.size).toBe(0);
		expect((await db.sync.get('a'))?.dirty).toBe(true);
	});

	it('reports a server error as retryable and keeps the project dirty', async () => {
		const { server, ctx } = setup();
		await saveProject(project('a'));
		server.failProjectPuts = true;
		const result = await runSync(ctx);
		expect(result).toMatchObject({ outcome: 'error', failed: 1 });
		expect((await db.sync.get('a'))?.dirty).toBe(true);
	});

	it('uploads missing photos before the project and marks them uploaded', async () => {
		const { server, ctx } = setup();
		const first = await jpeg('one');
		const second = await jpeg('two');
		await storePhoto(first.blob, first.hash);
		await storePhoto(second.blob, second.hash);
		server.photos.set(second.hash, second.blob);
		const room = { ...createRoom('r1', 'Zimmer'), photos: [photo(first.hash), photo(second.hash)] };
		await saveProject(project('a', { rooms: [room] }));
		await runSync(ctx);
		const order = server.log.filter((line) => /PUT|HEAD/.test(line));
		expect(order).toEqual([
			`HEAD /api/photos/${first.hash}`,
			`PUT /api/photos/${first.hash}`,
			`HEAD /api/photos/${second.hash}`,
			'PUT /api/projects/a'
		]);
		expect(server.photos.has(first.hash)).toBe(true);
		expect((await db.photos.get(first.hash))?.uploaded).toBe(true);
		expect((await db.photos.get(second.hash))?.uploaded).toBe(true);
	});

	it('does not push the project when the photo upload cannot reach the server', async () => {
		const { server, ctx } = setup();
		const first = await jpeg('one');
		await storePhoto(first.blob, first.hash);
		const room = { ...createRoom('r1', 'Zimmer'), photos: [photo(first.hash)] };
		await saveProject(project('a', { rooms: [room] }));
		const original = server.fetch;
		server.fetch = async (input, init) => {
			if (init?.method === 'PUT' && String(input).includes('/photos/')) {
				throw new TypeError('lost');
			}
			return original(input, init);
		};
		const failing = { ...ctx, api: createApi(BASE, 'token', server.fetch) };
		const result = await runSync(failing);
		expect(result.outcome).toBe('offline');
		expect(server.projects.size).toBe(0);
		expect((await db.photos.get(first.hash))?.uploaded).toBe(false);
	});

	it('skips photos the server refuses but still syncs the project', async () => {
		const { server, ctx } = setup();
		const big = await jpeg('big');
		await storePhoto(big.blob, big.hash);
		server.oversizedPhotos.add(big.hash);
		const room = { ...createRoom('r1', 'Zimmer'), photos: [photo(big.hash)] };
		await saveProject(project('a', { rooms: [room] }));
		const result = await runSync(ctx);
		expect(result.outcome).toBe('ok');
		expect(server.projects.has('a')).toBe(true);
		expect((await db.photos.get(big.hash))?.uploaded).toBe(false);
	});

	it('keeps the project dirty when it changed during the run', async () => {
		const { server, ctx } = setup();
		await saveProject(project('a'));
		server.beforePut = async () => {
			await saveProject({
				...(await db.projects.get('a'))!,
				name: 'Mitten drin',
				updatedAt: '2026-10-09'
			});
		};
		const result = await runSync(ctx);
		expect(result.again).toBe(true);
		expect(await db.sync.get('a')).toMatchObject({ baseRev: 1, dirty: true });
		expect((await loadProject('a'))?.name).toBe('Mitten drin');
		server.beforePut = null;
		await runSync(ctx);
		expect(server.projects.get('a')).toMatchObject({ name: 'Mitten drin', rev: 2 });
		expect(await db.sync.get('a')).toMatchObject({ baseRev: 2, dirty: false });
	});

	it('does not overwrite a local edit made while the server state was downloading', async () => {
		const { server, ctx } = setup();
		await saveProject(project('a'));
		await runSync(ctx);
		server.seed(project('a', { name: 'Server' }), 2);
		const original = server.fetch;
		const racing = {
			...ctx,
			api: createApi(BASE, 'token', async (input, init) => {
				const response = await original(input, init);
				if (init?.method === undefined && String(input).endsWith('/projects/a')) {
					await saveProject({
						...(await db.projects.get('a'))!,
						name: 'Eilig',
						updatedAt: '2026-10-09'
					});
				}
				return response;
			})
		};
		const result = await runSync(racing);
		expect(result.again).toBe(true);
		expect((await loadProject('a'))?.name).toBe('Eilig');
		expect((await db.sync.get('a'))?.dirty).toBe(true);
	});

	it('keeps an edit to the open project made while the server state was stored', async () => {
		const { server, host, ctx } = setup();
		await saveProject(project('a'));
		await runSync(ctx);
		server.seed(project('a', { name: 'Server' }), 2);
		host.open = 'a';
		// The edit lands between the flush and the end of the transaction.
		const counted = vi.spyOn(host, 'changeCount').mockReturnValueOnce(0).mockReturnValue(1);
		const result = await runSync(ctx);
		expect(result.again).toBe(true);
		expect(host.replaced).toEqual([]);
		expect(await db.sync.get('a')).toMatchObject({ baseRev: 1, dirty: true });
		// The store then saves the edited state over the server state.
		await saveProject({ ...project('a'), name: 'Eilig', updatedAt: '2026-10-09' });
		counted.mockRestore();
		const next = await runSync(ctx);
		expect(next.conflicts.map((conflict) => conflict.originalName)).toEqual(['Eilig']);
		expect((await loadProject(next.conflicts[0].copyId))?.name).toContain('Eilig');
		expect((await loadProject('a'))?.name).toBe('Server');
		expect(host.replaced.map((entry) => entry.name)).toEqual(['Server']);
	});

	it('keeps an edit to the open project made while a conflict was resolved', async () => {
		const { server, host, ctx } = setup();
		await saveProject(project('a'));
		await runSync(ctx);
		await saveProject({ ...(await loadProject('a'))!, name: 'Lokal', updatedAt: '2026-10-05' });
		server.seed(project('a', { name: 'Server' }), 2);
		host.open = 'a';
		const counted = vi.spyOn(host, 'changeCount').mockReturnValueOnce(0).mockReturnValue(1);
		const result = await runSync(ctx);
		expect(result.conflicts.map((conflict) => conflict.originalName)).toEqual(['Lokal']);
		expect(host.replaced).toEqual([]);
		expect(await db.sync.get('a')).toMatchObject({ baseRev: 1, dirty: true });
		await saveProject({ ...project('a'), name: 'Lokal und eilig', updatedAt: '2026-10-09' });
		counted.mockRestore();
		const next = await runSync(ctx);
		expect(next.conflicts.map((conflict) => conflict.originalName)).toEqual(['Lokal und eilig']);
		expect((await loadProject('a'))?.name).toBe('Server');
		expect(host.replaced.map((entry) => entry.name)).toEqual(['Server']);
	});

	it('leaves projects with unsupported versions alone', async () => {
		const { server, ctx } = setup();
		server.seed({ ...project('future'), schemaVersion: 999 }, 1);
		server.seed(project('fine'), 1);
		const result = await runSync(ctx);
		expect(result.outcome).toBe('ok');
		expect(result.pulled).toEqual(['fine']);
		expect(await db.projects.get('future')).toBeUndefined();
	});
});

describe('ensurePhoto', () => {
	it('downloads, verifies and stores a missing photo once', async () => {
		const { server, ctx } = setup();
		const remote = await jpeg('remote');
		server.photos.set(remote.hash, remote.blob);
		setPhotoSource(ctx.api);
		setThumbnailer(async (blob) => ({ thumbnail: blob, w: 4, h: 3 }));
		const [one, two] = await Promise.all([ensurePhoto(remote.hash), ensurePhoto(remote.hash)]);
		expect([one, two]).toEqual([true, true]);
		expect(server.log.filter((line) => line.startsWith('GET /api/photos'))).toHaveLength(1);
		expect(await db.photos.get(remote.hash)).toMatchObject({ w: 4, h: 3, uploaded: true });
		server.log.length = 0;
		expect(await ensurePhoto(remote.hash)).toBe(true);
		expect(server.log).toEqual([]);
		setThumbnailer(null);
	});

	it('rejects content that does not match the hash', async () => {
		const { server, ctx } = setup();
		const wrong = await jpeg('wrong');
		const other = await jpeg('other');
		server.photos.set(wrong.hash, other.blob);
		setPhotoSource(ctx.api);
		setThumbnailer(async (blob) => ({ thumbnail: blob, w: 1, h: 1 }));
		expect(await ensurePhoto(wrong.hash)).toBe(false);
		expect(await db.photos.get(wrong.hash)).toBeUndefined();
		setThumbnailer(null);
	});

	it('returns false without a source or when the server lacks the photo', async () => {
		const { ctx } = setup();
		const missing = await jpeg('missing');
		expect(await ensurePhoto(missing.hash)).toBe(false);
		setPhotoSource(ctx.api);
		expect(await ensurePhoto(missing.hash)).toBe(false);
	});
});

vi.setConfig({ testTimeout: 15_000 });
