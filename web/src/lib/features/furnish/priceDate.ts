import { CATALOG_PRICES_AS_OF } from '#lib/catalog/index.ts';
import { locale } from '#lib/i18n/index.svelte.ts';
import { formatMonthYear } from './format.ts';

export function pricesAsOf(): string {
	return formatMonthYear(CATALOG_PRICES_AS_OF, locale.language);
}
