import { CatalogEntrySchema, type CatalogEntry } from '#lib/core/catalog.ts';

export interface MergeResult {
	accepted: CatalogEntry[];
	rejected: number;
	duplicates: number;
}

export function articleKey(entry: Pick<CatalogEntry, 'brand' | 'articleNo'>): string | undefined {
	return entry.articleNo
		? `${entry.brand.toLowerCase()}|${entry.articleNo.toLowerCase().replace(/[.\s]/g, '')}`
		: undefined;
}

export function mergeEntries(
	known: readonly CatalogEntry[],
	candidates: readonly unknown[],
	isKnownId: (id: string) => boolean = () => false
): MergeResult {
	const ids = new Set(known.map((entry) => entry.id));
	const articles = new Set<string>();
	for (const entry of known) {
		const key = articleKey(entry);
		if (key) articles.add(key);
	}
	const accepted: CatalogEntry[] = [];
	let rejected = 0;
	let duplicates = 0;
	for (const candidate of candidates) {
		const parsed = CatalogEntrySchema.safeParse(candidate);
		if (!parsed.success) {
			rejected += 1;
			continue;
		}
		const entry = parsed.data;
		const key = articleKey(entry);
		if (ids.has(entry.id) || isKnownId(entry.id) || (key && articles.has(key))) {
			duplicates += 1;
			continue;
		}
		ids.add(entry.id);
		if (key) articles.add(key);
		accepted.push(entry);
	}
	return { accepted, rejected, duplicates };
}
