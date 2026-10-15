import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '#lib/state/db.ts';
import {
	addShot,
	deleteCameraJob,
	deleteHostJob,
	deleteShot,
	getJob,
	listCameraJobs,
	listHostJobs,
	listShots,
	markCameraRevoked,
	markReceived,
	purgeExpiredJobs,
	saveCameraPart,
	saveHostJob
} from './jobs.ts';
import { deriveKeys, newToken } from './token.ts';
import type { HostJob, JobPayload, MirrorRoom, Shot } from './types.ts';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

const NOW = 1_000_000;

function host(id: string, over: Partial<HostJob> = {}): HostJob {
	return {
		id,
		role: 'host',
		projectId: 'p1',
		token: 't',
		createdAt: NOW,
		expiresAt: NOW + 1000,
		rooms: [],
		links: [],
		received: [],
		...over
	};
}

function room(index: number, name = `R${index}`): MirrorRoom {
	return {
		index,
		name,
		polygon: [
			{ x: 0, y: 0 },
			{ x: 1000, y: 0 },
			{ x: 1000, y: 1000 }
		],
		height: 2500,
		elements: [],
		done: []
	};
}

function payload(part: number, rooms: MirrorRoom[], expiresAt = NOW + 1000): JobPayload {
	return { v: 1, project: 'P', lang: 'de', expiresAt, part, parts: 2, rooms };
}

function shot(id: string, jobId: string, takenAt = '2026-01-01T00:00:00Z'): Shot {
	return {
		id,
		jobId,
		room: 0,
		stepKey: 'floor',
		hash: id,
		blob: new Blob(['a']),
		thumbnail: new Blob(['b']),
		w: 1,
		h: 1,
		takenAt
	};
}

describe('host jobs', () => {
	it('lists only open jobs of the project, oldest first', async () => {
		await saveHostJob(host('b', { createdAt: NOW + 2 }));
		await saveHostJob(host('a', { createdAt: NOW + 1 }));
		await saveHostJob(host('other', { projectId: 'p2' }));
		await saveHostJob(host('old', { expiresAt: NOW }));
		await saveHostJob(host('revoked', { revokedAt: NOW }));
		expect((await listHostJobs('p1', NOW + 10)).map((job) => job.id)).toEqual(['a', 'b']);
	});

	it('records received hashes once and deletes', async () => {
		await saveHostJob(host('a'));
		await markReceived('a', 'h1');
		await markReceived('a', 'h1');
		await markReceived('a', 'h2');
		await markReceived('missing', 'h2');
		expect(((await getJob('a')) as HostJob).received).toEqual(['h1', 'h2']);
		await deleteHostJob('a');
		expect(await getJob('a')).toBeUndefined();
	});
});

describe('camera jobs', () => {
	it('merges parts with the same token', async () => {
		const token = newToken();
		const first = await saveCameraPart(token, payload(2, [room(2), room(3)]), NOW);
		expect(first.id).toBe((await deriveKeys(token)).jobId);
		await markCameraRevoked(first.id, NOW + 5);
		const merged = await saveCameraPart(
			token,
			payload(1, [room(0), room(1), room(2, 'new')]),
			NOW + 9
		);
		expect(merged.partsSeen).toEqual([1, 2]);
		expect(merged.rooms.map((r) => r.index)).toEqual([0, 1, 2, 3]);
		expect(merged.rooms[2].name).toBe('new');
		expect(merged.createdAt).toBe(NOW);
		expect(merged.revokedAt).toBe(NOW + 5);
		expect(await getJob(merged.id)).toEqual(merged);
	});

	it('lists unexpired jobs including revoked ones', async () => {
		const a = await saveCameraPart(newToken(), payload(1, [room(0)]), NOW);
		const b = await saveCameraPart(newToken(), payload(1, [room(0)], NOW + 5), NOW);
		await markCameraRevoked(a.id, NOW);
		await saveHostJob(host('h'));
		const ids = (await listCameraJobs(NOW + 10)).map((job) => job.id);
		expect(ids).toEqual([a.id]);
		expect(b.id).not.toBe(a.id);
	});

	it('stores shots and removes them with the job', async () => {
		const job = await saveCameraPart(newToken(), payload(1, [room(0)]), NOW);
		await addShot(shot('s2', job.id, '2026-01-02T00:00:00Z'));
		await addShot(shot('s1', job.id));
		await addShot(shot('x', 'other'));
		expect((await listShots(job.id)).map((s) => s.id)).toEqual(['s1', 's2']);
		await deleteShot('s1');
		expect((await listShots(job.id)).map((s) => s.id)).toEqual(['s2']);
		await deleteCameraJob(job.id);
		expect(await getJob(job.id)).toBeUndefined();
		expect(await listShots(job.id)).toEqual([]);
		expect(await listShots('other')).toHaveLength(1);
	});
});

const DAY = 24 * 60 * 60 * 1000;

describe('purgeExpiredJobs', () => {
	it('removes expired host jobs and empty expired phone jobs, keeps live ones', async () => {
		const empty = await saveCameraPart(newToken(), payload(1, [room(0)], NOW + 5), NOW);
		const live = await saveCameraPart(newToken(), payload(1, [room(0)], NOW + 500), NOW);
		await saveHostJob(host('he', { expiresAt: NOW + 5 }));
		await saveHostJob(host('hl', { expiresAt: NOW + 500 }));
		await addShot(shot('s2', live.id));
		expect(await purgeExpiredJobs(NOW + 10)).toBe(2);
		expect(await getJob('he')).toBeUndefined();
		expect(await getJob(empty.id)).toBeUndefined();
		expect(await getJob('hl')).toBeDefined();
		expect((await listShots(live.id)).length).toBe(1);
		expect(await purgeExpiredJobs(NOW + 10)).toBe(0);
	});

	it('keeps an expired phone job with unsent photos for 30 days, then deletes it', async () => {
		const held = await saveCameraPart(newToken(), payload(1, [room(0)], NOW + 5), NOW);
		await addShot(shot('s1', held.id));
		expect(await purgeExpiredJobs(NOW + 10)).toBe(0);
		expect(await purgeExpiredJobs(NOW + 5 + 29 * DAY)).toBe(0);
		expect(await getJob(held.id)).toBeDefined();
		expect((await listCameraJobs(NOW + 5 + 29 * DAY)).map((job) => job.id)).toEqual([held.id]);
		expect(await purgeExpiredJobs(NOW + 5 + 30 * DAY)).toBe(1);
		expect(await getJob(held.id)).toBeUndefined();
		expect(await listShots(held.id)).toEqual([]);
	});

	it('lists expired phone jobs only while they hold photos and the grace period runs', async () => {
		const empty = await saveCameraPart(newToken(), payload(1, [room(0)], NOW + 5), NOW);
		const held = await saveCameraPart(newToken(), payload(1, [room(0)], NOW + 5), NOW);
		await addShot(shot('s1', held.id));
		const ids = (await listCameraJobs(NOW + 10)).map((job) => job.id);
		expect(ids).toContain(held.id);
		expect(ids).not.toContain(empty.id);
		expect(await listCameraJobs(NOW + 5 + 31 * DAY)).toEqual([]);
	});
});
