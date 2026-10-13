import type { Messages } from '#lib/i18n/index.svelte.ts';
import type { Language } from '#lib/core/units.ts';

export type Translate<K extends string> = (
	key: K,
	params?: Record<string, string | number>
) => string;

export function translator<K extends string>(
	messages: Messages<K>,
	language: Language
): Translate<K> {
	return (key, params) => {
		const template = messages[language][key];
		if (!params) return template;
		return template.replace(/\{(\w+)\}/g, (match, name: string) =>
			name in params ? String(params[name]) : match
		);
	};
}
