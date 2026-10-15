import type { CameraJob, HostJob, JobPayload, MirrorJob, Shot } from './types.ts';

export async function saveHostJob(job: HostJob): Promise<void> {
	void job;
	throw new Error('not implemented');
}

// Open (not revoked, not expired) host jobs of a project, oldest first.
export async function listHostJobs(
	projectId: string,
	now: number = Date.now()
): Promise<HostJob[]> {
	void projectId;
	void now;
	throw new Error('not implemented');
}

export async function getJob(id: string): Promise<MirrorJob | undefined> {
	void id;
	throw new Error('not implemented');
}

export async function markReceived(jobId: string, hash: string): Promise<void> {
	void jobId;
	void hash;
	throw new Error('not implemented');
}

// Ends a host job immediately: the record is deleted, the token is gone.
export async function deleteHostJob(jobId: string): Promise<void> {
	void jobId;
	throw new Error('not implemented');
}

// Stores or merges one QR part on the phone (same token = same job); returns the merged job.
export async function saveCameraPart(
	token: string,
	payload: JobPayload,
	now: number = Date.now()
): Promise<CameraJob> {
	void token;
	void payload;
	void now;
	throw new Error('not implemented');
}

// Camera jobs on this device, including revoked ones that still hold photos; expired ones are left out.
export async function listCameraJobs(now: number = Date.now()): Promise<CameraJob[]> {
	void now;
	throw new Error('not implemented');
}

export async function markCameraRevoked(jobId: string, now: number = Date.now()): Promise<void> {
	void jobId;
	void now;
	throw new Error('not implemented');
}

// Deletes a camera job and all its photos.
export async function deleteCameraJob(jobId: string): Promise<void> {
	void jobId;
	throw new Error('not implemented');
}

export async function addShot(shot: Shot): Promise<void> {
	void shot;
	throw new Error('not implemented');
}

export async function listShots(jobId: string): Promise<Shot[]> {
	void jobId;
	throw new Error('not implemented');
}

export async function deleteShot(id: string): Promise<void> {
	void id;
	throw new Error('not implemented');
}

// Removes expired jobs of both roles and their photos; returns the number of jobs removed.
export async function purgeExpiredJobs(now: number = Date.now()): Promise<number> {
	void now;
	throw new Error('not implemented');
}
