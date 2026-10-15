import type { Project } from '#lib/core/schema.ts';
import type { HostJob, JobPayload } from './types.ts';

export type JobErrorCode = 'noRooms' | 'tooManyRooms' | 'roomTooLarge';

export class JobError extends Error {
	readonly code: JobErrorCode;
	constructor(code: JobErrorCode) {
		super(code);
		this.code = code;
	}
}

// Builds a job for the chosen rooms: new token, payload split into as many QR links as needed (each link fits a QR code of version <= QR_MAX_VERSION).
export async function createHostJob(
	project: Project,
	roomIds: string[],
	appUrl: string,
	now: number = Date.now()
): Promise<HostJob> {
	void project;
	void roomIds;
	void appUrl;
	void now;
	throw new Error('not implemented');
}

export function encodeLink(appUrl: string, token: string, payload: JobPayload): string {
	void appUrl;
	void token;
	void payload;
	throw new Error('not implemented');
}

export type PairError = 'format' | 'tooLarge' | 'invalid' | 'expired';

export type PairResult =
	{ ok: true; token: string; payload: JobPayload } | { ok: false; error: PairError };

// Parses `#pair=<token>.<payload>` (with or without the leading `#`).
export function parsePair(fragment: string, now: number = Date.now()): PairResult {
	void fragment;
	void now;
	throw new Error('not implemented');
}
