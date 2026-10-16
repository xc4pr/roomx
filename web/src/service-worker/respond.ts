// Pages projects share one origin, so only this app's own old caches may be removed.
export function staleCaches(keys: readonly string[], current: string): string[] {
	return keys.filter((key) => key.startsWith('roomx-') && key !== current);
}

// A rejecting Cache Storage (WebKit: "Internal error" after a profile restart) counts as a miss.
export async function respondFromCache(
	open: () => Promise<Cache>,
	key: string,
	request: Request,
	fetcher: typeof fetch
): Promise<Response> {
	const cached = await open()
		.then((cache) => cache.match(key))
		.catch(() => undefined);
	return cached ?? fetcher(request);
}
