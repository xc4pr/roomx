export const SOON_MS = 24 * 60 * 60 * 1000;

export type JobPhase = 'open' | 'soon' | 'ended';

export interface PhaseInput {
	expiresAt: number;
	revoked: boolean;
	expired: boolean;
}

export function jobPhase(job: PhaseInput, now: number): JobPhase {
	if (job.revoked || job.expired || now >= job.expiresAt) return 'ended';
	return job.expiresAt - now < SOON_MS ? 'soon' : 'open';
}

export function hoursLeft(expiresAt: number, now: number): number {
	return Math.max(1, Math.ceil((expiresAt - now) / (60 * 60 * 1000)));
}

export type StatusKind = 'searching' | 'connected' | 'progress' | 'allSent' | 'offline' | 'ended';

export interface StatusInput {
	status: 'idle' | 'searching' | 'connected' | 'ended';
	sent: number;
	total: number;
	revoked: boolean;
	expired: boolean;
}

export function statusKind(input: StatusInput): StatusKind {
	if (input.revoked || input.expired) return 'ended';
	if (input.status === 'searching') return 'searching';
	if (input.status === 'connected') {
		if (input.total <= 0) return 'connected';
		return input.sent >= input.total ? 'allSent' : 'progress';
	}
	return 'offline';
}

export interface IosInput {
	userAgent: string;
	platform: string;
	maxTouchPoints: number;
	standalone: boolean;
}

export function needsSafariNote(env: IosInput): boolean {
	const ios =
		/iPad|iPhone|iPod/.test(env.userAgent) ||
		(env.platform === 'MacIntel' && env.maxTouchPoints > 1);
	return ios && !env.standalone;
}
