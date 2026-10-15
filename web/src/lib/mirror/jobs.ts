import { db } from '#lib/state/db.ts';
import { deriveKeys } from './token.ts';
import type { CameraJob, HostJob, JobPayload, MirrorJob, Shot } from './types.ts';

export async function saveHostJob(job: HostJob): Promise<void> {
	await db.mirrorJobs.put(job);
}

export async function listHostJobs(
	projectId: string,
	now: number = Date.now()
): Promise<HostJob[]> {
	const jobs = await db.mirrorJobs.where('projectId').equals(projectId).toArray();
	return jobs
		.filter((job): job is HostJob => job.role === 'host')
		.filter((job) => job.revokedAt === undefined && job.expiresAt > now)
		.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getJob(id: string): Promise<MirrorJob | undefined> {
	return db.mirrorJobs.get(id);
}

export async function markReceived(jobId: string, hash: string): Promise<void> {
	await db.transaction('rw', db.mirrorJobs, async () => {
		const job = await db.mirrorJobs.get(jobId);
		if (job?.role !== 'host' || job.received.includes(hash)) return;
		await db.mirrorJobs.put({ ...job, received: [...job.received, hash] });
	});
}

export async function deleteHostJob(jobId: string): Promise<void> {
	await db.transaction('rw', db.mirrorJobs, async () => {
		const job = await db.mirrorJobs.get(jobId);
		if (job?.role === 'host') await db.mirrorJobs.delete(jobId);
	});
}

export async function saveCameraPart(
	token: string,
	payload: JobPayload,
	now: number = Date.now()
): Promise<CameraJob> {
	const { jobId } = await deriveKeys(token);
	return db.transaction('rw', db.mirrorJobs, async () => {
		const existing = await db.mirrorJobs.get(jobId);
		if (existing?.role === 'host') throw new Error('host job');
		const byIndex = new Map(existing?.rooms.map((room) => [room.index, room]));
		for (const room of payload.rooms) byIndex.set(room.index, room);
		const job: CameraJob = {
			id: jobId,
			role: 'camera',
			token,
			project: payload.project,
			lang: payload.lang,
			createdAt: existing?.createdAt ?? now,
			expiresAt: payload.expiresAt,
			parts: payload.parts,
			partsSeen: [...new Set([...(existing?.partsSeen ?? []), payload.part])].sort((a, b) => a - b),
			rooms: [...byIndex.values()].sort((a, b) => a.index - b.index)
		};
		if (existing?.revokedAt !== undefined) job.revokedAt = existing.revokedAt;
		await db.mirrorJobs.put(job);
		return job;
	});
}

export async function listCameraJobs(now: number = Date.now()): Promise<CameraJob[]> {
	const jobs = await db.mirrorJobs.where('role').equals('camera').toArray();
	return jobs
		.filter((job): job is CameraJob => job.role === 'camera' && job.expiresAt > now)
		.sort((a, b) => a.createdAt - b.createdAt);
}

export async function markCameraRevoked(jobId: string, now: number = Date.now()): Promise<void> {
	await db.transaction('rw', db.mirrorJobs, async () => {
		const job = await db.mirrorJobs.get(jobId);
		if (job?.role === 'camera') await db.mirrorJobs.put({ ...job, revokedAt: now });
	});
}

export async function deleteCameraJob(jobId: string): Promise<void> {
	await db.transaction('rw', db.mirrorJobs, db.mirrorShots, async () => {
		await db.mirrorShots.where('jobId').equals(jobId).delete();
		const job = await db.mirrorJobs.get(jobId);
		if (job?.role === 'camera') await db.mirrorJobs.delete(jobId);
	});
}

export async function addShot(shot: Shot): Promise<void> {
	await db.mirrorShots.put(shot);
}

export async function listShots(jobId: string): Promise<Shot[]> {
	const shots = await db.mirrorShots.where('jobId').equals(jobId).toArray();
	return shots.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

export async function deleteShot(id: string): Promise<void> {
	await db.mirrorShots.delete(id);
}

export async function purgeExpiredJobs(now: number = Date.now()): Promise<number> {
	return db.transaction('rw', db.mirrorJobs, db.mirrorShots, async () => {
		const expired = await db.mirrorJobs.filter((job) => job.expiresAt <= now).primaryKeys();
		if (expired.length === 0) return 0;
		await db.mirrorShots.where('jobId').anyOf(expired).delete();
		await db.mirrorJobs.bulkDelete(expired);
		return expired.length;
	});
}
