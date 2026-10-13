import { withTimeout } from './timeout.ts';

export type Fetch = typeof fetch;

const LOCAL_HOST =
	/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^/:]+\.local([:/]|$))/i;

export function normalizeServerUrl(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const withScheme = /^https?:\/\//i.test(trimmed)
		? trimmed
		: `${LOCAL_HOST.test(trimmed) ? 'http' : 'https'}://${trimmed}`;
	try {
		const url = new URL(withScheme);
		return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
	} catch {
		return null;
	}
}

export interface HealthInfo {
	version: string;
}

export function parseHealth(value: unknown): HealthInfo | null {
	if (typeof value !== 'object' || value === null) return null;
	const record = value as Record<string, unknown>;
	if (record.status !== 'ok' || typeof record.version !== 'string') return null;
	return { version: record.version };
}

export type HealthProbe =
	{ kind: 'ok'; info: HealthInfo } | { kind: 'notServer' } | { kind: 'unreachable' };

export async function probeHealth(base: string, fetcher: Fetch, ms = 5_000): Promise<HealthProbe> {
	try {
		return await withTimeout<HealthProbe>(ms, undefined, async (signal) => {
			const response = await fetcher(`${base}/api/health`, {
				headers: { Accept: 'application/json' },
				signal
			});
			if (response.status >= 500) return { kind: 'unreachable' };
			if (!response.ok) return { kind: 'notServer' };
			let body: unknown;
			try {
				body = await response.json();
			} catch (error) {
				if (error instanceof SyntaxError) return { kind: 'notServer' };
				throw error;
			}
			const info = parseHealth(body);
			return info ? { kind: 'ok', info } : { kind: 'notServer' };
		});
	} catch {
		return { kind: 'unreachable' };
	}
}

export type ConnectionResult =
	| { kind: 'ok'; version: string; projects: number }
	| { kind: 'invalidUrl' }
	| { kind: 'unreachable' }
	| { kind: 'notServer' }
	| { kind: 'noToken' }
	| { kind: 'unauthorized' }
	| { kind: 'failed' };

export async function testConnection(
	url: string,
	token: string,
	fetcher: Fetch,
	origin: string | null
): Promise<ConnectionResult> {
	const base = url.trim() ? normalizeServerUrl(url) : origin;
	if (!base) return { kind: 'invalidUrl' };
	const probe = await probeHealth(base, fetcher, 8_000);
	if (probe.kind !== 'ok') return { kind: probe.kind };
	if (!token.trim()) return { kind: 'noToken' };
	try {
		return await withTimeout<ConnectionResult>(8_000, undefined, async (signal) => {
			const response = await fetcher(`${base}/api/projects`, {
				headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' },
				signal
			});
			if (response.status === 401 || response.status === 403) return { kind: 'unauthorized' };
			if (!response.ok) return { kind: 'failed' };
			const list: unknown = await response.json();
			return {
				kind: 'ok',
				version: probe.info.version,
				projects: Array.isArray(list) ? list.length : 0
			};
		});
	} catch {
		return { kind: 'unreachable' };
	}
}
