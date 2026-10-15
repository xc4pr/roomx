export function media(query: string): { readonly matches: boolean } {
	const list = typeof matchMedia === 'undefined' ? null : matchMedia(query);
	let matches = $state(list?.matches ?? false);

	$effect(() => {
		if (!list) return;
		matches = list.matches;
		const listener = (event: MediaQueryListEvent) => (matches = event.matches);
		list.addEventListener('change', listener);
		return () => list.removeEventListener('change', listener);
	});

	return {
		get matches() {
			return matches;
		}
	};
}
