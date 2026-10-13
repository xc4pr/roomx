import { probeHealth, type Fetch } from './connection.ts';

export interface OriginChecker {
	check(): Promise<string | null | undefined>;
	reset(): void;
}

export function createOriginChecker(
	own: () => string | null,
	fetcher: Fetch,
	onSettled?: (found: string | null) => void
): OriginChecker {
	let settled: { found: string | null } | undefined;
	let running: Promise<string | null | undefined> | null = null;

	function settle(found: string | null): string | null {
		settled = { found };
		onSettled?.(found);
		return found;
	}

	return {
		check() {
			if (settled) return Promise.resolve(settled.found);
			running ??= (async () => {
				const origin = own();
				if (!origin) return settle(null);
				const probe = await probeHealth(origin, fetcher);
				if (probe.kind === 'unreachable') return undefined;
				return settle(probe.kind === 'ok' ? origin : null);
			})().finally(() => {
				running = null;
			});
			return running;
		},
		reset() {
			settled = undefined;
			running = null;
		}
	};
}
