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
	listRevokedHostJobs,
	listShots,
	markCameraRevoked,
	markHostRevoked,
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

describe('revoked host jobs', () => {
	it('stay as records outside the job list until deleted', async () => {
		await saveHostJob(host('a', { server: true }));
		await saveHostJob(host('local'));
		await saveHostJob(host('live', { server: true }));
		await markHostRevoked('a', NOW + 5);
		await markHostRevoked('local', NOW + 5);
		expect(((await getJob('a')) as HostJob).revokedAt).toBe(NOW + 5);
		expect((await listHostJobs('p1', NOW)).map((job) => job.id)).toEqual(['live']);
		expect((await listRevokedHostJobs()).map((job) => job.id)).toEqual(['a']);
		await deleteHostJob('a');
		expect(await listRevokedHostJobs()).toEqual([]);
	});

	it('markHostRevoked ignores phone jobs and unknown ids', async () => {
		const token = newToken();
		const { jobId } = await deriveKeys(token);
		await saveCameraPart(token, { ...payload(0, [room(0)]), server: true }, NOW);
		await markHostRevoked(jobId, NOW);
		await markHostRevoked('missing', NOW);
		expect((await getJob(jobId))?.revokedAt).toBeUndefined();
		expect(await listRevokedHostJobs()).toEqual([]);
	});

	it('are purged after expiry like any host job', async () => {
		await saveHostJob(host('a', { server: true, revokedAt: NOW }));
		await purgeExpiredJobs(NOW + 1000);
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

describe('duplicate parts of the same token', () => {
	it('a part scanned twice changes nothing but keeps the first creation time', async () => {
		const token = newToken();
		const first = await saveCameraPart(token, payload(1, [room(0)]), NOW);
		const again = await saveCameraPart(token, payload(1, [room(0)]), NOW + 50);
		expect(again.partsSeen).toEqual([1]);
		expect(again.rooms).toHaveLength(1);
		expect(again.createdAt).toBe(NOW);
		expect(again.id).toBe(first.id);
		expect(await db.mirrorJobs.count()).toBe(1);
	});

	it('parts arriving out of order are sorted and rooms are never lost', async () => {
		const token = newToken();
		await saveCameraPart(token, payload(2, [room(4), room(5)]), NOW);
		await saveCameraPart(token, payload(1, [room(0), room(1)]), NOW);
		const job = await saveCameraPart(token, payload(1, [room(1, 'renamed')]), NOW);
		expect(job.partsSeen).toEqual([1, 2]);
		expect(job.rooms.map((r) => r.index)).toEqual([0, 1, 4, 5]);
		expect(job.rooms[1].name).toBe('renamed');
	});

	it('the server flag stays once any part carried it', async () => {
		const token = newToken();
		await saveCameraPart(token, { ...payload(1, [room(0)]), server: true }, NOW);
		const later = await saveCameraPart(token, payload(2, [room(1)]), NOW);
		expect(later.server).toBe(true);
		const plain = await saveCameraPart(newToken(), payload(1, [room(0)]), NOW);
		expect(plain.server).toBeUndefined();
	});

	it('does not revoke again or lose the revoke when a part arrives afterwards', async () => {
		const token = newToken();
		const job = await saveCameraPart(token, payload(1, [room(0)]), NOW);
		await markCameraRevoked(job.id, NOW + 1);
		await markCameraRevoked(job.id, NOW + 2);
		const merged = await saveCameraPart(token, payload(2, [room(1)]), NOW + 3);
		expect(merged.revokedAt).toBe(NOW + 2);
	});

	it('the newest part decides the expiry', async () => {
		const token = newToken();
		await saveCameraPart(token, payload(1, [room(0)], NOW + 100), NOW);
		const job = await saveCameraPart(token, payload(2, [room(1)], NOW + 900), NOW);
		expect(job.expiresAt).toBe(NOW + 900);
	});
});

describe('roles never cross', () => {
	async function hostWithTokenId() {
		const token = newToken();
		const { jobId } = await deriveKeys(token);
		await saveHostJob(host(jobId, { token }));
		return { token, jobId };
	}

	it('a phone part cannot overwrite a host job with the same id', async () => {
		const { token, jobId } = await hostWithTokenId();
		await expect(saveCameraPart(token, payload(1, [room(0)]), NOW)).rejects.toThrow('host job');
		const stored = await getJob(jobId);
		expect(stored?.role).toBe('host');
	});

	it('markReceived ignores phone jobs, markCameraRevoked ignores host jobs', async () => {
		const phone = await saveCameraPart(newToken(), payload(1, [room(0)]), NOW);
		await markReceived(phone.id, 'h1');
		expect(await getJob(phone.id)).toEqual(phone);
		await saveHostJob(host('h'));
		await markCameraRevoked('h', NOW);
		expect(((await getJob('h')) as HostJob).revokedAt).toBeUndefined();
	});

	it('deleteHostJob keeps phone jobs and their photos', async () => {
		const phone = await saveCameraPart(newToken(), payload(1, [room(0)]), NOW);
		await addShot(shot('s1', phone.id));
		await deleteHostJob(phone.id);
		expect(await getJob(phone.id)).toBeDefined();
		expect(await listShots(phone.id)).toHaveLength(1);
	});

	it('deleteCameraJob keeps host jobs', async () => {
		await saveHostJob(host('h'));
		await deleteCameraJob('h');
		expect(await getJob('h')).toBeDefined();
	});

	it('unknown ids are harmless', async () => {
		await markCameraRevoked('nope', NOW);
		await deleteCameraJob('nope');
		await deleteHostJob('nope');
		await deleteShot('nope');
		expect(await getJob('nope')).toBeUndefined();
		expect(await db.mirrorJobs.count()).toBe(0);
	});
});

describe('time limits at the exact edge', () => {
	it('a host job that expires right now is no longer listed', async () => {
		await saveHostJob(host('a', { expiresAt: NOW }));
		await saveHostJob(host('b', { expiresAt: NOW + 1 }));
		expect((await listHostJobs('p1', NOW)).map((job) => job.id)).toEqual(['b']);
	});

	it('a phone job that expires right now is listed only with photos', async () => {
		const empty = await saveCameraPart(newToken(), payload(1, [room(0)], NOW + 5), NOW);
		const held = await saveCameraPart(newToken(), payload(1, [room(0)], NOW + 5), NOW);
		await addShot(shot('s1', held.id));
		expect((await listCameraJobs(NOW + 5)).map((job) => job.id)).toEqual([held.id]);
		expect((await listCameraJobs(NOW + 4)).map((job) => job.id).sort()).toEqual(
			[empty.id, held.id].sort()
		);
	});

	it('the 30 day grace ends exactly at expiry plus 30 days for both list and purge', async () => {
		const held = await saveCameraPart(newToken(), payload(1, [room(0)], NOW + 5), NOW);
		await addShot(shot('s1', held.id));
		const lastKept = NOW + 5 + 30 * DAY - 1;
		expect((await listCameraJobs(lastKept)).map((job) => job.id)).toEqual([held.id]);
		expect(await purgeExpiredJobs(lastKept)).toBe(0);
		expect(await listCameraJobs(lastKept + 1)).toEqual([]);
		expect(await listShots(held.id)).toHaveLength(1);
		expect(await purgeExpiredJobs(lastKept + 1)).toBe(1);
		expect(await listShots(held.id)).toEqual([]);
	});

	it('a job that expires right now is purged', async () => {
		await saveHostJob(host('h', { expiresAt: NOW }));
		const empty = await saveCameraPart(newToken(), payload(1, [room(0)], NOW), NOW - 1);
		expect(await purgeExpiredJobs(NOW)).toBe(2);
		expect(await getJob('h')).toBeUndefined();
		expect(await getJob(empty.id)).toBeUndefined();
	});
});

describe('purgeExpiredJobs with photos', () => {
	it('deletes the photos of purged jobs only, never those of kept jobs', async () => {
		const kept = await saveCameraPart(newToken(), payload(1, [room(0)], NOW + 5), NOW);
		const gone = await saveCameraPart(newToken(), payload(1, [room(0)], NOW + 5), NOW);
		const live = await saveCameraPart(newToken(), payload(1, [room(0)], NOW + 10 * DAY), NOW);
		await addShot(shot('k', kept.id));
		await addShot(shot('l', live.id));
		await db.mirrorJobs.put({ ...gone, expiresAt: NOW - 31 * DAY });
		await addShot(shot('g', gone.id));
		expect(await purgeExpiredJobs(NOW + 20)).toBe(1);
		expect(await getJob(gone.id)).toBeUndefined();
		expect(await listShots(gone.id)).toEqual([]);
		expect((await listShots(kept.id)).map((s) => s.id)).toEqual(['k']);
		expect((await listShots(live.id)).map((s) => s.id)).toEqual(['l']);
	});

	it('an expired host job is purged at once, and photos filed under its id go too', async () => {
		await saveHostJob(host('h', { expiresAt: NOW + 5 }));
		await addShot(shot('x', 'h'));
		expect(await purgeExpiredJobs(NOW + 6)).toBe(1);
		expect(await listShots('h')).toEqual([]);
	});

	it('a revoked phone job that is still valid survives, and its photos stay', async () => {
		const job = await saveCameraPart(newToken(), payload(1, [room(0)], NOW + 500), NOW);
		await markCameraRevoked(job.id, NOW + 1);
		await addShot(shot('s', job.id));
		expect(await purgeExpiredJobs(NOW + 10)).toBe(0);
		expect(await listShots(job.id)).toHaveLength(1);
	});

	it('a revoked and expired phone job still keeps unsent photos for 30 days', async () => {
		const job = await saveCameraPart(newToken(), payload(1, [room(0)], NOW + 5), NOW);
		await markCameraRevoked(job.id, NOW + 1);
		await addShot(shot('s', job.id));
		expect(await purgeExpiredJobs(NOW + 5 + DAY)).toBe(0);
		expect(await getJob(job.id)).toBeDefined();
	});

	it('purging nothing returns zero and an empty database stays empty', async () => {
		expect(await purgeExpiredJobs(NOW)).toBe(0);
		expect(await db.mirrorShots.count()).toBe(0);
	});
});
