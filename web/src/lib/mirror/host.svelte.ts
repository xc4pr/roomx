import type { HostJob, HostJobStatus, PlaceResult, ShotTag } from './types.ts';

// Computer side. The project layout calls start(projectId) while a project is open; it connects only for open jobs of that project.
export class MirrorHost {
	jobs = $state<HostJob[]>([]);

	status(jobId: string): HostJobStatus {
		void jobId;
		return { status: 'idle', peers: 0, received: 0, expected: 0 };
	}

	start(projectId: string): () => void {
		void projectId;
		return () => {};
	}

	async create(roomIds: string[]): Promise<HostJob> {
		void roomIds;
		throw new Error('not implemented');
	}

	// Tells connected phones, then deletes the job.
	async revoke(jobId: string): Promise<void> {
		void jobId;
		throw new Error('not implemented');
	}

	// Fallback path: a photo file shared from the phone and dropped into the app.
	async importShot(tag: ShotTag, bytes: Uint8Array<ArrayBuffer>): Promise<PlaceResult> {
		void tag;
		void bytes;
		throw new Error('not implemented');
	}
}

export const mirrorHost = new MirrorHost();
