export type LengthUnit = 'cm' | 'm';
export type Language = 'de' | 'en';

const LOCALES: Record<Language, string> = { de: 'de-CH', en: 'en-CH' };

function decimalSeparator(language: Language): string {
	return language === 'de' ? ',' : '.';
}

function formatNumber(value: number, maxDecimals: number, language: Language): string {
	const fixed = value.toFixed(maxDecimals);
	const trimmed = maxDecimals > 0 ? fixed.replace(/\.?0+$/, '') : fixed;
	return trimmed.replace('.', decimalSeparator(language));
}

export function lengthValue(mm: number, unit: LengthUnit, language: Language): string {
	return unit === 'cm' ? formatNumber(mm / 10, 1, language) : formatNumber(mm / 1000, 3, language);
}

export function formatLength(mm: number, unit: LengthUnit, language: Language): string {
	return `${lengthValue(mm, unit, language)} ${unit}`;
}

export function parseLength(input: string, unit: LengthUnit): number | undefined {
	const cleaned = input
		.trim()
		.replace(/\s|cm|m/gi, '')
		.replace(',', '.');
	if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(cleaned)) return undefined;
	const value = Number.parseFloat(cleaned);
	if (!Number.isFinite(value)) return undefined;
	return Math.round(value * (unit === 'cm' ? 10 : 1000));
}

export function formatArea(mm2: number, language: Language): string {
	return `${formatNumber(mm2 / 1_000_000, 2, language)} m²`;
}

export function formatChf(amount: number, language: Language): string {
	return new Intl.NumberFormat(LOCALES[language], {
		style: 'currency',
		currency: 'CHF',
		maximumFractionDigits: Number.isInteger(amount) ? 0 : 2
	}).format(amount);
}

export function formatDate(iso: string, language: Language): string {
	return new Intl.DateTimeFormat(LOCALES[language], { dateStyle: 'medium' }).format(new Date(iso));
}
