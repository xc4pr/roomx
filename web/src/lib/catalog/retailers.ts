import { catalog } from './index.ts';

export function catalogRetailers(entries: readonly { brand: string }[]): string[] {
	const brands = [...new Set(entries.map((entry) => entry.brand))].filter(
		(brand) => brand !== 'Generic'
	);
	const rest = brands
		.filter((brand) => brand !== 'IKEA')
		.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
	return brands.includes('IKEA') ? ['IKEA', ...rest] : rest;
}

export const RETAILERS: readonly string[] = catalogRetailers(catalog);
