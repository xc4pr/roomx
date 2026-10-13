export const BACKOFF_START_MS = 5_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

export function backoffDelay(failures: number): number {
	const step = Math.max(0, failures - 1);
	return Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * 2 ** step);
}
