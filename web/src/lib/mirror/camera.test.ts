import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '#lib/features/photos/hash.ts';
import type { ProcessedImage } from '#lib/features/photos/image.ts';
import { minimalJpeg } from '#lib/features/photos/testImages.ts';
import { db } from '#lib/state/db.ts';
import { CameraSession, type CameraOptions } from './camera.svelte.ts';
import { FakeHub, type FakePeer } from './fakeTransport.ts';
import { openMessage, sealMessage, type Message } from './frames.ts';
import { getJob, listShots, saveCameraPart } from './jobs.ts';
import { deriveKeys, newToken, type MirrorKeys } from './token.ts';
import { MAX_SHOTS_PER_JOB, type OpenTransport } from './types.ts';

vi.setConfig({ testTimeout: 30_000 });

const until = (check: () => void) => vi.waitFor(check, { timeout: 20_000, interval: 10 });
const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

async function image(tag: string): Promise<ProcessedImage> {
	const bytes = new Uint8Array(minimalJpeg(64, 48, tag));
	return {
		hash: await sha256Hex(bytes),
		blob: new Blob([bytes], { type: 'image/jpeg' }),
		thumbnail: new Blob([new Uint8Array(1)]),
		w: 64,
		h: 48
	};
}

interface Computer {
	transport: FakePeer;
	keys: MirrorKeys;
	inbox: Message[];
	phone: () => string;
	send: (message: Message) => Promise<void>;
	count: (type: string) => number;
}

async function computer(hub: FakeHub, keys: MirrorKeys, jobId: string): Promise<Computer> {
	const transport = (await hub.open({ topic: keys.topic, password: keys.password })) as FakePeer;
	const inbox: Message[] = [];
	let phone = '';
	transport.onPeerJoin((peer) => (phone = peer));
	transport.onData(async (data) => {
		const message = await openMessage(keys.key, jobId, data);
		if (message) inbox.push(message);
	});
	return {
		transport,
		keys,
		inbox,
		phone: () => phone,
		send: async (message) => transport.send(await sealMessage(keys.key, jobId, message), phone),
		count: (type) => inbox.filter((entry) => entry.frame.t === type).length
	};
}

let hub: FakeHub;
let token: string;
let keys: MirrorKeys;
const cleanup: (() => void)[] = [];

async function makeJob(expiresInMs = 60_000, revoked = false) {
	await saveCameraPart(token, {
		v: 1,
		project: 'Wohnung',
		lang: 'de',
		expiresAt: Date.now() + expiresInMs,
		part: 0,
		parts: 1,
		rooms: []
	});
	if (revoked) {
		const job = await getJob(keys.jobId);
		if (job?.role === 'camera') await db.mirrorJobs.put({ ...job, revokedAt: Date.now() });
	}
}

function session(options: CameraOptions = {}, open: OpenTransport = hub.open): CameraSession {
	return new CameraSession(keys.jobId, open, {
		ackTimeoutMs: 300,
		retryLaterMs: 60,
		fallbackAfterMs: 5000,
		...options
	});
}

function run(camera: CameraSession): void {
	cleanup.push(camera.start());
}

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
	hub = new FakeHub();
	token = newToken();
	keys = await deriveKeys(token);
});

afterEach(async () => {
	for (const stop of cleanup.splice(0)) stop();
	await tick(10);
});

describe('CameraSession start', () => {
	it('does not connect to an unknown, revoked or expired job', async () => {
		const open = vi.fn(hub.open);
		const unknown = session({}, open);
		run(unknown);
		await until(() => expect(unknown.status.status).toBe('ended'));
		expect(unknown.status.expired).toBe(true);

		await makeJob(60_000, true);
		const revoked = session({}, open);
		run(revoked);
		await until(() => expect(revoked.status.revoked).toBe(true));
		expect(revoked.status.status).toBe('ended');

		await db.mirrorJobs.clear();
		await makeJob(-5000);
		const expired = session({}, open);
		run(expired);
		await until(() => expect(expired.status.expired).toBe(true));
		expect(open).not.toHaveBeenCalled();
	});

	it('searches, suggests the file fallback after a while and clears it on connection', async () => {
		await makeJob();
		const camera = session({ fallbackAfterMs: 80 });
		run(camera);
		await until(() => expect(camera.status.status).toBe('searching'));
		expect(camera.status.fallbackSuggested).toBe(false);
		await until(() => expect(camera.status.fallbackSuggested).toBe(true));
		const pc = await computer(hub, keys, keys.jobId);
		await until(() => expect(pc.count('hello')).toBe(1));
		await pc.send({ frame: { t: 'state', received: [] } });
		await until(() => expect(camera.status.status).toBe('connected'));
		expect(camera.status.fallbackSuggested).toBe(false);
	});
});

describe('CameraSession transfer', () => {
	it('says hello with every photo, drops confirmed ones and sends the rest one by one', async () => {
		await makeJob();
		const camera = session();
		const [a, b, c] = [await image('a'), await image('b'), await image('c')];
		await camera.addShot(0, 'corner:A', a);
		await camera.addShot(1, 'wall:1', b);
		await camera.addShot(0, 'corner:B', c);
		run(camera);
		await until(() => expect(camera.status.status).toBe('searching'));
		const pc = await computer(hub, keys, keys.jobId);
		await until(() => expect(pc.count('hello')).toBe(1));
		const hello = pc.inbox[0].frame;
		expect(hello.t === 'hello' && hello.pending.map((shot) => shot.hash)).toEqual([
			a.hash,
			b.hash,
			c.hash
		]);
		await pc.send({ frame: { t: 'state', received: [a.hash] } });
		await until(() => expect(pc.count('photo')).toBe(1));
		await tick(50);
		expect(pc.count('photo')).toBe(1);
		expect(camera.status).toMatchObject({ sent: 0, total: 2, pending: 2 });
		const first = pc.inbox.find((entry) => entry.frame.t === 'photo');
		expect(first?.frame.t === 'photo' && first.frame.shot.hash).toBe(b.hash);
		expect(first?.body?.byteLength).toBe(b.blob.size);

		await pc.send({ frame: { t: 'ack', hash: b.hash, ok: true } });
		await until(() => expect(pc.count('photo')).toBe(2));
		await pc.send({ frame: { t: 'ack', hash: c.hash, ok: true, duplicate: true } });
		await until(() => expect(camera.shots).toHaveLength(0));
		expect(camera.status).toMatchObject({ sent: 2, total: 2, pending: 0, failed: [] });
		expect(await listShots(keys.jobId)).toEqual([]);
	});

	it('marks refused photos as failed and keeps them', async () => {
		await makeJob();
		const camera = session();
		const bad = await camera.addShot(0, 'corner:A', await image('bad'));
		const lost = await camera.addShot(9, 'corner:A', await image('lost'));
		const good = await camera.addShot(0, 'corner:B', await image('good'));
		run(camera);
		await until(() => expect(camera.status.status).toBe('searching'));
		const pc = await computer(hub, keys, keys.jobId);
		await until(() => expect(pc.count('hello')).toBe(1));
		await pc.send({ frame: { t: 'state', received: [] } });
		await until(() => expect(pc.count('photo')).toBe(1));
		await pc.send({ frame: { t: 'ack', hash: bad.hash, ok: false, reason: 'invalid' } });
		await until(() => expect(pc.count('photo')).toBe(2));
		await pc.send({ frame: { t: 'ack', hash: lost.hash, ok: false, reason: 'unknownRoom' } });
		await until(() => expect(pc.count('photo')).toBe(3));
		await pc.send({ frame: { t: 'ack', hash: good.hash, ok: true } });
		await until(() => expect(camera.shots).toHaveLength(2));
		expect(camera.status.failed).toEqual([bad.id, lost.id]);
		expect((await listShots(keys.jobId)).map((shot) => shot.id).sort()).toEqual(
			[bad.id, lost.id].sort()
		);
	});

	it('tries again later with a new hello after readOnly and storage replies', async () => {
		await makeJob();
		const camera = session();
		const shot = await camera.addShot(0, 'corner:A', await image('later'));
		run(camera);
		await until(() => expect(camera.status.status).toBe('searching'));
		const pc = await computer(hub, keys, keys.jobId);
		await until(() => expect(pc.count('hello')).toBe(1));
		await pc.send({ frame: { t: 'state', received: [] } });
		await until(() => expect(pc.count('photo')).toBe(1));
		await pc.send({ frame: { t: 'ack', hash: shot.hash, ok: false, reason: 'readOnly' } });
		await until(() => expect(pc.count('hello')).toBe(2));
		expect(camera.shots).toHaveLength(1);
		expect(camera.status.failed).toEqual([]);
		await pc.send({ frame: { t: 'state', received: [] } });
		await until(() => expect(pc.count('photo')).toBe(2));
		await pc.send({ frame: { t: 'ack', hash: shot.hash, ok: true } });
		await until(() => expect(camera.shots).toHaveLength(0));
	});

	it('starts over with hello when no acknowledgement arrives', async () => {
		await makeJob();
		const camera = session({ ackTimeoutMs: 60 });
		await camera.addShot(0, 'corner:A', await image('slow'));
		run(camera);
		await until(() => expect(camera.status.status).toBe('searching'));
		const pc = await computer(hub, keys, keys.jobId);
		await until(() => expect(pc.count('hello')).toBe(1));
		await pc.send({ frame: { t: 'state', received: [] } });
		await until(() => expect(pc.count('hello')).toBe(2));
		expect(camera.shots).toHaveLength(1);
	});

	it('continues from hello when the connection breaks in the middle', async () => {
		await makeJob();
		const camera = session();
		const [a, b] = [await image('m1'), await image('m2')];
		await camera.addShot(0, 'corner:A', a);
		await camera.addShot(0, 'corner:B', b);
		run(camera);
		await until(() => expect(camera.status.status).toBe('searching'));
		const pc = await computer(hub, keys, keys.jobId);
		await until(() => expect(pc.count('hello')).toBe(1));
		await pc.send({ frame: { t: 'state', received: [] } });
		await until(() => expect(pc.count('photo')).toBe(1));
		hub.sever(pc.phone());
		await until(() => expect(camera.status.status).toBe('searching'));
		expect(camera.shots).toHaveLength(2);
		hub.heal(pc.phone());
		await until(() => expect(pc.count('hello')).toBe(2));
		await pc.send({ frame: { t: 'state', received: [a.hash] } });
		await until(() => expect(camera.shots).toHaveLength(1));
		await until(() => expect(pc.count('photo')).toBe(2));
		expect(camera.status).toMatchObject({ status: 'connected', sent: 0, total: 1 });
		await pc.send({ frame: { t: 'ack', hash: b.hash, ok: true } });
		await until(() => expect(camera.shots).toHaveLength(0));
		expect(camera.status.sent).toBe(1);
	});

	it('queues photos taken while connected and forgets removed ones', async () => {
		await makeJob();
		const camera = session();
		run(camera);
		await until(() => expect(camera.status.status).toBe('searching'));
		const pc = await computer(hub, keys, keys.jobId);
		await until(() => expect(pc.count('hello')).toBe(1));
		await pc.send({ frame: { t: 'state', received: [] } });
		await until(() => expect(camera.status.status).toBe('connected'));
		const first = await camera.addShot(0, 'corner:A', await image('q1'));
		await until(() => expect(pc.count('photo')).toBe(1));
		const second = await camera.addShot(0, 'corner:B', await image('q2'));
		expect(camera.status.total).toBe(2);
		await camera.removeShot(second.id);
		expect(camera.shots.map((shot) => shot.id)).toEqual([first.id]);
		await pc.send({ frame: { t: 'ack', hash: first.hash, ok: true } });
		await until(() => expect(camera.shots).toHaveLength(0));
		await tick(50);
		expect(pc.count('photo')).toBe(1);
		expect(await listShots(keys.jobId)).toEqual([]);
	});
});

describe('CameraSession limits', () => {
	it('refuses more photos than a job may hold', async () => {
		await makeJob();
		const camera = session();
		const shot = await image('cap');
		camera.shots = Array.from({ length: MAX_SHOTS_PER_JOB }, (_, i) => ({
			id: `s${i}`,
			jobId: keys.jobId,
			room: 0,
			stepKey: 'corner:A',
			hash: shot.hash,
			blob: shot.blob,
			thumbnail: shot.thumbnail,
			w: 64,
			h: 48,
			takenAt: new Date(1000 + i).toISOString()
		}));
		await expect(camera.addShot(0, 'corner:A', shot)).rejects.toMatchObject({ code: 'limit' });
		expect(camera.shots).toHaveLength(MAX_SHOTS_PER_JOB);
	});
});

describe('CameraSession end of job', () => {
	it('remembers a revoke, leaves and ignores later traffic', async () => {
		await makeJob();
		const camera = session();
		run(camera);
		await until(() => expect(camera.status.status).toBe('searching'));
		const pc = await computer(hub, keys, keys.jobId);
		await until(() => expect(pc.count('hello')).toBe(1));
		await pc.send({ frame: { t: 'revoked' } });
		await until(() => expect(camera.status.revoked).toBe(true));
		expect(camera.status.status).toBe('ended');
		const stored = await getJob(keys.jobId);
		expect(stored?.revokedAt).toBeTypeOf('number');
		expect(hub.peers()).toEqual([pc.transport.id]);
	});

	it('ends when the job expires during the session', async () => {
		await makeJob(150);
		const camera = session();
		run(camera);
		await until(() => expect(camera.status.status).toBe('searching'));
		await until(() => expect(camera.status.expired).toBe(true));
		expect(camera.status.status).toBe('ended');
		expect(hub.peers()).toEqual([]);
	});

	it('ignores peers with the wrong key and garbage', async () => {
		await makeJob();
		const camera = session();
		run(camera);
		await until(() => expect(camera.status.status).toBe('searching'));
		const other = await deriveKeys(newToken());
		const stranger = await computer(hub, { ...keys, key: other.key }, keys.jobId);
		await until(() => expect(stranger.phone()).not.toBe(''));
		await stranger.send({ frame: { t: 'revoked' } });
		await stranger.send({ frame: { t: 'state', received: [] } });
		await stranger.transport.send(new Uint8Array(40).fill(3), stranger.phone());
		await tick(100);
		expect(camera.status).toMatchObject({ status: 'searching', revoked: false });
		expect(stranger.count('photo')).toBe(0);
	});

	it('stopping closes the connection', async () => {
		await makeJob();
		const camera = session();
		const stop = camera.start();
		await until(() => expect(hub.peers()).toHaveLength(1));
		stop();
		await until(() => expect(hub.peers()).toHaveLength(0));
		expect(camera.status.status).toBe('ended');
	});
});

function fakeMailbox() {
	const state = {
		shots: new Map<string, Uint8Array>(),
		placed: [] as string[],
		calls: [] as { method: string; path: string; headers: Headers; body?: unknown }[],
		status: 0,
		registerStatus: 201,
		offline: false
	};
	const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		const method = init?.method ?? 'GET';
		state.calls.push({
			method,
			path: url.pathname,
			headers: new Headers(init?.headers),
			body: init?.body
		});
		if (state.offline) throw new TypeError('offline');
		if (state.status) return new Response('', { status: state.status });
		const [, , , , what, id] = url.pathname.split('/');
		if (what === undefined)
			return new Response('{}', { status: method === 'PUT' ? state.registerStatus : 200 });
		if (what === 'placed') return Response.json({ placed: state.placed, expiresAt: 1 });
		if (id === undefined) {
			return Response.json(
				[...state.shots].map(([key, bytes]) => ({ id: key, size: bytes.length }))
			);
		}
		if (method === 'PUT') {
			state.shots.set(id, new Uint8Array(init?.body as Uint8Array));
			return new Response('{}', { status: 201 });
		}
		if (method === 'DELETE') {
			state.placed.push(id);
			state.shots.delete(id);
			return new Response('{}');
		}
		return new Response((state.shots.get(id) as BodyInit | undefined) ?? '', {
			status: state.shots.has(id) ? 200 : 404
		});
	});
	const env = {
		fetch: fetcher as unknown as typeof fetch,
		free: false,
		serverUrl: 'https://srv.test',
		token: 'sync-token',
		origin: 'https://srv.test'
	};
	const count = (method: string, part: string) =>
		state.calls.filter((call) => call.method === method && call.path.includes(part)).length;
	return { state, fetcher, env, count };
}

async function makeServerJob() {
	await saveCameraPart(token, {
		v: 1,
		project: 'Wohnung',
		lang: 'de',
		expiresAt: Date.now() + 60_000,
		server: true,
		part: 0,
		parts: 1,
		rooms: []
	});
}

describe('CameraSession mailbox', () => {
	const fast = { placedMs: 40, uploadRetryMs: 60 };

	it('uploads each photo sealed with the mailbox header and remembers the id', async () => {
		await makeServerJob();
		const mail = fakeMailbox();
		const camera = session({ ...fast, mailbox: mail.env });
		run(camera);
		await until(() => expect(camera.status.server).toBe('ok'));
		const shot = await camera.addShot(0, 'corner:A', await image('one'));
		await until(() => expect(camera.status.uploaded).toBe(1));
		const [call] = mail.state.calls;
		expect(call.method).toBe('PUT');
		expect(call.headers.get('X-Roomx-Mailbox')).toBe(keys.mailbox);
		const [[id, sealed]] = [...mail.state.shots];
		expect(call.path).toBe(`/api/mirror/${keys.jobId}/shots/${id}`);
		expect(id).toBe(await sha256Hex(sealed));
		const message = await openMessage(keys.key, keys.jobId, new Uint8Array(sealed));
		expect(message?.frame).toMatchObject({ t: 'photo', shot: { hash: shot.hash, room: 0 } });
		expect((await listShots(keys.jobId))[0].uploaded).toBe(id);
		expect(camera.shots[0].uploaded).toBe(id);
	});

	it('deletes locally only after the computer fetched the photo', async () => {
		await makeServerJob();
		const mail = fakeMailbox();
		const camera = session({ ...fast, mailbox: mail.env });
		run(camera);
		await until(() => expect(camera.status.server).toBe('ok'));
		await camera.addShot(0, 'corner:A', await image('keep'));
		await until(() => expect(camera.status.uploaded).toBe(1));
		await tick(150);
		expect(await listShots(keys.jobId)).toHaveLength(1);
		expect(mail.count('GET', '/placed')).toBeGreaterThan(0);
		mail.state.placed.push([...mail.state.shots.keys()][0]);
		await until(async () => expect(await listShots(keys.jobId)).toHaveLength(0));
		expect(camera.shots).toEqual([]);
		expect(camera.status.uploaded).toBe(0);
	});

	it('uploads photos that were taken earlier when the page opens', async () => {
		await makeServerJob();
		const mail = fakeMailbox();
		const first = session({ ...fast, mailbox: { ...mail.env, free: true } });
		run(first);
		await first.addShot(0, 'corner:A', await image('old'));
		cleanup.pop()?.();
		expect(mail.fetcher).not.toHaveBeenCalled();
		const second = session({ ...fast, mailbox: mail.env });
		run(second);
		await until(() => expect(second.status.uploaded).toBe(1));
	});

	it('switches off on 410 until the next start', async () => {
		await makeServerJob();
		const mail = fakeMailbox();
		mail.state.status = 410;
		const camera = session({ ...fast, mailbox: mail.env });
		run(camera);
		await until(() => expect(camera.status.server).toBe('ok'));
		await camera.addShot(0, 'corner:A', await image('gone'));
		await until(() => expect(camera.status.server).toBe('unreachable'));
		const calls = mail.fetcher.mock.calls.length;
		await camera.addShot(0, 'corner:B', await image('gone2'));
		await tick(150);
		expect(mail.fetcher.mock.calls.length).toBe(calls);
		expect(camera.shots).toHaveLength(2);
		expect(camera.status.uploaded).toBe(0);
	});

	it('retries after a network failure', async () => {
		await makeServerJob();
		const mail = fakeMailbox();
		mail.state.offline = true;
		const camera = session({ ...fast, mailbox: mail.env });
		run(camera);
		await until(() => expect(camera.status.server).toBe('ok'));
		await camera.addShot(0, 'corner:A', await image('net'));
		await until(() => expect(mail.fetcher.mock.calls.length).toBeGreaterThan(1));
		expect(camera.status.server).toBe('ok');
		mail.state.offline = false;
		await until(() => expect(camera.status.uploaded).toBe(1));
	});

	it('makes no request in the free edition or for jobs without the flag', async () => {
		const mail = fakeMailbox();
		await makeServerJob();
		const free = session({ ...fast, mailbox: { ...mail.env, free: true } });
		run(free);
		await tick(30);
		await free.addShot(0, 'corner:A', await image('free'));
		await tick(150);
		expect(free.status.server).toBe('off');
		cleanup.pop()?.();
		await db.mirrorJobs.clear();
		await makeJob();
		const plain = session({ ...fast, mailbox: mail.env });
		run(plain);
		await tick(30);
		await plain.addShot(0, 'corner:B', await image('plain'));
		await tick(150);
		expect(plain.status.server).toBe('off');
		expect(mail.fetcher).not.toHaveBeenCalled();
	});
});

describe('CameraSession mailbox failures', () => {
	const fast = { placedMs: 40, uploadRetryMs: 60 };

	async function started(mail: ReturnType<typeof fakeMailbox>) {
		await makeServerJob();
		const camera = session({ ...fast, mailbox: mail.env });
		run(camera);
		await until(() => expect(camera.status.server).toBe('ok'));
		return camera;
	}

	for (const status of [404, 401, 403]) {
		it(`stops uploading after ${status} and keeps every photo`, async () => {
			const mail = fakeMailbox();
			mail.state.status = status;
			const camera = await started(mail);
			await camera.addShot(0, 'corner:A', await image(`s${status}`));
			await until(() => expect(camera.status.server).toBe('unreachable'));
			const calls = mail.fetcher.mock.calls.length;
			await tick(150);
			expect(mail.fetcher.mock.calls.length).toBe(calls);
			expect(camera.shots).toHaveLength(1);
			expect(await listShots(keys.jobId)).toHaveLength(1);
			expect(camera.status.uploaded).toBe(0);
		});
	}

	it('keeps retrying after 409 (mailbox full) without giving up or dropping photos', async () => {
		const mail = fakeMailbox();
		mail.state.status = 409;
		const camera = await started(mail);
		await camera.addShot(0, 'corner:A', await image('full'));
		await until(() => expect(mail.fetcher.mock.calls.length).toBeGreaterThan(2));
		expect(camera.status.server).toBe('ok');
		expect(camera.shots).toHaveLength(1);
		mail.state.status = 0;
		await until(() => expect(camera.status.uploaded).toBe(1));
	});

	it('uploads the same photo only once when the answer arrives late', async () => {
		const mail = fakeMailbox();
		const camera = await started(mail);
		await camera.addShot(0, 'corner:A', await image('once'));
		await until(() => expect(camera.status.uploaded).toBe(1));
		await tick(150);
		expect(mail.count('PUT', '/shots/')).toBe(1);
	});

	it('does not delete anything while the computer has not fetched, even after many rounds', async () => {
		const mail = fakeMailbox();
		const camera = await started(mail);
		await camera.addShot(0, 'corner:A', await image('stay'));
		await until(() => expect(camera.status.uploaded).toBe(1));
		await until(() => expect(mail.count('GET', '/placed')).toBeGreaterThan(2));
		expect(await listShots(keys.jobId)).toHaveLength(1);
	});

	it('ignores placed ids that belong to no photo and removes only the matching one', async () => {
		const mail = fakeMailbox();
		const camera = await started(mail);
		await camera.addShot(0, 'corner:A', await image('m1'));
		await camera.addShot(0, 'corner:B', await image('m2'));
		await until(() => expect(camera.status.uploaded).toBe(2));
		const [first, second] = camera.shots.map((shot) => shot.uploaded ?? '');
		mail.state.placed.push('f'.repeat(64), first);
		await until(() => expect(camera.shots).toHaveLength(1));
		expect(camera.shots[0].uploaded).toBe(second);
		expect(await listShots(keys.jobId)).toHaveLength(1);
	});

	it('keeps photos when the placed list cannot be read (network, bad reply)', async () => {
		const mail = fakeMailbox();
		const camera = await started(mail);
		await camera.addShot(0, 'corner:A', await image('pl'));
		await until(() => expect(camera.status.uploaded).toBe(1));
		const id = camera.shots[0].uploaded ?? '';
		mail.state.placed.push(id);
		mail.fetcher.mockImplementation(async () => Response.json({ placed: 'no' }));
		await tick(150);
		expect(camera.shots).toHaveLength(1);
		expect(camera.status.server).toBe('ok');
		mail.fetcher.mockImplementation(async () => {
			throw new TypeError('offline');
		});
		await tick(150);
		expect(camera.shots).toHaveLength(1);
		expect(await listShots(keys.jobId)).toHaveLength(1);
	});

	it('switches off when the secret is refused while collecting, and keeps the photos', async () => {
		const mail = fakeMailbox();
		const camera = await started(mail);
		await camera.addShot(0, 'corner:A', await image('sec'));
		await until(() => expect(camera.status.uploaded).toBe(1));
		mail.state.status = 401;
		await until(() => expect(camera.status.server).toBe('unreachable'));
		expect(camera.shots).toHaveLength(1);
	});

	it('does not upload a photo that was removed before its turn', async () => {
		const mail = fakeMailbox();
		const camera = await started(mail);
		mail.state.offline = true;
		const kept = await camera.addShot(0, 'corner:A', await image('k'));
		await until(() => expect(mail.fetcher.mock.calls.length).toBeGreaterThan(0));
		const removed = await camera.addShot(0, 'corner:B', await image('r'));
		await camera.removeShot(removed.id);
		mail.state.offline = false;
		await until(() => expect(camera.status.uploaded).toBe(1));
		expect(camera.shots.map((shot) => shot.id)).toEqual([kept.id]);
		expect(mail.state.shots.size).toBe(1);
	});

	it('stopping the page stops every upload and every collect', async () => {
		const mail = fakeMailbox();
		const camera = await started(mail);
		await camera.addShot(0, 'corner:A', await image('stop'));
		await until(() => expect(camera.status.uploaded).toBe(1));
		cleanup.pop()?.();
		await tick(20);
		const calls = mail.fetcher.mock.calls.length;
		await tick(150);
		expect(mail.fetcher.mock.calls.length).toBe(calls);
		expect(await listShots(keys.jobId)).toHaveLength(1);
	});

	it('a revoke ends the server path but keeps the unsent photos', async () => {
		const mail = fakeMailbox();
		const camera = await started(mail);
		const pc = await computer(hub, keys, keys.jobId);
		await until(() => expect(pc.count('hello')).toBe(1));
		await camera.addShot(0, 'corner:A', await image('rev'));
		await until(() => expect(camera.status.uploaded).toBe(1));
		await pc.send({ frame: { t: 'revoked' } });
		await until(() => expect(camera.status.revoked).toBe(true));
		const calls = mail.fetcher.mock.calls.length;
		await camera.addShot(0, 'corner:B', await image('rev2')).catch(() => {});
		await tick(150);
		expect(mail.fetcher.mock.calls.length).toBe(calls);
		expect(await listShots(keys.jobId)).not.toHaveLength(0);
	});

	it('an expiring job ends the server path', async () => {
		const mail = fakeMailbox();
		await saveCameraPart(token, {
			v: 1,
			project: 'Wohnung',
			lang: 'de',
			expiresAt: Date.now() + 250,
			server: true,
			part: 0,
			parts: 1,
			rooms: []
		});
		const camera = session({ ...fast, mailbox: mail.env });
		run(camera);
		await until(() => expect(camera.status.server).toBe('ok'));
		await until(() => expect(camera.status.expired).toBe(true));
		await tick(30);
		const calls = mail.fetcher.mock.calls.length;
		await camera.addShot(0, 'corner:A', await image('late'));
		await tick(150);
		expect(mail.fetcher.mock.calls.length).toBe(calls);
		expect(camera.shots).toHaveLength(1);
	});
});

describe('CameraSession storage and clock', () => {
	it('does not show a photo that could not be stored', async () => {
		await makeJob();
		const camera = session();
		run(camera);
		await until(() => expect(camera.status.status).toBe('searching'));
		const put = vi.spyOn(db.mirrorShots, 'put').mockRejectedValueOnce(new Error('quota'));
		await expect(camera.addShot(0, 'corner:A', await image('q'))).rejects.toThrow('quota');
		put.mockRestore();
		expect(camera.shots).toEqual([]);
		expect(camera.status.pending).toBe(0);
		expect(await listShots(keys.jobId)).toEqual([]);
	});

	it('gives every photo a later time than the one before, even with a frozen or reset clock', async () => {
		await makeJob();
		let now = 1_800_000_000_000;
		const camera = session({ now: () => now });
		const a = await camera.addShot(0, 'corner:A', await image('c1'));
		const b = await camera.addShot(0, 'corner:A', await image('c2'));
		now -= 3_600_000;
		const c = await camera.addShot(0, 'corner:A', await image('c3'));
		const times = [a, b, c].map((shot) => Date.parse(shot.takenAt));
		expect(times[1]).toBeGreaterThan(times[0]);
		expect(times[2]).toBeGreaterThan(times[1]);
	});

	it('refuses a photo over the limit without storing it', async () => {
		await makeJob();
		const camera = session();
		const filler = await image('fill');
		camera.shots = Array.from({ length: MAX_SHOTS_PER_JOB }, (_, i) => ({
			id: `x${i}`,
			jobId: keys.jobId,
			room: 0,
			stepKey: 'corner:A',
			hash: `${i}`,
			blob: filler.blob,
			thumbnail: filler.thumbnail,
			w: 1,
			h: 1,
			takenAt: '2026-01-01T00:00:00.000Z'
		}));
		await expect(camera.addShot(0, 'corner:A', await image('over'))).rejects.toMatchObject({
			code: 'limit'
		});
		expect(await listShots(keys.jobId)).toEqual([]);
	});
});

describe('CameraSession acknowledgements', () => {
	async function connected(shotTag: string) {
		await makeJob();
		const camera = session({ ackTimeoutMs: 400, retryLaterMs: 80 });
		const shot = await camera.addShot(0, 'corner:A', await image(shotTag));
		run(camera);
		const pc = await computer(hub, keys, keys.jobId);
		await until(() => expect(pc.count('hello')).toBe(1));
		await pc.send({ frame: { t: 'state', received: [] } });
		await until(() => expect(pc.count('photo')).toBe(1));
		return { camera, pc, shot };
	}

	it('ignores an acknowledgement for a different photo', async () => {
		const { camera, pc, shot } = await connected('ackwrong');
		await pc.send({ frame: { t: 'ack', hash: 'e'.repeat(64), ok: true } });
		await tick(60);
		expect(camera.shots.map((s) => s.id)).toEqual([shot.id]);
		expect(camera.status.sent).toBe(0);
	});

	it('ignores an acknowledgement from a computer that is not the active one', async () => {
		const { camera, pc, shot } = await connected('ackother');
		const phoneId = pc.phone();
		const second = await computer(hub, keys, keys.jobId);
		await tick(60);
		const ack = await sealMessage(keys.key, keys.jobId, {
			frame: { t: 'ack', hash: shot.hash, ok: true }
		});
		await second.transport.send(ack, phoneId);
		await tick(60);
		expect(camera.shots.map((s) => s.id)).toEqual([shot.id]);
		await pc.transport.send(ack, phoneId);
		await until(() => expect(camera.shots).toEqual([]));
	});

	it('keeps the photo after a refused acknowledgement and marks it failed once', async () => {
		const { camera, pc, shot } = await connected('ackinvalid');
		await pc.send({ frame: { t: 'ack', hash: shot.hash, ok: false, reason: 'invalid' } });
		await until(() => expect(camera.status.failed).toEqual([shot.id]));
		expect(camera.shots).toHaveLength(1);
		expect(await listShots(keys.jobId)).toHaveLength(1);
	});

	it('counts a duplicate acknowledgement as delivered and deletes the photo', async () => {
		const { camera, pc, shot } = await connected('ackdup');
		await pc.send({ frame: { t: 'ack', hash: shot.hash, ok: true, duplicate: true } });
		await until(() => expect(camera.shots).toEqual([]));
		expect(camera.status.sent).toBe(1);
		expect(await listShots(keys.jobId)).toEqual([]);
	});

	it('repeats a replayed acknowledgement without harm', async () => {
		const { camera, pc, shot } = await connected('ackreplay');
		await pc.send({ frame: { t: 'ack', hash: shot.hash, ok: true } });
		await until(() => expect(camera.shots).toEqual([]));
		await pc.send({ frame: { t: 'ack', hash: shot.hash, ok: true } });
		await tick(50);
		expect(camera.status.sent).toBe(1);
	});

	it('does not delete a photo when the computer lists an unknown hash as received', async () => {
		await makeJob();
		const camera = session();
		await camera.addShot(0, 'corner:A', await image('keepme'));
		run(camera);
		const pc = await computer(hub, keys, keys.jobId);
		await until(() => expect(pc.count('hello')).toBe(1));
		await pc.send({ frame: { t: 'state', received: ['d'.repeat(64)] } });
		await until(() => expect(pc.count('photo')).toBe(1));
		expect(camera.shots).toHaveLength(1);
	});
});
