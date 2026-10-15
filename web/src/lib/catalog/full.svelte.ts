import { t } from '#lib/i18n/index.svelte.ts';
import fullUrl from './data/full.json?url&no-inline';
import { messages } from './i18n.ts';
import { registerEntries } from './index.ts';

export interface FullCatalogState {
	ready: boolean;
	error: string | null;
	count: number;
}

export const fullCatalog = $state<FullCatalogState>({ ready: false, error: null, count: 0 });

export type FullCatalogSource = () => Promise<unknown>;

async function defaultSource(): Promise<unknown> {
	if (import.meta.env.DEV) return (await import('./data/full.json')).default;
	const response = await fetch(fullUrl);
	if (!response.ok) throw new Error(`catalog ${response.status}`);
	return response.json();
}

let pending: Promise<void> | undefined;

export function ensureFullCatalog(source: FullCatalogSource = defaultSource): Promise<void> {
	pending ??= load(source);
	return pending;
}

async function load(source: FullCatalogSource): Promise<void> {
	try {
		const raw = await source();
		if (!Array.isArray(raw)) throw new Error('catalog is not a list');
		const result = registerEntries(raw);
		fullCatalog.count = result.accepted.length;
		fullCatalog.error =
			result.rejected > 0 ? t(messages, 'someRejected', { n: result.rejected }) : null;
	} catch {
		fullCatalog.error = t(messages, 'loadFailed');
		pending = undefined;
	}
	fullCatalog.ready = true;
}

export function resetFullCatalog(): void {
	pending = undefined;
	fullCatalog.ready = false;
	fullCatalog.error = null;
	fullCatalog.count = 0;
}
