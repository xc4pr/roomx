import { LIMITS } from './limits.ts';

export const COLOR_PATTERN =
	/^(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,24}|(?:rgb|hsl)a?\([0-9 ,.%/]{1,40}\))$/;

export function safeColor(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const text = value.trim();
	return text.length <= LIMITS.color && COLOR_PATTERN.test(text) ? text : undefined;
}
