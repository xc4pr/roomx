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

export function safeUrl(text: string | undefined): string | undefined {
	if (!text) return undefined;
	try {
		const url = new URL(text);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
	} catch {
		return undefined;
	}
}
