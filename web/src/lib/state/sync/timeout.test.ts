import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi, AuthError, NetworkError } from './api.ts';
import { testConnection } from './connection.ts';
import { createOriginChecker } from './origin.ts';
import { withTimeout } from './timeout.ts';

const hanging = (): typeof fetch => () => new Promise<Response>(() => {});
const health = () =>
	new Response(JSON.stringify({ status: 'ok', version: '1' }), {
		headers: { 'Content-Type': 'application/json' }
	});

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('withTimeout', () => {
	it('rejects with a network error and aborts the work', async () => {
		let signal: AbortSignal | undefined;
		const pending = withTimeout(1_000, undefined, (received) => {
			signal = received;
			return new Promise<never>(() => {});
		});
		const outcome = expect(pending).rejects.toBeInstanceOf(NetworkError);
		await vi.advanceTimersByTimeAsync(1_000);
		await outcome;
		expect(signal?.aborted).toBe(true);
	});

	it('rejects when the external signal aborts', async () => {
		const cancel = new AbortController();
		const pending = withTimeout(60_000, cancel.signal, () => new Promise<never>(() => {}));
		const outcome = expect(pending).rejects.toBeInstanceOf(NetworkError);
		cancel.abort();
		await outcome;
	});

	it('passes results and errors through', async () => {
		expect(await withTimeout(1_000, undefined, async () => 5)).toBe(5);
		await expect(
			withTimeout(1_000, undefined, async () => {
				throw new AuthError('x');
			})
		).rejects.toBeInstanceOf(AuthError);
	});
});

describe('api timeouts', () => {
	it('treats a hanging request as a network error after 15 seconds', async () => {
		const api = createApi('https://s.example', 't', hanging());
		const outcome = expect(api.list()).rejects.toBeInstanceOf(NetworkError);
		await vi.advanceTimersByTimeAsync(14_999);
		await vi.advanceTimersByTimeAsync(1);
		await outcome;
	});

	it('gives photos 60 seconds', async () => {
		const api = createApi('https://s.example', 't', hanging());
		let failed = false;
		const outcome = api.getPhoto('a'.repeat(64)).catch((error: unknown) => {
			failed = error instanceof NetworkError;
		});
		await vi.advanceTimersByTimeAsync(59_999);
		expect(failed).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await outcome;
		expect(failed).toBe(true);
	});

	it('also covers a response body that never arrives', async () => {
		const stalled = async () =>
			({
				status: 200,
				ok: true,
				json: () => new Promise<never>(() => {})
			}) as unknown as Response;
		const api = createApi('https://s.example', 't', stalled);
		const outcome = expect(api.list()).rejects.toBeInstanceOf(NetworkError);
		await vi.advanceTimersByTimeAsync(15_000);
		await outcome;
	});

	it('aborts in-flight requests when the run is cancelled', async () => {
		const cancel = new AbortController();
		const api = createApi('https://s.example', 't', hanging(), cancel.signal);
		const outcome = expect(api.get('a')).rejects.toBeInstanceOf(NetworkError);
		cancel.abort();
		await outcome;
	});

	it('times out the connection test', async () => {
		const outcome = testConnection('https://s.example', 't', hanging(), null);
		await vi.advanceTimersByTimeAsync(8_000);
		expect(await outcome).toEqual({ kind: 'unreachable' });
	});
});

describe('origin checker', () => {
	const own = () => 'https://own.example';

	it('keeps retrying while only the network failed and then settles', async () => {
		let online = false;
		const found = vi.fn();
		const fetcher = vi.fn(async () => {
			if (!online) throw new TypeError('offline');
			return health();
		}) as unknown as typeof fetch;
		const checker = createOriginChecker(own, fetcher, found);
		expect(await checker.check()).toBeUndefined();
		expect(await checker.check()).toBeUndefined();
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(found).not.toHaveBeenCalled();
		online = true;
		expect(await checker.check()).toBe('https://own.example');
		expect(await checker.check()).toBe('https://own.example');
		expect(fetcher).toHaveBeenCalledTimes(3);
		expect(found).toHaveBeenCalledWith('https://own.example');
	});

	it('treats a hanging or failing server as unreachable, not as absent', async () => {
		const checker = createOriginChecker(own, hanging());
		const outcome = checker.check();
		await vi.advanceTimersByTimeAsync(5_000);
		expect(await outcome).toBeUndefined();
		const unavailable = createOriginChecker(own, async () => new Response('', { status: 503 }));
		expect(await unavailable.check()).toBeUndefined();
	});

	it('keeps a definitive "no server here" until reset', async () => {
		const fetcher = vi.fn(async () => new Response('<html></html>', { status: 200 }));
		const checker = createOriginChecker(own, fetcher as unknown as typeof fetch);
		expect(await checker.check()).toBeNull();
		expect(await checker.check()).toBeNull();
		expect(fetcher).toHaveBeenCalledTimes(1);
		checker.reset();
		await checker.check();
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('is settled without a request when there is no own origin', async () => {
		const fetcher = vi.fn();
		const checker = createOriginChecker(() => null, fetcher as unknown as typeof fetch);
		expect(await checker.check()).toBeNull();
		expect(fetcher).not.toHaveBeenCalled();
	});
});
