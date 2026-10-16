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
