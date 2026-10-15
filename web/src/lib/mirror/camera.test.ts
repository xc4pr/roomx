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
import type { OpenTransport } from './types.ts';

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
