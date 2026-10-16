import { describe, expect, it, vi } from 'vitest';
import { respondFromCache } from './respond.ts';

const request = new Request('https://example.test/roomx/');
const hit = new Response('cached');
const net = new Response('network');

function cacheWith(match: () => Promise<Response | undefined>): Cache {
	return { match } as unknown as Cache;
}

describe('respondFromCache', () => {
	it('returns a cache hit without touching the network', async () => {
		const fetcher = vi.fn();
		const result = await respondFromCache(
			async () => cacheWith(async () => hit),
			'/roomx/',
			request,
			fetcher
		);
		expect(result).toBe(hit);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('falls back to the network on a miss', async () => {
		const fetcher = vi.fn(async () => net);
		const result = await respondFromCache(
			async () => cacheWith(async () => undefined),
			'/roomx/',
			request,
			fetcher
		);
		expect(result).toBe(net);
		expect(fetcher).toHaveBeenCalledWith(request);
	});

	it('falls back to the network when opening the cache rejects', async () => {
		const fetcher = vi.fn(async () => net);
		const result = await respondFromCache(
			() => Promise.reject(new TypeError('Internal error')),
			'/roomx/',
			request,
			fetcher
		);
		expect(result).toBe(net);
	});

	it('falls back to the network when match rejects', async () => {
		const fetcher = vi.fn(async () => net);
		const result = await respondFromCache(
			async () => cacheWith(() => Promise.reject(new TypeError('Internal error'))),
			'/roomx/',
			request,
			fetcher
		);
		expect(result).toBe(net);
	});

	it('rejects with the network error when cache and network both fail', async () => {
		const failure = new TypeError('Failed to fetch');
		await expect(
			respondFromCache(
				() => Promise.reject(new TypeError('Internal error')),
				'/roomx/',
				request,
				() => Promise.reject(failure)
			)
		).rejects.toBe(failure);
	});
});
