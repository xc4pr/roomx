import { normalizeLinkInput, safeExternalUrl } from '#lib/security/url.ts';

export function parsePrice(text: string): number | undefined {
	const cleaned = text
		.trim()
		.replace(/[^\d.,]/g, '')
		.replace(',', '.');
	if (cleaned === '') return undefined;
	const value = Number.parseFloat(cleaned);
	return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : undefined;
}

export function parseCount(text: string): number | undefined {
	const value = Number.parseInt(text.trim(), 10);
	return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function parseDegrees(text: string): number | undefined {
	const value = Number.parseFloat(text.trim().replace(',', '.').replace('°', ''));
	return Number.isFinite(value) ? value : undefined;
}

export type LinkInput = { kind: 'empty' } | { kind: 'ok'; url: string } | { kind: 'invalid' };

export function parseLinkInput(text: string): LinkInput {
	if (text.trim() === '') return { kind: 'empty' };
	const url = safeExternalUrl(normalizeLinkInput(text));
	return url ? { kind: 'ok', url } : { kind: 'invalid' };
}

export function formatMonthYear(month: string, language: 'de' | 'en'): string {
	const [year, number] = month.split('-').map(Number);
	if (!year || !number) return month;
	return new Intl.DateTimeFormat(language === 'de' ? 'de-CH' : 'en-CH', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(Date.UTC(year, number - 1, 1)));
}
