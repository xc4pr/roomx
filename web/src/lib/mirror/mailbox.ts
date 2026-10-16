import { IS_FREE } from '#lib/edition.ts';
import { sha256Hex } from '#lib/features/photos/hash.ts';
import { settings } from '#lib/state/settings.svelte.ts';
import { normalizeServerUrl } from '#lib/state/sync/connection.ts';
import { withTimeout } from '#lib/state/sync/timeout.ts';

export interface MailboxEnv {
	fetch?: typeof fetch;
	free?: boolean;
	serverUrl?: string;
	token?: string;
	origin?: string;
}

export type MailboxFailure =
	{ kind: 'notFound' } | { kind: 'gone' } | { kind: 'unauthorized' } | { kind: 'network' };

export type MailboxResult<T = void> = { kind: 'ok'; value: T } | MailboxFailure;

export interface MailboxShot {
	id: string;
	size: number;
}

export interface MailboxPlaced {
	placed: string[];
	// Receipts the computer left for placed photos; the phone checks them before deleting its copy.
	receipts: Map<string, string>;
}

const JSON_TIMEOUT_MS = 15_000;
const BYTES_TIMEOUT_MS = 60_000;
const HASH = /^[0-9a-f]{64}$/;

function currentOrigin(env: MailboxEnv): string {
	return env.origin ?? (typeof location === 'undefined' ? '' : location.origin);
}

function syncBase(env: MailboxEnv): { base: string; token: string } | null {
	const base = normalizeServerUrl(env.serverUrl ?? settings.serverUrl);
	const token = env.token ?? settings.token;
	return base && token ? { base, token } : null;
}

// Computer side: the app is served by the sync server itself and sync is set up.
export function mailboxAvailable(env: MailboxEnv = {}): boolean {
	if (env.free ?? IS_FREE) return false;
	const sync = syncBase(env);
	if (!sync) return false;
	try {
		return new URL(sync.base).origin === currentOrigin(env);
	} catch {
		return false;
	}
}

// Phone side: only the edition decides; requests go to the origin that served the page.
export function mailboxUploadAvailable(env: MailboxEnv = {}): boolean {
	return !(env.free ?? IS_FREE) && currentOrigin(env) !== '';
}

export function mailboxHash(mailbox: string): Promise<string> {
	return sha256Hex(new TextEncoder().encode(mailbox));
}

function failure(status: number): MailboxFailure {
	if (status === 404) return { kind: 'notFound' };
	if (status === 410) return { kind: 'gone' };
	if (status === 401 || status === 403) return { kind: 'unauthorized' };
	return { kind: 'network' };
}

async function call<T>(
	env: MailboxEnv,
	url: string,
	init: RequestInit,
	timeout: number,
	read: (response: Response) => Promise<T | null>
): Promise<MailboxResult<T>> {
	const fetcher = env.fetch ?? globalThis.fetch.bind(globalThis);
	try {
		return await withTimeout<MailboxResult<T>>(timeout, undefined, async (signal) => {
			const response = await fetcher(url, { ...init, signal, cache: 'no-store' });
			if (!response.ok) return failure(response.status);
			const value = await read(response);
			return value === null ? { kind: 'network' } : { kind: 'ok', value };
		});
	} catch {
		return { kind: 'network' };
	}
}

function syncCall<T>(
	env: MailboxEnv,
	path: string,
	init: RequestInit,
	timeout: number,
	read: (response: Response) => Promise<T | null>
): Promise<MailboxResult<T>> {
	const sync = syncBase(env);
	if (!sync) return Promise.resolve({ kind: 'unauthorized' });
	return call(
		env,
		`${sync.base}/api/mirror/${path}`,
		{ ...init, headers: { ...init.headers, Authorization: `Bearer ${sync.token}` } },
		timeout,
		read
	);
}

function originCall<T>(
	env: MailboxEnv,
	path: string,
	mailbox: string,
	init: RequestInit,
	timeout: number,
	read: (response: Response) => Promise<T | null>
): Promise<MailboxResult<T>> {
	return call(
		env,
		`${currentOrigin(env)}/api/mirror/${path}`,
		{ ...init, headers: { ...init.headers, 'X-Roomx-Mailbox': mailbox } },
		timeout,
		read
	);
}

const nothing = async (): Promise<true> => true;

export function register(
	jobId: string,
	mailboxHashHex: string,
	expiresAt: number,
	env: MailboxEnv = {}
): Promise<MailboxResult<true>> {
	return syncCall(
		env,
		jobId,
		{
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mailbox: mailboxHashHex, expiresAt })
		},
		JSON_TIMEOUT_MS,
		nothing
	);
}

export function remove(jobId: string, env: MailboxEnv = {}): Promise<MailboxResult<true>> {
	return syncCall(env, jobId, { method: 'DELETE' }, JSON_TIMEOUT_MS, nothing);
}

export function list(jobId: string, env: MailboxEnv = {}): Promise<MailboxResult<MailboxShot[]>> {
	return syncCall(env, `${jobId}/shots`, { method: 'GET' }, JSON_TIMEOUT_MS, async (response) => {
		const body: unknown = await response.json().catch(() => null);
		if (!Array.isArray(body)) return null;
		const shots: MailboxShot[] = [];
		for (const entry of body as unknown[]) {
			const record = entry as { id?: unknown; size?: unknown } | null;
			if (typeof record?.id === 'string' && HASH.test(record.id)) {
				shots.push({ id: record.id, size: typeof record.size === 'number' ? record.size : 0 });
			}
		}
		return shots;
	});
}

export function download(
	jobId: string,
	id: string,
	env: MailboxEnv = {}
): Promise<MailboxResult<Uint8Array<ArrayBuffer>>> {
	return syncCall(
		env,
		`${jobId}/shots/${id}`,
		{ method: 'GET' },
		BYTES_TIMEOUT_MS,
		async (response) => new Uint8Array(await response.arrayBuffer())
	);
}

// Removes a photo nobody can use; the phone gets no receipt and keeps its copy.
export function discard(
	jobId: string,
	id: string,
	env: MailboxEnv = {}
): Promise<MailboxResult<true>> {
	return syncCall(env, `${jobId}/shots/${id}`, { method: 'DELETE' }, JSON_TIMEOUT_MS, nothing);
}

// Removes a placed photo and leaves the receipt for the phone.
export function confirm(
	jobId: string,
	id: string,
	receipt: string,
	env: MailboxEnv = {}
): Promise<MailboxResult<true>> {
	return syncCall(
		env,
		`${jobId}/shots/${id}`,
		{ method: 'DELETE', headers: { 'X-Roomx-Receipt': receipt } },
		JSON_TIMEOUT_MS,
		nothing
	);
}

export function upload(
	jobId: string,
	id: string,
	bytes: Uint8Array<ArrayBuffer>,
	mailbox: string,
	env: MailboxEnv = {}
): Promise<MailboxResult<true>> {
	return originCall(
		env,
		`${jobId}/shots/${id}`,
		mailbox,
		{
			method: 'PUT',
			headers: { 'Content-Type': 'application/octet-stream' },
			body: bytes
		},
		BYTES_TIMEOUT_MS,
		nothing
	);
}

export function placed(
	jobId: string,
	mailbox: string,
	env: MailboxEnv = {}
): Promise<MailboxResult<MailboxPlaced>> {
	return originCall(
		env,
		`${jobId}/placed`,
		mailbox,
		{ method: 'GET' },
		JSON_TIMEOUT_MS,
		async (response) => {
			const body = (await response.json().catch(() => null)) as {
				placed?: unknown;
				receipts?: unknown;
			} | null;
			if (!Array.isArray(body?.placed)) return null;
			const receipts = new Map<string, string>();
			// A server of an older version sends no receipts; then the phone keeps everything.
			if (body.receipts && typeof body.receipts === 'object' && !Array.isArray(body.receipts)) {
				for (const [id, receipt] of Object.entries(body.receipts)) {
					if (HASH.test(id) && typeof receipt === 'string' && HASH.test(receipt)) {
						receipts.set(id, receipt);
					}
				}
			}
			return {
				placed: body.placed.filter((id): id is string => typeof id === 'string'),
				receipts
			};
		}
	);
}
