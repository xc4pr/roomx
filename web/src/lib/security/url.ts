import { LIMITS } from './limits.ts';

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const BARE_HOST = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#]|$)/i;

export const EXTERNAL_LINK_ATTRIBUTES = {
	target: '_blank',
	rel: 'noopener noreferrer',
	referrerpolicy: 'no-referrer'
} as const;

export type ExternalLink = { href: string } & typeof EXTERNAL_LINK_ATTRIBUTES;

export function safeExternalUrl(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const text = value.trim();
	if (text === '' || text.length > LIMITS.url) return undefined;
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		return undefined;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
	if (url.hostname === '' || url.username !== '' || url.password !== '') return undefined;
	return url.href;
}

export function externalLink(value: unknown): ExternalLink | undefined {
	const href = safeExternalUrl(value);
	return href ? { href, ...EXTERNAL_LINK_ATTRIBUTES } : undefined;
}

export function normalizeLinkInput(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const text = value.trim();
	if (text === '') return undefined;
	if (BARE_HOST.test(text)) {
		const candidate = `https://${text}`;
		return safeExternalUrl(candidate) ? candidate : undefined;
	}
	return SCHEME.test(text) && safeExternalUrl(text) ? text : undefined;
}
