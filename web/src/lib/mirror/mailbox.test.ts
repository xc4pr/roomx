import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	confirm,
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
const RECEIPT = 'c'.repeat(64);

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
		expect(new Headers(fetcher.mock.calls[2][1]?.headers).get('X-Roomx-Receipt')).toBeNull();
	});

	it('confirm deletes the photo and hands over the receipt', async () => {
		const { env, fetcher } = envWith(() => new Response('{"deleted":true}'));
		expect((await confirm('job123456789', HASH, RECEIPT, env)).kind).toBe('ok');
		const [url, init] = fetcher.mock.calls[0];
		expect(url).toBe('https://srv.test/api/mirror/job123456789/shots/' + HASH);
		expect(init?.method).toBe('DELETE');
		expect(headersOf(fetcher).get('X-Roomx-Receipt')).toBe(RECEIPT);
		expect(headersOf(fetcher).get('Authorization')).toBe('Bearer sync-token');
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

	it('placed returns the ids and the well-formed receipts', async () => {
		const other = 'b'.repeat(64);
		const { env, fetcher } = envWith(() =>
			Response.json({
				placed: [HASH, 5],
				receipts: {
					[HASH]: RECEIPT,
					[other]: 'short',
					['A'.repeat(64)]: RECEIPT,
					['d'.repeat(64)]: 7,
					['__proto__']: RECEIPT
				},
				expiresAt: 1
			})
		);
		const result = await placed('job123456789', 'secret', env);
		expect(result).toEqual({
			kind: 'ok',
			value: { placed: [HASH], receipts: new Map([[HASH, RECEIPT]]) }
		});
		expect(headersOf(fetcher).get('X-Roomx-Mailbox')).toBe('secret');
	});

	it('placed of a server without receipts gives none, so the phone keeps its photos', async () => {
		for (const receipts of [undefined, null, [RECEIPT], 'x']) {
			const { env } = envWith(() => Response.json({ placed: [HASH], receipts, expiresAt: 1 }));
			expect(await placed('job123456789', 's', env)).toEqual({
				kind: 'ok',
				value: { placed: [HASH], receipts: new Map() }
			});
		}
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

type Call = (env: MailboxEnv) => Promise<{ kind: string }>;

const everyCall: [string, Call][] = [
	['register', (env) => register('job123456789', HASH, 1, env)],
	['remove', (env) => remove('job123456789', env)],
	['list', (env) => list('job123456789', env)],
	['download', (env) => download('job123456789', HASH, env)],
	['discard', (env) => discard('job123456789', HASH, env)],
	['confirm', (env) => confirm('job123456789', HASH, RECEIPT, env)],
	['upload', (env) => upload('job123456789', HASH, new Uint8Array(1), 's', env)],
	['placed', (env) => placed('job123456789', 's', env)]
];

describe('every call maps the reply status', () => {
	const statuses: [number, string][] = [
		[404, 'notFound'],
		[410, 'gone'],
		[409, 'network'],
		[401, 'unauthorized'],
		[403, 'unauthorized'],
		[400, 'network'],
		[503, 'network']
	];

	for (const [name, call] of everyCall) {
		it(`${name}`, async () => {
			for (const [status, kind] of statuses) {
				const { env } = envWith(() => new Response('', { status }));
				expect((await call(env)).kind, `${name} ${status}`).toBe(kind);
			}
			const offline = envWith(() => {
				throw new TypeError('offline');
			});
			expect((await call(offline.env)).kind).toBe('network');
		});
	}

	it('sync calls without server url or token never reach the network', async () => {
		const { env, fetcher } = envWith(() => new Response('{}'));
		for (const [name, call] of everyCall.filter(([name]) => !['upload', 'placed'].includes(name))) {
			expect((await call({ ...env, token: '' })).kind, name).toBe('unauthorized');
			expect((await call({ ...env, serverUrl: '' })).kind, name).toBe('unauthorized');
		}
		expect(fetcher).not.toHaveBeenCalled();
	});
});

describe('replies that cannot be trusted', () => {
	it('list ignores bad entries and takes a missing size as zero', async () => {
		const { env } = envWith(() =>
			Response.json([
				{ id: HASH },
				{ id: 'A'.repeat(64), size: 1 },
				{ id: HASH + 'a', size: 1 },
				{ id: 5, size: 1 },
				null,
				'x'
			])
		);
		expect(await list('job123456789', env)).toEqual({ kind: 'ok', value: [{ id: HASH, size: 0 }] });
	});

	it('list treats an object or an empty body as a failure, an empty array as nothing', async () => {
		expect((await list('j', envWith(() => Response.json({ shots: [] })).env)).kind).toBe('network');
		expect((await list('j', envWith(() => new Response('')).env)).kind).toBe('network');
		expect(await list('j', envWith(() => Response.json([])).env)).toEqual({
			kind: 'ok',
			value: []
		});
	});

	it('placed treats a missing or malformed list as a failure so nothing is deleted on the phone', async () => {
		for (const body of [{}, { placed: 'x' }, { placed: null }, [], null]) {
			const { env } = envWith(() => Response.json(body));
			expect((await placed('job123456789', 's', env)).kind).toBe('network');
		}
		const empty = envWith(() => Response.json({ placed: [] }));
		expect(await placed('job123456789', 's', empty.env)).toEqual({
			kind: 'ok',
			value: { placed: [], receipts: new Map() }
		});
	});

	it('download fails when the body breaks off in the middle', async () => {
		const broken = new Response(
			new ReadableStream({
				start(controller) {
					controller.error(new Error('reset'));
				}
			})
		);
		const { env } = envWith(() => broken);
		expect((await download('job123456789', HASH, env)).kind).toBe('network');
	});

	it('download of an empty body is an ok result with no bytes', async () => {
		const { env } = envWith(() => new Response(new Uint8Array(0)));
		const result = await download('job123456789', HASH, env);
		expect(result.kind === 'ok' && result.value.byteLength).toBe(0);
	});
});

describe('requests', () => {
	it('never send cached answers and carry an abort signal', async () => {
		const { env, fetcher } = envWith(() => new Response('{}'));
		await remove('job123456789', env);
		await placed('job123456789', 's', env);
		for (const [, init] of fetcher.mock.calls) {
			expect(init?.cache).toBe('no-store');
			expect(init?.signal).toBeInstanceOf(AbortSignal);
		}
	});

	it('send the secret only to the page origin and the token only to the sync server', async () => {
		const { env, fetcher } = envWith(() => new Response('{}'));
		const other = { ...env, serverUrl: 'https://sync.test', origin: 'https://page.test' };
		await upload('j', HASH, new Uint8Array(1), 'secret', other);
		await register('j', HASH, 1, other);
		const [uploadCall, registerCall] = fetcher.mock.calls;
		expect(String(uploadCall[0]).startsWith('https://page.test/api/mirror/')).toBe(true);
		expect(new Headers(uploadCall[1]?.headers).get('Authorization')).toBeNull();
		expect(String(registerCall[0]).startsWith('https://sync.test/api/mirror/')).toBe(true);
		expect(new Headers(registerCall[1]?.headers).get('X-Roomx-Mailbox')).toBeNull();
	});
});

describe('timeouts', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('a silent server ends in a network failure after 15 s for small calls', async () => {
		vi.useFakeTimers();
		let signal: AbortSignal | null | undefined;
		const { env } = envWith((_url, init) => {
			signal = init.signal;
			return new Promise<Response>(() => {});
		});
		const pending = list('job123456789', env);
		await vi.advanceTimersByTimeAsync(14_999);
		expect(signal?.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(await pending).toEqual({ kind: 'network' });
		expect(signal?.aborted).toBe(true);
	});

	it('photo transfers get 60 s', async () => {
		vi.useFakeTimers();
		const { env } = envWith(() => new Promise<Response>(() => {}));
		let done = false;
		const pending = upload('job123456789', HASH, new Uint8Array(1), 's', env).then((result) => {
			done = true;
			return result;
		});
		await vi.advanceTimersByTimeAsync(59_999);
		expect(done).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(await pending).toEqual({ kind: 'network' });
	});

	it('a late answer after the timeout changes nothing', async () => {
		vi.useFakeTimers();
		let answer: (response: Response) => void = () => {};
		const { env } = envWith(
			() =>
				new Promise<Response>((resolve) => {
					answer = resolve;
				})
		);
		const pending = remove('job123456789', env);
		await vi.advanceTimersByTimeAsync(15_000);
		answer(new Response('{}'));
		expect(await pending).toEqual({ kind: 'network' });
	});
});
