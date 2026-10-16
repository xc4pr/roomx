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
import { createHostJob, parsePair } from './job.ts';
import { mailboxHash } from './mailbox.ts';
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

async function serverJob(): Promise<HostJob> {
	const job = await hostJob();
	job.server = true;
	await saveHostJob(job);
	return job;
}

async function sealedPhoto(job: HostJob, bytes: Uint8Array<ArrayBuffer>, stepKey = 'corner:A') {
	const keys = await deriveKeys(job.token);
	const sealed = await sealMessage(keys.key, job.id, {
		frame: { t: 'photo', shot: await shotInfo(bytes, stepKey) },
		body: bytes
	});
	return { sealed, id: await sha256Hex(sealed) };
}

describe('MirrorHost mailbox', () => {
	it('registers a new job and builds server links', async () => {
		const mail = fakeMailbox();
		host = new MirrorHost({
			open: hub.open,
			reencode,
			appUrl: () => 'https://srv.test/',
			mailbox: mail.env
		});
		const job = await host.create(['room-rect']);
		expect(job.server).toBe(true);
		const put = mail.state.calls[0];
		expect(put).toMatchObject({ method: 'PUT', path: `/api/mirror/${job.id}` });
		expect(put.headers.get('Authorization')).toBe('Bearer sync-token');
		const keys = await deriveKeys(job.token);
		expect(JSON.parse(String(put.body))).toEqual({
			mailbox: await mailboxHash(keys.mailbox),
			expiresAt: job.expiresAt
		});
		const parsed = parsePair(job.links[0].slice(job.links[0].indexOf('#')));
		expect(parsed.ok && parsed.payload.server).toBe(true);
	});

	it('keeps the job but turns the server path off when registering fails', async () => {
		const mail = fakeMailbox();
		mail.state.registerStatus = 500;
		host = new MirrorHost({
			open: hub.open,
			reencode,
			appUrl: () => 'https://srv.test/',
			mailbox: mail.env
		});
		const job = await host.create(['room-rect']);
		expect(job.server).toBe(false);
		const stored = await getJob(job.id);
		expect(stored?.role === 'host' && stored.server).toBe(false);
	});

	it('never asks the server in the free edition', async () => {
		const mail = fakeMailbox();
		host = new MirrorHost({
			open: hub.open,
			reencode,
			appUrl: () => 'https://srv.test/',
			mailbox: { ...mail.env, free: true },
			pollMs: 20
		});
		const job = await host.create(['room-rect']);
		expect(job.server).toBeUndefined();
		startHost();
		await tick(120);
		await host.revoke(job.id);
		expect(mail.fetcher).not.toHaveBeenCalled();
	});

	it('fetches photos, places them and discards them on the server', async () => {
		const mail = fakeMailbox();
		const job = await serverJob();
		const bytes = jpeg('mail');
		const { sealed, id } = await sealedPhoto(job, bytes);
		mail.state.shots.set(id, sealed);
		host = new MirrorHost({ open: hub.open, reencode, mailbox: mail.env, pollMs: 30 });
		const before = photos();
		startHost();
		await until(() => expect(photos()).toBe(before + 1));
		await until(() => expect(mail.state.placed).toEqual([id]));
		expect(mail.state.shots.size).toBe(0);
		expect(host.status(job.id).received).toBe(1);
	});

	it('counts a photo that came by relay and by server once', async () => {
		const mail = fakeMailbox();
		const job = await serverJob();
		host = new MirrorHost({ open: hub.open, reencode, mailbox: mail.env, pollMs: 30 });
		startHost();
		const phone = await handPhone(hub, job);
		await until(() => expect(phone.hostPeer()).not.toBe(''));
		const bytes = jpeg('both');
		const info = await shotInfo(bytes);
		await phone.send({ t: 'hello', pending: [info] });
		await phone.send({ t: 'photo', shot: info }, bytes);
		await until(() => expect(phone.inbox).toHaveLength(2));
		const count = photos();
		const { sealed, id } = await sealedPhoto(job, bytes);
		mail.state.shots.set(id, sealed);
		await until(() => expect(mail.state.placed).toEqual([id]));
		expect(photos()).toBe(count);
	});

	it('leaves invalid photos alone and does not fetch them again', async () => {
		const mail = fakeMailbox();
		const job = await serverJob();
		const svg = new Uint8Array(svgImage());
		const { sealed, id } = await sealedPhoto(job, svg);
		mail.state.shots.set(id, sealed);
		const noise = new Uint8Array(80).fill(5);
		const noiseId = await sha256Hex(noise);
		mail.state.shots.set(noiseId, noise);
		host = new MirrorHost({ open: hub.open, reencode, mailbox: mail.env, pollMs: 25 });
		startHost();
		await until(() => expect(mail.count('GET', `/shots/${id}`)).toBe(1));
		await tick(200);
		expect(mail.count('GET', `/shots/${id}`)).toBe(1);
		expect(mail.count('GET', `/shots/${noiseId}`)).toBe(1);
		expect(mail.count('DELETE', '/shots/')).toBe(0);
		expect(mail.state.shots.size).toBe(2);
	});

	it('tries again after read-only and storage failures', async () => {
		const mail = fakeMailbox();
		const job = await serverJob();
		const { sealed, id } = await sealedPhoto(job, jpeg('later'));
		mail.state.shots.set(id, sealed);
		host = new MirrorHost({ open: hub.open, reencode, mailbox: mail.env, pollMs: 25 });
		startHost();
		await until(() => expect(host.jobs).toHaveLength(1));
		store.readOnly = true;
		await tick(120);
		expect(mail.count('GET', '/shots')).toBe(0);
		store.readOnly = false;
		await until(() => expect(mail.state.placed).toEqual([id]));
	});

	it('stops asking for a job the server reports gone', async () => {
		const mail = fakeMailbox();
		mail.state.status = 410;
		await serverJob();
		host = new MirrorHost({ open: hub.open, reencode, mailbox: mail.env, pollMs: 25 });
		startHost();
		await until(() => expect(mail.fetcher).toHaveBeenCalledTimes(1));
		await tick(150);
		expect(mail.fetcher).toHaveBeenCalledTimes(1);
	});

	it('does not fetch without an open project', async () => {
		const mail = fakeMailbox();
		await serverJob();
		host = new MirrorHost({ open: hub.open, reencode, mailbox: mail.env, pollMs: 25 });
		startHost();
		await until(() => expect(host.jobs).toHaveLength(1));
		cleanup.pop()?.();
		await tick(120);
		expect(mail.fetcher).not.toHaveBeenCalled();
	});

	it('revoke removes the mailbox', async () => {
		const mail = fakeMailbox();
		host = new MirrorHost({
			open: hub.open,
			reencode,
			appUrl: () => 'https://srv.test/',
			mailbox: mail.env
		});
		const job = await host.create(['room-rect']);
		await host.revoke(job.id);
		expect(mail.count('DELETE', `/api/mirror/${job.id}`)).toBe(1);
		expect(mail.state.calls.at(-1)?.headers.get('Authorization')).toBe('Bearer sync-token');
	});
});

describe('MirrorHost.importShot edges', () => {
	it('refuses revoked and expired jobs, also when they only exist in the database', async () => {
		const revoked = await hostJob();
		await saveHostJob({ ...revoked, revokedAt: Date.now() });
		const expired = await hostJob(-1000);
		const tag = (jobId: string) => ({ jobId, room: 0, stepKey: 'corner:A' });
		const before = photos();
		expect(await host.importShot(tag(revoked.id), jpeg('r'))).toEqual({
			ok: false,
			reason: 'unknownJob'
		});
		expect(await host.importShot(tag(expired.id), jpeg('e'))).toEqual({
			ok: false,
			reason: 'unknownJob'
		});
		expect(photos()).toBe(before);
	});

	it('uses the clock of the host to decide about expiry', async () => {
		const job = await hostJob(60_000);
		let now = Date.now();
		host = new MirrorHost({ open: hub.open, reencode, now: () => now });
		const tag = { jobId: job.id, room: 0, stepKey: 'corner:A' };
		expect(await host.importShot(tag, jpeg('t1'))).toEqual({ ok: true, duplicate: false });
		now = job.expiresAt;
		expect(await host.importShot(tag, jpeg('t2'))).toEqual({ ok: false, reason: 'unknownJob' });
	});

	it('does not take a phone job from the database as a host job', async () => {
		const job = await hostJob();
		await db.mirrorJobs.put({
			id: job.id,
			role: 'camera',
			token: job.token,
			project: 'x',
			lang: 'de',
			createdAt: 1,
			expiresAt: Date.now() + 60_000,
			parts: 1,
			partsSeen: [0],
			rooms: []
		});
		const tag = { jobId: job.id, room: 0, stepKey: 'corner:A' };
		expect(await host.importShot(tag, jpeg('c'))).toEqual({ ok: false, reason: 'unknownJob' });
	});

	it('refuses a job of another project and a read-only tab', async () => {
		const job = await hostJob();
		await saveHostJob({ ...job, projectId: 'other' });
		const tag = { jobId: job.id, room: 0, stepKey: 'corner:A' };
		expect(await host.importShot(tag, jpeg('o'))).toEqual({ ok: false, reason: 'unknownJob' });
		await saveHostJob(job);
		store.readOnly = true;
		const before = photos();
		expect(await host.importShot(tag, jpeg('o'))).toEqual({ ok: false, reason: 'readOnly' });
		expect(photos()).toBe(before);
	});

	it('answers invalid photos without throwing and keeps working', async () => {
		const job = await hostJob();
		const tag = { jobId: job.id, room: 0, stepKey: 'corner:A' };
		expect(await host.importShot(tag, new Uint8Array(svgImage()))).toEqual({
			ok: false,
			reason: 'invalid'
		});
		expect(await host.importShot(tag, jpeg('fine'))).toEqual({ ok: true, duplicate: false });
	});

	it('places two imports of the same file at the same time only once', async () => {
		const job = await hostJob();
		startHost();
		await until(() => expect(host.jobs).toHaveLength(1));
		const tag = { jobId: job.id, room: 0, stepKey: 'corner:A' };
		const before = photos();
		const results = await Promise.all([
			host.importShot(tag, jpeg('same')),
			host.importShot(tag, jpeg('same'))
		]);
		expect(results.filter((r) => r.ok && !r.duplicate)).toHaveLength(1);
		expect(results.filter((r) => r.ok && r.duplicate)).toHaveLength(1);
		expect(photos()).toBe(before + 1);
	});

	it('also places a file once when two imports run before the host loaded its jobs', async () => {
		const job = await hostJob();
		const tag = { jobId: job.id, room: 0, stepKey: 'corner:A' };
		const before = photos();
		await Promise.all([host.importShot(tag, jpeg('same2')), host.importShot(tag, jpeg('same2'))]);
		expect(photos()).toBe(before + 1);
	});
});

describe('MirrorHost creation edges', () => {
	it('refuses to create a job without an open project', async () => {
		await store.close();
		await expect(new MirrorHost({ open: hub.open }).create(['room-rect'])).rejects.toThrow(
			'no project open'
		);
	});

	it('stores the job in a read-only tab but does not connect', async () => {
		store.readOnly = true;
		const open = vi.fn(hub.open);
		host = new MirrorHost({ open, reencode, appUrl: () => 'https://app.test/' });
		const job = await host.create(['room-rect']);
		await tick(60);
		expect(await getJob(job.id)).toBeDefined();
		expect(open).not.toHaveBeenCalled();
		expect(host.status(job.id).status).toBe('idle');
	});

	it('keeps the job without server path when the server cannot be reached', async () => {
		const mail = fakeMailbox();
		mail.state.offline = true;
		host = new MirrorHost({
			open: hub.open,
			reencode,
			appUrl: () => 'https://srv.test/',
			mailbox: mail.env
		});
		const job = await host.create(['room-rect']);
		expect(job.server).toBe(false);
		expect(parsePair(job.links[0].slice(job.links[0].indexOf('#')))).toMatchObject({ ok: true });
	});

	it('a stale stop function does not end a newer start', async () => {
		const job = await hostJob();
		const stopFirst = host.start('project-1');
		cleanup.push(host.start('project-1'));
		await until(() => expect(host.status(job.id).status).toBe('searching'));
		stopFirst();
		await tick(60);
		expect(host.status(job.id).status).toBe('searching');
		expect(hub.peers()).toHaveLength(1);
	});

	it('survives a transport that cannot be opened', async () => {
		await hostJob();
		const open = vi.fn(async () => {
			throw new Error('no relay');
		});
		host = new MirrorHost({ open, reencode });
		startHost();
		await until(() => expect(open).toHaveBeenCalledTimes(1));
		await until(() => expect(host.jobs).toHaveLength(1));
		expect(host.jobs[0].received).toEqual([]);
	});
});

describe('MirrorHost frames', () => {
	it('tells the phone when the host project changed under a transfer', async () => {
		const job = await hostJob();
		startHost();
		const phone = await handPhone(hub, job);
		await until(() => expect(phone.hostPeer()).not.toBe(''));
		const bytes = jpeg('sw');
		const info = await shotInfo(bytes);
		await phone.send({ t: 'hello', pending: [info] });
		await until(() => expect(phone.inbox).toHaveLength(1));
		const other = sampleProject();
		other.id = 'project-2';
		store.replace(other);
		await phone.send({ t: 'photo', shot: info }, bytes);
		await until(() => expect(phone.inbox).toHaveLength(2));
		expect(phone.inbox[1]).toEqual({ t: 'ack', hash: info.hash, ok: false, reason: 'storage' });
	});

	it('forgets the pending count of a phone that leaves', async () => {
		const job = await hostJob();
		startHost();
		const phone = await handPhone(hub, job);
		await until(() => expect(phone.hostPeer()).not.toBe(''));
		await phone.send({ t: 'hello', pending: [await shotInfo(jpeg('p1'))] });
		await until(() => expect(host.status(job.id)).toMatchObject({ peers: 1, expected: 1 }));
		await phone.transport.leave();
		await until(() => expect(host.status(job.id)).toMatchObject({ peers: 0, expected: 0 }));
		expect(host.status(job.id).status).toBe('searching');
	});

	it('ignores frames after the job expired, even from a connected phone', async () => {
		const job = await hostJob(60_000);
		let now = Date.now();
		host = new MirrorHost({ open: hub.open, reencode, now: () => now });
		startHost();
		const phone = await handPhone(hub, job);
		await until(() => expect(phone.hostPeer()).not.toBe(''));
		await phone.send({ t: 'hello', pending: [] });
		await until(() => expect(phone.inbox).toHaveLength(1));
		now = job.expiresAt + 1;
		const bytes = jpeg('late');
		const before = photos();
		await phone.send({ t: 'photo', shot: await shotInfo(bytes) }, bytes);
		await phone.send({ t: 'hello', pending: [] });
		await tick(100);
		expect(phone.inbox).toHaveLength(1);
		expect(photos()).toBe(before);
	});

	it('a photo without body is not placed and gets no answer', async () => {
		const job = await hostJob();
		startHost();
		const phone = await handPhone(hub, job);
		await until(() => expect(phone.hostPeer()).not.toBe(''));
		await phone.send({ t: 'hello', pending: [] });
		await until(() => expect(phone.inbox).toHaveLength(1));
		const before = photos();
		await phone.send({ t: 'photo', shot: await shotInfo(jpeg('nb')) });
		await tick(80);
		expect(phone.inbox).toHaveLength(1);
		expect(photos()).toBe(before);
	});

	it('refuses a photo whose hash does not match the sent bytes', async () => {
		const job = await hostJob();
		startHost();
		const phone = await handPhone(hub, job);
		await until(() => expect(phone.hostPeer()).not.toBe(''));
		const bytes = jpeg('real');
		const info = { ...(await shotInfo(jpeg('claimed'))), size: bytes.byteLength };
		await phone.send({ t: 'hello', pending: [info] });
		await phone.send({ t: 'photo', shot: info }, bytes);
		await until(() => expect(phone.inbox).toHaveLength(2));
		expect(phone.inbox[1]).toEqual({ t: 'ack', hash: info.hash, ok: false, reason: 'invalid' });
		expect(host.status(job.id).received).toBe(0);
	});
});

describe('MirrorHost mailbox edges', () => {
	function mailHost(mail: ReturnType<typeof fakeMailbox>, now?: () => number): void {
		host = new MirrorHost({
			open: hub.open,
			reencode,
			mailbox: mail.env,
			pollMs: 25,
			...(now ? { now } : {})
		});
	}

	it('skips a photo that vanished from the server and takes the next one', async () => {
		const mail = fakeMailbox();
		const job = await serverJob();
		const first = await sealedPhoto(job, jpeg('v1'));
		const second = await sealedPhoto(job, jpeg('v2'), 'corner:B');
		const order = [first.id, second.id];
		mail.fetcher.mockImplementationOnce(async () =>
			Response.json(order.map((id) => ({ id, size: 1 })))
		);
		mail.state.shots.set(second.id, second.sealed);
		mailHost(mail);
		const before = photos();
		startHost();
		await until(() => expect(mail.state.placed).toEqual([second.id]));
		expect(photos()).toBe(before + 1);
	});

	it('stops the round on a network failure and keeps the photo on the server', async () => {
		const mail = fakeMailbox();
		const job = await serverJob();
		const { sealed, id } = await sealedPhoto(job, jpeg('n1'));
		mail.state.shots.set(id, sealed);
		mailHost(mail);
		mail.state.offline = true;
		const before = photos();
		startHost();
		await until(() => expect(mail.fetcher.mock.calls.length).toBeGreaterThan(1));
		expect(photos()).toBe(before);
		expect(mail.state.shots.has(id)).toBe(true);
		mail.state.offline = false;
		await until(() => expect(mail.state.placed).toEqual([id]));
	});

	it('keeps asking after an unauthorized answer, because the token may be fixed later', async () => {
		const mail = fakeMailbox();
		await serverJob();
		mail.state.status = 401;
		mailHost(mail);
		startHost();
		await until(() => expect(mail.fetcher.mock.calls.length).toBeGreaterThan(2));
	});

	it('also stops for a job the server does not know', async () => {
		const mail = fakeMailbox();
		mail.state.status = 404;
		await serverJob();
		mailHost(mail);
		startHost();
		await until(() => expect(mail.fetcher).toHaveBeenCalledTimes(1));
		await tick(150);
		expect(mail.fetcher).toHaveBeenCalledTimes(1);
	});

	it('does not discard a photo it could not place and does not look at it twice', async () => {
		const mail = fakeMailbox();
		const job = await serverJob();
		const { sealed, id } = await sealedPhoto(job, jpeg('wrongroom'), 'corner:A');
		const keys = await deriveKeys(job.token);
		const stranger = await sealMessage(keys.key, job.id, {
			frame: { t: 'photo', shot: { ...(await shotInfo(jpeg('r9'))), room: 9 } },
			body: jpeg('r9')
		});
		const strangerId = await sha256Hex(stranger);
		mail.state.shots.set(strangerId, stranger);
		mailHost(mail);
		startHost();
		await until(() => expect(mail.count('GET', `/shots/${strangerId}`)).toBe(1));
		await tick(150);
		expect(mail.count('GET', `/shots/${strangerId}`)).toBe(1);
		expect(mail.state.shots.has(strangerId)).toBe(true);
		expect(mail.count('DELETE', '/shots/')).toBe(0);
		mail.state.shots.set(id, sealed);
		await until(() => expect(mail.state.placed).toEqual([id]));
	});

	it('ignores sealed frames that are not photos', async () => {
		const mail = fakeMailbox();
		const job = await serverJob();
		const keys = await deriveKeys(job.token);
		const hello = await sealMessage(keys.key, job.id, { frame: { t: 'hello', pending: [] } });
		const bare = await sealMessage(keys.key, job.id, {
			frame: { t: 'photo', shot: await shotInfo(jpeg('bare')) }
		});
		const helloId = await sha256Hex(hello);
		const bareId = await sha256Hex(bare);
		mail.state.shots.set(helloId, hello);
		mail.state.shots.set(bareId, bare);
		mailHost(mail);
		const before = photos();
		startHost();
		await until(() => expect(mail.count('GET', `/shots/${bareId}`)).toBe(1));
		await tick(150);
		expect(mail.count('GET', `/shots/${helloId}`)).toBe(1);
		expect(mail.count('GET', `/shots/${bareId}`)).toBe(1);
		expect(photos()).toBe(before);
		expect(mail.count('DELETE', '/shots/')).toBe(0);
	});

	it('does not accept a photo sealed for another job', async () => {
		const mail = fakeMailbox();
		const job = await serverJob();
		const keys = await deriveKeys(job.token);
		const bytes = jpeg('alien');
		const sealed = await sealMessage(keys.key, 'otherjob12345', {
			frame: { t: 'photo', shot: await shotInfo(bytes) },
			body: bytes
		});
		const id = await sha256Hex(sealed);
		mail.state.shots.set(id, sealed);
		mailHost(mail);
		const before = photos();
		startHost();
		await until(() => expect(mail.count('GET', `/shots/${id}`)).toBe(1));
		await tick(100);
		expect(photos()).toBe(before);
		expect(mail.count('DELETE', '/shots/')).toBe(0);
	});

	it('does not poll a job that expired or whose project is not open', async () => {
		const mail = fakeMailbox();
		const job = await serverJob();
		let now = Date.now();
		mailHost(mail, () => now);
		startHost();
		await until(() => expect(mail.fetcher).toHaveBeenCalled());
		const calls = mail.fetcher.mock.calls.length;
		now = job.expiresAt + 1;
		await tick(40);
		const afterExpiry = mail.fetcher.mock.calls.length;
		await tick(150);
		expect(mail.fetcher.mock.calls.length).toBe(afterExpiry);
		expect(afterExpiry).toBeGreaterThanOrEqual(calls);
	});

	it('does not run two polls for the same job at once', async () => {
		const mail = fakeMailbox();
		await serverJob();
		let open = 0;
		let overlap = false;
		mail.fetcher.mockImplementation(async () => {
			open++;
			if (open > 1) overlap = true;
			await tick(60);
			open--;
			return Response.json([]);
		});
		mailHost(mail);
		startHost();
		await tick(250);
		expect(mail.fetcher.mock.calls.length).toBeGreaterThan(1);
		expect(overlap).toBe(false);
	});

	it('revoke fetches what is still waiting on the server before deleting the job', async () => {
		const mail = fakeMailbox();
		const job = await serverJob();
		const { sealed, id } = await sealedPhoto(job, jpeg('last'));
		mail.state.shots.set(id, sealed);
		host = new MirrorHost({ open: hub.open, reencode, mailbox: mail.env, pollMs: 60_000 });
		startHost();
		await until(() => expect(host.jobs).toHaveLength(1));
		const before = photos();
		await host.revoke(job.id);
		expect(photos()).toBe(before + 1);
		expect(mail.state.placed).toEqual([id]);
		expect(await getJob(job.id)).toBeUndefined();
		expect(
			mail.state.calls.filter(
				(call) => call.method === 'DELETE' && call.path === `/api/mirror/${job.id}`
			)
		).toHaveLength(1);
	});

	it('revoke still deletes the job when the server is unreachable', async () => {
		const mail = fakeMailbox();
		const job = await serverJob();
		host = new MirrorHost({ open: hub.open, reencode, mailbox: mail.env, pollMs: 60_000 });
		startHost();
		await until(() => expect(host.jobs).toHaveLength(1));
		mail.state.offline = true;
		await host.revoke(job.id);
		expect(await getJob(job.id)).toBeUndefined();
		expect(host.jobs).toEqual([]);
	});

	it('revoke of a job without server path does not touch the server', async () => {
		const mail = fakeMailbox();
		const job = await hostJob();
		host = new MirrorHost({ open: hub.open, reencode, mailbox: mail.env, pollMs: 60_000 });
		await host.revoke(job.id);
		expect(mail.fetcher).not.toHaveBeenCalled();
	});
});
