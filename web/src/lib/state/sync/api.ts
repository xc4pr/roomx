import type { Fetch } from './connection.ts';
import { NetworkError, withTimeout } from './timeout.ts';

export { NetworkError };

export class AuthError extends Error {}

export class HttpError extends Error {
	readonly status: number;

	constructor(status: number) {
		super(`http ${status}`);
		this.status = status;
	}
}

export interface RemoteSummary {
	id: string;
	name: string;
	rev: number;
	updatedAt: string;
	deleted: boolean;
}

export type PushResult =
	| { kind: 'ok'; project: Record<string, unknown> }
	| { kind: 'conflict'; project: Record<string, unknown> }
	| { kind: 'missing' };

export interface Api {
	list(): Promise<RemoteSummary[]>;
	get(id: string): Promise<Record<string, unknown>>;
	put(id: string, baseRev: number, project: unknown): Promise<PushResult>;
	hasPhoto(hash: string): Promise<boolean>;
	putPhoto(hash: string, blob: Blob): Promise<void>;
	getPhoto(hash: string): Promise<Blob | null>;
}

const JSON_TIMEOUT = 15_000;
const PHOTO_TIMEOUT = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createApi(base: string, token: string, fetcher: Fetch, cancel?: AbortSignal): Api {
	function request<T>(
		path: string,
		init: RequestInit,
		timeout: number,
		read: (response: Response) => Promise<T>
	): Promise<T> {
		return withTimeout(timeout, cancel, async (signal) => {
			let response: Response;
			try {
				response = await fetcher(`${base}${path}`, {
					...init,
					headers: { Authorization: `Bearer ${token}`, ...init.headers },
					signal
				});
			} catch {
				throw new NetworkError('network');
			}
			if (response.status === 401 || response.status === 403) throw new AuthError('unauthorized');
			return read(response);
		});
	}

	async function json(response: Response): Promise<unknown> {
		try {
			return await response.json();
		} catch (error) {
			if (error instanceof SyntaxError) throw new HttpError(response.status || 500);
			throw new NetworkError('network');
		}
	}

	function record(value: unknown, status: number): Record<string, unknown> {
		if (!isRecord(value)) throw new HttpError(status);
		return value;
	}

	return {
		list() {
			return request(
				'/api/projects',
				{ headers: { Accept: 'application/json' } },
				JSON_TIMEOUT,
				async (response) => {
					if (!response.ok) throw new HttpError(response.status);
					const body = await json(response);
					if (!Array.isArray(body)) throw new HttpError(response.status);
					return body
						.filter(
							(entry): entry is RemoteSummary =>
								isRecord(entry) && typeof entry.id === 'string' && typeof entry.rev === 'number'
						)
						.map((entry) => ({ ...entry, deleted: entry.deleted === true }));
				}
			);
		},
		get(id) {
			return request(
				`/api/projects/${encodeURIComponent(id)}`,
				{ headers: { Accept: 'application/json' } },
				JSON_TIMEOUT,
				async (response) => {
					if (!response.ok) throw new HttpError(response.status);
					return record(await json(response), response.status);
				}
			);
		},
		put(id, baseRev, project) {
			return request<PushResult>(
				`/api/projects/${encodeURIComponent(id)}`,
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ baseRev, project })
				},
				JSON_TIMEOUT,
				async (response) => {
					if (response.status === 404) return { kind: 'missing' };
					if (response.status === 409) {
						return { kind: 'conflict', project: record(await json(response), response.status) };
					}
					if (!response.ok) throw new HttpError(response.status);
					return { kind: 'ok', project: record(await json(response), response.status) };
				}
			);
		},
		hasPhoto(hash) {
			return request(`/api/photos/${hash}`, { method: 'HEAD' }, JSON_TIMEOUT, async (response) => {
				if (response.status === 404) return false;
				if (!response.ok) throw new HttpError(response.status);
				return true;
			});
		},
		async putPhoto(hash, blob) {
			await request(
				`/api/photos/${hash}`,
				{ method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob },
				PHOTO_TIMEOUT,
				async (response) => {
					if (!response.ok) throw new HttpError(response.status);
				}
			);
		},
		getPhoto(hash) {
			return request(`/api/photos/${hash}`, {}, PHOTO_TIMEOUT, async (response) => {
				if (response.status === 404) return null;
				if (!response.ok) throw new HttpError(response.status);
				try {
					return await response.blob();
				} catch {
					throw new NetworkError('network');
				}
			});
		}
	};
}
