import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleProject } from '#lib/core/fixtures.ts';
import { sha256Hex } from '#lib/features/photos/hash.ts';
import type { ProcessedImage } from '#lib/features/photos/image.ts';
import type { Reencode } from '#lib/features/photos/reencode.ts';
import { minimalJpeg, svgImage } from '#lib/features/photos/testImages.ts';
import { db } from '#lib/state/db.ts';
import { store } from '#lib/state/project.svelte.ts';
import { CameraSession } from './camera.svelte.ts';
import { FakeHub, type FakePeer } from './fakeTransport.ts';
import { openMessage, sealMessage, type Frame } from './frames.ts';
import { MirrorHost } from './host.svelte.ts';
import { createHostJob } from './job.ts';
import { getJob, saveHostJob } from './jobs.ts';
import { deriveKeys, newToken } from './token.ts';
import type { CameraJob, HostJob, Shot } from './types.ts';

const phoneState = vi.hoisted(() => ({
	jobs: new Map<string, unknown>(),
	shots: new Map<string, unknown>()
}));

vi.mock('./jobs.ts', async (original) => {
	const real = await original<typeof import('./jobs.ts')>();
	return {
		...real,
		getJob: async (id: string) =>
			(phoneState.jobs.get(id) as CameraJob | undefined) ?? real.getJob(id),
		listShots: async (jobId: string) =>
			[...phoneState.shots.values()].filter((shot) => (shot as Shot).jobId === jobId) as Shot[],
		addShot: async (shot: Shot) => void phoneState.shots.set(shot.id, shot),
		deleteShot: async (id: string) => void phoneState.shots.delete(id),
		markCameraRevoked: async (id: string, now: number) => {
			const job = phoneState.jobs.get(id) as CameraJob | undefined;
			if (job) job.revokedAt = now;
		}
	};
});

const reencode: Reencode = async (bytes) => ({
	hash: await sha256Hex(new Uint8Array(bytes).reverse()),
	blob: new Blob([bytes as BlobPart]),
	thumbnail: new Blob([new Uint8Array(1)]),
	w: 64,
	h: 48
});

vi.setConfig({ testTimeout: 30_000 });

const until = (check: () => void) => vi.waitFor(check, { timeout: 20_000, interval: 10 });
const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const jpeg = (tag: string) => new Uint8Array(minimalJpeg(64, 48, tag));
const photos = () => store.room('room-rect')?.photos.length ?? 0;

async function image(tag: string): Promise<ProcessedImage> {
	const bytes = jpeg(tag);
	return {
		hash: await sha256Hex(bytes),
		blob: new Blob([bytes], { type: 'image/jpeg' }),
		thumbnail: new Blob([new Uint8Array(1)]),
		w: 64,
		h: 48
	};
}

async function hostJob(expiresInMs?: number): Promise<HostJob> {
	const project = store.project;
	if (!project) throw new Error('no project');
	const job = await createHostJob(project, ['room-rect'], 'https://app.test/');
	if (expiresInMs !== undefined) job.expiresAt = Date.now() + expiresInMs;
	await saveHostJob(job);
	return job;
}

function cameraJobFor(job: HostJob): CameraJob {
	const camera: CameraJob = {
		id: job.id,
		role: 'camera',
		token: job.token,
		project: 'Wohnung',
		lang: 'de',
		createdAt: Date.now(),
		expiresAt: job.expiresAt,
		parts: 1,
		partsSeen: [0],
		rooms: []
	};
	phoneState.jobs.set(job.id, camera);
	return camera;
}

interface Phone {
	transport: FakePeer;
	inbox: Frame[];
	hostPeer: () => string;
	send: (frame: Frame, body?: Uint8Array<ArrayBuffer>) => Promise<void>;
}

async function handPhone(hub: FakeHub, job: HostJob, token = job.token): Promise<Phone> {
	const keys = await deriveKeys(token);
	const transport = (await hub.open({
		topic: (await deriveKeys(job.token)).topic,
		password: (await deriveKeys(job.token)).password
	})) as FakePeer;
	const inbox: Frame[] = [];
	let host = '';
	transport.onPeerJoin((peer) => (host = peer));
	transport.onData(async (data) => {
		const message = await openMessage(keys.key, job.id, data);
		if (message) inbox.push(message.frame);
	});
	return {
		transport,
		inbox,
		hostPeer: () => host,
		send: async (frame, body) => {
			const sealed = await sealMessage(keys.key, job.id, { frame, ...(body ? { body } : {}) });
			await transport.send(sealed, host);
		}
	};
}

async function shotInfo(bytes: Uint8Array<ArrayBuffer>, stepKey = 'corner:A') {
	return {
		hash: await sha256Hex(bytes),
		room: 0,
		stepKey,
		takenAt: '2026-01-01T00:00:00.000Z',
		size: bytes.byteLength
	};
}

let hub: FakeHub;
let host: MirrorHost;
const cleanup: (() => void)[] = [];

function startHost(): void {
	cleanup.push(host.start('project-1'));
}

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
	phoneState.jobs.clear();
	phoneState.shots.clear();
	store.replace(sampleProject());
	store.readOnly = false;
	hub = new FakeHub();
	host = new MirrorHost({ open: hub.open, reencode, appUrl: () => 'https://app.test/' });
});

afterEach(async () => {
	for (const stop of cleanup.splice(0)) stop();
	await tick(10);
});

describe('MirrorHost connection rules', () => {
	it('opens nothing without open jobs', async () => {
		const open = vi.fn(hub.open);
		host = new MirrorHost({ open, reencode });
		startHost();
		await tick();
		expect(open).not.toHaveBeenCalled();
		expect(host.jobs).toEqual([]);
	});

	it('opens nothing in a read-only tab', async () => {
		await hostJob();
		store.readOnly = true;
		const open = vi.fn(hub.open);
		host = new MirrorHost({ open, reencode });
		startHost();
		await until(() => expect(host.jobs).toHaveLength(1));
		await tick();
		expect(open).not.toHaveBeenCalled();
	});

	it('create() stores the job, connects and the stop function closes it', async () => {
		const created = await host.create(['room-rect']);
		expect(await getJob(created.id)).toBeDefined();
		await until(() => expect(host.status(created.id).status).toBe('searching'));
		expect(hub.peers()).toHaveLength(1);
		cleanup.push(host.start('project-1'));
		await until(() => expect(host.jobs).toHaveLength(1));
		await until(() => expect(hub.peers()).toHaveLength(1));
		cleanup.pop()?.();
		await until(() => expect(hub.peers()).toHaveLength(0));
		expect(host.jobs).toEqual([]);
	});
});

describe('MirrorHost messages', () => {
	it('answers hello with state, places photos serially and acknowledges them', async () => {
		const job = await hostJob();
		startHost();
		const phone = await handPhone(hub, job);
		await until(() => expect(phone.hostPeer()).not.toBe(''));
		const first = jpeg('one');
		const second = jpeg('two');
		const infos = [await shotInfo(first), await shotInfo(second, 'corner:B')];
		await phone.send({ t: 'hello', pending: infos });
		await until(() => expect(phone.inbox).toEqual([{ t: 'state', received: [] }]));
		expect(host.status(job.id)).toMatchObject({ status: 'connected', peers: 1, expected: 2 });

		const before = photos();
		await phone.send({ t: 'photo', shot: infos[0] }, first);
		await phone.send({ t: 'photo', shot: infos[1] }, second);
		await until(() => expect(phone.inbox.filter((frame) => frame.t === 'ack')).toHaveLength(2));
		expect(phone.inbox.slice(1)).toEqual([
			{ t: 'ack', hash: infos[0].hash, ok: true },
			{ t: 'ack', hash: infos[1].hash, ok: true }
		]);
		expect(photos()).toBe(before + 2);
		expect(host.status(job.id)).toMatchObject({ received: 2, expected: 0 });
	});

	it('reports duplicates and lists known photos in state', async () => {
		const job = await hostJob();
		startHost();
		const phone = await handPhone(hub, job);
		await until(() => expect(phone.hostPeer()).not.toBe(''));
		const bytes = jpeg('dup');
		const info = await shotInfo(bytes);
		await phone.send({ t: 'hello', pending: [info] });
		await phone.send({ t: 'photo', shot: info }, bytes);
		await until(() => expect(phone.inbox).toHaveLength(2));
		await phone.send({ t: 'photo', shot: info }, bytes);
		await phone.send({ t: 'hello', pending: [info] });
		await until(() => expect(phone.inbox).toHaveLength(4));
		const count = photos();
		expect(phone.inbox[2]).toEqual({ t: 'ack', hash: info.hash, ok: true, duplicate: true });
		expect(phone.inbox[3]).toEqual({ t: 'state', received: [info.hash] });
		expect(photos()).toBe(count);
	});

	it('rejects bad photos with a reason and keeps working', async () => {
		const job = await hostJob();
		startHost();
		const phone = await handPhone(hub, job);
		await until(() => expect(phone.hostPeer()).not.toBe(''));
		const svg = new Uint8Array(svgImage());
		const info = await shotInfo(svg);
		await phone.send({ t: 'hello', pending: [info] });
		await phone.send({ t: 'photo', shot: info }, svg);
		const stranger = await shotInfo(jpeg('x'));
		await phone.send({ t: 'photo', shot: { ...stranger, room: 9 } }, jpeg('x'));
		await until(() => expect(phone.inbox).toHaveLength(3));
		expect(phone.inbox[1]).toEqual({ t: 'ack', hash: info.hash, ok: false, reason: 'invalid' });
		expect(phone.inbox[2]).toEqual({
			t: 'ack',
			hash: stranger.hash,
			ok: false,
			reason: 'unknownRoom'
		});
	});

	it('asks the phone to retry later in a read-only tab', async () => {
		const job = await hostJob();
		startHost();
		const phone = await handPhone(hub, job);
		await until(() => expect(phone.hostPeer()).not.toBe(''));
		const bytes = jpeg('ro');
		const info = await shotInfo(bytes);
		await phone.send({ t: 'hello', pending: [info] });
		await until(() => expect(phone.inbox).toHaveLength(1));
		store.readOnly = true;
		await phone.send({ t: 'photo', shot: info }, bytes);
		await until(() => expect(phone.inbox).toHaveLength(2));
		expect(phone.inbox[1]).toEqual({ t: 'ack', hash: info.hash, ok: false, reason: 'readOnly' });
	});

	it('ignores peers that do not hold the key and garbage', async () => {
		const job = await hostJob();
		startHost();
		const stranger = await handPhone(hub, job, newToken());
		await until(() => expect(stranger.hostPeer()).not.toBe(''));
		const bytes = jpeg('s');
		await stranger.send({ t: 'hello', pending: [await shotInfo(bytes)] });
		await stranger.transport.send(new Uint8Array(64).fill(7), stranger.hostPeer());
		await stranger.transport.send(new Uint8Array(3), stranger.hostPeer());
		await tick(100);
		expect(stranger.inbox).toEqual([]);
		expect(host.status(job.id)).toMatchObject({ status: 'searching', peers: 0 });
		const before = photos();
		const info = await shotInfo(bytes);
		await stranger.send({ t: 'photo', shot: info }, bytes);
		await tick(50);
		expect(photos()).toBe(before);
	});

	it('does not accept a photo before hello', async () => {
		const job = await hostJob();
		startHost();
		const phone = await handPhone(hub, job);
		await until(() => expect(phone.hostPeer()).not.toBe(''));
		const bytes = jpeg('early');
		const before = photos();
		await phone.send({ t: 'photo', shot: await shotInfo(bytes) }, bytes);
		await tick(80);
		expect(phone.inbox).toEqual([]);
		expect(photos()).toBe(before);
	});
});

describe('MirrorHost job end', () => {
	it('revoke tells the phone, leaves and deletes the job', async () => {
		const job = await hostJob();
		startHost();
		const phone = await handPhone(hub, job);
		await until(() => expect(phone.hostPeer()).not.toBe(''));
		await phone.send({ t: 'hello', pending: [] });
		await until(() => expect(phone.inbox).toHaveLength(1));
		await host.revoke(job.id);
		await until(() => expect(phone.inbox).toContainEqual({ t: 'revoked' }));
		expect(await getJob(job.id)).toBeUndefined();
		expect(host.jobs).toEqual([]);
		expect(hub.peers()).toEqual([phone.transport.id]);
	});

	it('revoke works for a job that has no connection', async () => {
		const job = await hostJob();
		await host.revoke(job.id);
		expect(await getJob(job.id)).toBeUndefined();
	});

	it('an expiring job ends the session', async () => {
		const job = await hostJob(150);
		startHost();
		const phone = await handPhone(hub, job);
		await until(() => expect(phone.hostPeer()).not.toBe(''));
		await phone.send({ t: 'hello', pending: [] });
		await until(() => expect(phone.inbox).toHaveLength(1));
		await until(() => expect(host.status(job.id).status).toBe('ended'));
		expect(hub.peers()).toEqual([phone.transport.id]);
		await phone.send({ t: 'hello', pending: [] }).catch(() => {});
		await tick(50);
		expect(phone.inbox).toHaveLength(1);
	});

	it('does not connect to an expired job', async () => {
		await hostJob(-1000);
		const open = vi.fn(hub.open);
		host = new MirrorHost({ open, reencode });
		startHost();
		await tick(60);
		expect(open).not.toHaveBeenCalled();
	});
});

describe('MirrorHost.importShot', () => {
	it('places a file from the fallback path and reports duplicates', async () => {
		const job = await hostJob();
		startHost();
		await until(() => expect(host.jobs).toHaveLength(1));
		const tag = { jobId: job.id, room: 0, stepKey: 'corner:A' };
		const before = photos();
		expect(await host.importShot(tag, jpeg('file'))).toEqual({ ok: true, duplicate: false });
		expect(await host.importShot(tag, jpeg('file'))).toEqual({ ok: true, duplicate: true });
		expect(photos()).toBe(before + 1);
		expect(host.status(job.id).received).toBe(1);
	});

	it('knows only jobs of this computer', async () => {
		await hostJob();
		startHost();
		await until(() => expect(host.jobs).toHaveLength(1));
		const tag = { jobId: 'nope', room: 0, stepKey: 'corner:A' };
		expect(await host.importShot(tag, jpeg('x'))).toEqual({ ok: false, reason: 'unknownJob' });
	});
});

describe('phone to computer', () => {
	function phone(job: HostJob, options = {}): CameraSession {
		cameraJobFor(job);
		return new CameraSession(job.id, hub.open, {
			ackTimeoutMs: 300,
			retryLaterMs: 60,
			fallbackAfterMs: 5000,
			...options
		});
	}

	it('transfers all photos and clears the phone', async () => {
		const job = await hostJob();
		startHost();
		const camera = phone(job);
		cleanup.push(camera.start());
		await until(() => expect(camera.status.status).toBe('connected'));
		const before = photos();
		await camera.addShot(0, 'corner:A', await image('a'));
		await camera.addShot(0, 'corner:B', await image('b'));
		await camera.addShot(0, 'wall:1', await image('c'));
		await until(() => expect(host.status(job.id).received).toBe(3));
		await until(() => expect(camera.shots).toHaveLength(0));
		expect(photos()).toBe(before + 3);
		expect(camera.status).toMatchObject({ sent: 3, total: 3, pending: 0, failed: [] });
		expect(host.status(job.id).peers).toBe(1);
		expect(phoneState.shots.size).toBe(0);
	});

	it('sends photos taken before the connection, and a repeat counts as duplicate', async () => {
		const job = await hostJob();
		const camera = phone(job);
		await camera.addShot(0, 'corner:A', await image('same'));
		await camera.addShot(0, 'corner:B', await image('other'));
		startHost();
		cleanup.push(camera.start());
		await until(() => expect(host.status(job.id).received).toBe(2));
		await until(() => expect(camera.shots).toHaveLength(0));
		const count = photos();
		await camera.addShot(0, 'corner:A', await image('same'));
		await until(() => expect(camera.shots).toHaveLength(0));
		expect(photos()).toBe(count);
		expect(host.status(job.id).received).toBe(2);
	});

	it('resumes after the connection drops in the middle of the transfer', async () => {
		const job = await hostJob();
		const camera = phone(job);
		for (const tag of ['r1', 'r2', 'r3']) await camera.addShot(0, 'corner:A', await image(tag));
		startHost();
		await until(() => expect(host.status(job.id).status).toBe('searching'));
		let fromPhone = 0;
		let severed = false;
		hub.tap((from) => {
			if (from === hub.peers()[1] && ++fromPhone === 3) {
				severed = true;
				hub.sever(from);
			}
		});
		const before = photos();
		cleanup.push(camera.start());
		await until(() => expect(severed).toBe(true));
		await until(() => expect(camera.status.status).toBe('searching'));
		expect(camera.shots.length).toBeGreaterThan(0);
		await until(() => expect(photos()).toBe(before + 1));
		hub.heal(hub.peers()[1]);
		await until(() => expect(camera.shots).toHaveLength(0));
		expect(photos()).toBe(before + 3);
		expect(host.status(job.id).received).toBe(3);
	});

	it('keeps photos while the tab is read-only and sends them when it can write again', async () => {
		const job = await hostJob();
		const camera = phone(job);
		await camera.addShot(0, 'corner:A', await image('w1'));
		startHost();
		await until(() => expect(host.status(job.id).status).toBe('searching'));
		store.readOnly = true;
		cleanup.push(camera.start());
		await until(() => expect(camera.status.status).toBe('connected'));
		await tick(100);
		expect(camera.shots).toHaveLength(1);
		expect(camera.status.failed).toEqual([]);
		store.readOnly = false;
		await until(() => expect(camera.shots).toHaveLength(0));
		expect(host.status(job.id).received).toBe(1);
	});

	it('shows the revoke on the phone and stops sending', async () => {
		const job = await hostJob();
		startHost();
		const camera = phone(job);
		cleanup.push(camera.start());
		await until(() => expect(camera.status.status).toBe('connected'));
		await host.revoke(job.id);
		await until(() => expect(camera.status.revoked).toBe(true));
		expect((phoneState.jobs.get(job.id) as CameraJob).revokedAt).toBeTypeOf('number');
		expect(camera.status.status).toBe('ended');
		expect(hub.peers()).toEqual([]);
	});
});
