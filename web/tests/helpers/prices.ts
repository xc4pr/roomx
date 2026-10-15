import { lookup } from '#lib/catalog/index.ts';
import { formatChf } from '#lib/core/units.ts';

export function catalogTotal(catalogIds: readonly string[]): { sum: number; estimated: boolean } {
	let sum = 0;
	let estimated = false;
	for (const catalogId of catalogIds) {
		const entry = lookup(catalogId);
		if (entry?.priceChf === undefined) throw new Error(`${catalogId} has no catalog price`);
		sum += entry.priceChf;
		if (!entry.verified) estimated = true;
	}
	return { sum: Math.round(sum * 100) / 100, estimated };
}

export function chf(amount: number): string {
	return formatChf(amount, 'de');
}

export function budgetText(catalogIds: readonly string[]): string {
	const { sum, estimated } = catalogTotal(catalogIds);
	return `${estimated ? 'ca. ' : ''}${chf(sum)}`;
}
