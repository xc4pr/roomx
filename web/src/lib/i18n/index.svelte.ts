import type { Language } from '#lib/core/units.ts';

export type Messages<K extends string = string> = Record<Language, Record<K, string>>;

export function defineMessages<const K extends string>(messages: {
	de: Record<K, string>;
	en: Record<K, string>;
}): Messages<K> {
	return messages;
}

export function detectLanguage(candidates: readonly string[] = navigator.languages): Language {
	return (candidates[0] ?? 'en').toLowerCase().startsWith('de') ? 'de' : 'en';
}

export const locale = $state<{ language: Language }>({ language: 'de' });

export function setLanguage(language: Language): void {
	locale.language = language;
	if (typeof document !== 'undefined') document.documentElement.lang = language;
}

export function t<K extends string>(
	messages: Messages<K>,
	key: K,
	params?: Record<string, string | number>
): string {
	const template = messages[locale.language][key];
	if (!params) return template;
	return template.replace(/\{(\w+)\}/g, (match, name: string) =>
		name in params ? String(params[name]) : match
	);
}

export function pick(text: { de: string; en: string }): string {
	return text[locale.language];
}
