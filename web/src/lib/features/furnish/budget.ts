import type { CatalogLookup } from '#lib/core/catalog.ts';
import type { Item, Variant } from '#lib/core/schema.ts';

export interface Total {
	sum: number;
	estimated: boolean;
	unpriced: number;
	count: number;
}

export function itemPrice(item: Item, lookup: CatalogLookup): number | undefined {
	if (item.priceChf !== undefined) return item.priceChf;
	return item.catalogId ? lookup(item.catalogId)?.priceChf : undefined;
}

export function isEstimate(item: Item, lookup: CatalogLookup): boolean {
	if (!item.catalogId) return false;
	const entry = lookup(item.catalogId);
	return entry ? !entry.verified : true;
}

export function isUnverified(item: Item, lookup: CatalogLookup): boolean {
	if (!item.catalogId) return false;
	const entry = lookup(item.catalogId);
	return entry ? !entry.verified : false;
}

export function variantTotal(items: readonly Item[], lookup: CatalogLookup): Total {
	let sum = 0;
	let estimated = false;
	let unpriced = 0;
	for (const item of items) {
		const price = itemPrice(item, lookup);
		if (price === undefined) {
			unpriced += 1;
			continue;
		}
		sum += price;
		if (isEstimate(item, lookup)) estimated = true;
	}
	return { sum: Math.round(sum * 100) / 100, estimated, unpriced, count: items.length };
}

export interface BudgetState {
	budget: number | undefined;
	ratio: number;
	over: boolean;
	remaining: number | undefined;
}

export function budgetState(sum: number, budget: number | undefined): BudgetState {
	if (budget === undefined || budget <= 0) {
		return { budget: undefined, ratio: 0, over: false, remaining: undefined };
	}
	return {
		budget,
		ratio: Math.min(1, sum / budget),
		over: sum > budget,
		remaining: Math.round((budget - sum) * 100) / 100
	};
}

export function nextVariantName(variants: readonly Pick<Variant, 'name'>[]): string {
	const taken = new Set(variants.map((variant) => variant.name.trim().toUpperCase()));
	for (let i = 0; i < 26 * 26; i++) {
		const name =
			i < 26
				? String.fromCharCode(65 + i)
				: `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`;
		if (!taken.has(name)) return name;
	}
	return `${variants.length + 1}`;
}
