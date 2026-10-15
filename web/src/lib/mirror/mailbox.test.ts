import { describe, expect, it, vi } from 'vitest';
import {
	discard,
	download,
	list,
	mailboxAvailable,
	mailboxHash,
	mailboxUploadAvailable,
	placed,
	register,
	remove,
	upload,
	type MailboxEnv
} from './mailbox.ts';

const HASH = 'a'.repeat(64);

function envWith(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
	const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
		respond(String(url), init ?? {})
	);
	const env: MailboxEnv = {
		fetch: fetcher as unknown as typeof fetch,
		free: false,
		serverUrl: 'https://srv.test',
		token: 'sync-token',
		origin: 'https://srv.test'
	};
	return { env, fetcher };
}

const headersOf = (fetcher: ReturnType<typeof envWith>['fetcher']) =>
	new Headers(fetcher.mock.calls[0][1]?.headers);

describe('mailboxAvailable', () => {
	const base: MailboxEnv = {
		free: false,
		serverUrl: 'https://srv.test/',
		token: 't',
		origin: 'https://srv.test'
	};

	it('needs pro, server url, token and the same origin', () => {
		expect(mailboxAvailable(base)).toBe(true);
		expect(mailboxAvailable({ ...base, free: true })).toBe(false);
		expect(mailboxAvailable({ ...base, serverUrl: '' })).toBe(false);
		expect(mailboxAvailable({ ...base, token: '' })).toBe(false);
		expect(mailboxAvailable({ ...base, origin: 'https://other.test' })).toBe(false);
		expect(mailboxAvailable({ ...base, serverUrl: 'srv.test:8443' })).toBe(false);
	});

	it('phones only depend on the edition', () => {
		expect(mailboxUploadAvailable({ free: false, origin: 'https://srv.test' })).toBe(true);
		expect(mailboxUploadAvailable({ free: true, origin: 'https://srv.test' })).toBe(false);
	});
});

describe('sync token calls', () => {
	it('register sends the hash with the bearer token', async () => {
		const { env, fetcher } = envWith(() => new Response('{}', { status: 201 }));
		const result = await register('job123456789', HASH, 123, env);
		expect(result.kind).toBe('ok');
		const [url, init] = fetcher.mock.calls[0];
		expect(url).toBe('https://srv.test/api/mirror/job123456789');
		expect(init?.method).toBe('PUT');
		expect(headersOf(fetcher).get('Authorization')).toBe('Bearer sync-token');
		expect(JSON.parse(String(init?.body))).toEqual({ mailbox: HASH, expiresAt: 123 });
	});

	it('uses the path of the server url', async () => {
		const { env, fetcher } = envWith(() => new Response('{"deleted":true}'));
		await remove('job123456789', { ...env, serverUrl: 'https://srv.test/roomx/' });
		expect(fetcher.mock.calls[0][0]).toBe('https://srv.test/roomx/api/mirror/job123456789');
	});

	it('lists, downloads and discards', async () => {
		const { env, fetcher } = envWith((url, init) => {
			if (init.method === 'DELETE') return new Response('{"deleted":true}');
			if (url.endsWith('/shots')) {
				return Response.json([{ id: HASH, size: 3 }, { id: 'bad' }, 7]);
			}
			return new Response(new Uint8Array([1, 2, 3]));
		});
		const listing = await list('job123456789', env);
		expect(listing).toEqual({ kind: 'ok', value: [{ id: HASH, size: 3 }] });
		const bytes = await download('job123456789', HASH, env);
		expect(bytes.kind === 'ok' && [...bytes.value]).toEqual([1, 2, 3]);
		expect((await discard('job123456789', HASH, env)).kind).toBe('ok');
		expect(fetcher.mock.calls[2][1]?.method).toBe('DELETE');
	});

	it('maps statuses and failures', async () => {
		const statuses: [number, string][] = [
			[404, 'notFound'],
			[410, 'gone'],
			[401, 'unauthorized'],
			[409, 'network'],
			[500, 'network']
		];
		for (const [status, kind] of statuses) {
			const { env } = envWith(() => new Response('', { status }));
			expect((await list('job123456789', env)).kind).toBe(kind);
		}
		const broken = envWith(() => {
			throw new TypeError('offline');
		});
		expect((await list('job123456789', broken.env)).kind).toBe('network');
		const garbage = envWith(() => new Response('nope'));
		expect((await list('job123456789', garbage.env)).kind).toBe('network');
	});

	it('does not ask without a token', async () => {
		const { env, fetcher } = envWith(() => new Response('{}'));
		expect((await list('job123456789', { ...env, token: '' })).kind).toBe('unauthorized');
		expect(fetcher).not.toHaveBeenCalled();
	});
});

describe('mailbox secret calls', () => {
	it('upload sends bytes to the page origin with the mailbox header', async () => {
		const { env, fetcher } = envWith(() => new Response('{}', { status: 201 }));
		const bytes = new Uint8Array([9, 8, 7]);
		expect((await upload('job123456789', HASH, bytes, 'secret', env)).kind).toBe('ok');
		const [url, init] = fetcher.mock.calls[0];
		expect(url).toBe('https://srv.test/api/mirror/job123456789/shots/' + HASH);
		expect(init?.method).toBe('PUT');
		expect(init?.body).toBe(bytes);
		expect(headersOf(fetcher).get('X-Roomx-Mailbox')).toBe('secret');
		expect(headersOf(fetcher).get('Authorization')).toBeNull();
	});

	it('placed returns the ids', async () => {
		const { env, fetcher } = envWith(() => Response.json({ placed: [HASH, 5], expiresAt: 1 }));
		const result = await placed('job123456789', 'secret', env);
		expect(result).toEqual({ kind: 'ok', value: [HASH] });
		expect(headersOf(fetcher).get('X-Roomx-Mailbox')).toBe('secret');
	});

	it('reports wrong secrets and gone mailboxes', async () => {
		expect(
			(await placed('job123456789', 's', envWith(() => new Response('', { status: 401 })).env)).kind
		).toBe('unauthorized');
		expect(
			(
				await upload(
					'job123456789',
					HASH,
					new Uint8Array(1),
					's',
					envWith(() => new Response('', { status: 410 })).env
				)
			).kind
		).toBe('gone');
	});
});

describe('mailboxHash', () => {
	it('is the SHA-256 hex of the secret', async () => {
		expect(await mailboxHash('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});
});
