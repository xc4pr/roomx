import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LIMITS } from './limits.ts';
import { externalLink, normalizeLinkInput, safeExternalUrl } from './url.ts';

const DANGEROUS = [
	'javascript:alert(1)',
	'JaVaScRiPt:alert(document.domain)',
	' javascript:alert(1)',
	'java\nscript:alert(1)',
	'\tjavascript:alert(1)',
	'data:text/html,<script>alert(1)</script>',
	'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
	'vbscript:msgbox(1)',
	'blob:https://example.org/00000000-0000-0000-0000-000000000000',
	'file:///etc/passwd',
	'ftp://example.org/file',
	'//example.org/path',
	'https://user:secret@example.org/',
	'https:///',
	'',
	'   '
];

describe('zod and dangerous links', () => {
	it('shows why the plain url validators are not enough', () => {
		expect(z.url().safeParse('javascript:alert(1)').success).toBe(true);
		expect(z.string().url().safeParse('data:text/html,hi').success).toBe(true);
		const strict = z.url({ protocol: /^https?$/ });
		expect(strict.safeParse('javascript:alert(1)').success).toBe(false);
		expect(strict.safeParse('data:text/html,hi').success).toBe(false);
		expect(strict.safeParse('https://www.ikea.com/ch/de/').success).toBe(true);
	});
});

describe('safeExternalUrl', () => {
	it('accepts http and https links', () => {
		expect(safeExternalUrl('https://www.ikea.com/ch/de/p/malm-60394033/')).toBe(
			'https://www.ikea.com/ch/de/p/malm-60394033/'
		);
		expect(safeExternalUrl('  http://shop.example/a?b=1#c ')).toBe('http://shop.example/a?b=1#c');
		expect(safeExternalUrl('HTTPS://WWW.IKEA.COM/ch')).toBe('https://www.ikea.com/ch');
	});

	it.each(DANGEROUS)('rejects %j', (value) => {
		expect(safeExternalUrl(value)).toBeUndefined();
		expect(externalLink(value)).toBeUndefined();
	});

	it('rejects anything that is not a string and over-long links', () => {
		expect(safeExternalUrl(undefined)).toBeUndefined();
		expect(safeExternalUrl(null)).toBeUndefined();
		expect(safeExternalUrl(42)).toBeUndefined();
		expect(safeExternalUrl({ href: 'https://example.org' })).toBeUndefined();
		const tooLong = `https://example.org/${'a'.repeat(LIMITS.url)}`;
		expect(safeExternalUrl(tooLong)).toBeUndefined();
	});
});

describe('externalLink', () => {
	it('adds the attributes every external link needs', () => {
		expect(externalLink('https://example.org/x')).toEqual({
			href: 'https://example.org/x',
			target: '_blank',
			rel: 'noopener noreferrer',
			referrerpolicy: 'no-referrer'
		});
	});
});

describe('normalizeLinkInput', () => {
	it('repairs a link typed without a scheme', () => {
		expect(normalizeLinkInput('ikea.ch/de/p/1')).toBe('https://ikea.ch/de/p/1');
		expect(normalizeLinkInput('www.ikea.com')).toBe('https://www.ikea.com');
		expect(normalizeLinkInput('shop.example:8080/x')).toBe('https://shop.example:8080/x');
	});

	it('keeps valid links as typed and drops unusable ones', () => {
		expect(normalizeLinkInput(' https://www.ikea.com ')).toBe('https://www.ikea.com');
		expect(normalizeLinkInput('nonsense')).toBeUndefined();
		for (const value of DANGEROUS) expect(normalizeLinkInput(value)).toBeUndefined();
		expect(normalizeLinkInput('java.script:alert(1)')).toBeUndefined();
	});
});
