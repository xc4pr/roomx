export class NetworkError extends Error {}

export function withTimeout<T>(
	ms: number,
	external: AbortSignal | undefined,
	work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
	const controller = new AbortController();
	return new Promise<T>((resolve, reject) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const settle = (action: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			external?.removeEventListener('abort', fail);
			action();
		};
		function fail(): void {
			settle(() => {
				controller.abort();
				reject(new NetworkError('timeout'));
			});
		}
		if (external?.aborted) {
			fail();
			return;
		}
		timer = setTimeout(fail, ms);
		external?.addEventListener('abort', fail, { once: true });
		work(controller.signal).then(
			(value) => settle(() => resolve(value)),
			(error: unknown) => settle(() => reject(error))
		);
	});
}
