import type { ProcessedImage } from '#lib/features/photos/image.ts';
import type { CameraJob, CameraStatus, OpenTransport, Shot } from './types.ts';

// Phone side for one job: keeps the photos, connects while the camera page is open and the job is valid, sends what the computer has not confirmed.
export class CameraSession {
	readonly jobId: string;
	job = $state<CameraJob | undefined>();
	shots = $state<Shot[]>([]);
	status = $state<CameraStatus>({
		status: 'idle',
		sent: 0,
		total: 0,
		pending: 0,
		failed: [],
		fallbackSuggested: false,
		revoked: false,
		expired: false
	});

	constructor(jobId: string, open?: OpenTransport) {
		this.jobId = jobId;
		void open;
	}

	start(): () => void {
		return () => {};
	}

	async addShot(room: number, stepKey: string, image: ProcessedImage): Promise<Shot> {
		void room;
		void stepKey;
		void image;
		throw new Error('not implemented');
	}

	async removeShot(id: string): Promise<void> {
		void id;
		throw new Error('not implemented');
	}
}
