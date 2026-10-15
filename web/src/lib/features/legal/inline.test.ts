import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import InlineText from './InlineText.svelte';
import { parseInline } from './logic.ts';

function html(text: string): string {
	return render(InlineText, { props: { text } }).body;
}

describe('parseInline links', () => {
	it('turns links with other schemes into plain text', () => {
		for (const href of ['javascript:alert(1)', 'data:text/html,boom', 'ftp://example.ch/a']) {
			const segments = parseInline(`[klick](${href})`);
			expect(
				segments.some((segment) => segment.kind === 'link'),
				href
			).toBe(false);
			expect(segments[0]).toEqual({ kind: 'text', text: 'klick' });
		}
	});

	it('keeps http, https and mail links', () => {
		const kinds = parseInline('[a](https://a.ch) [b](http://b.ch) [c](mailto:c@d.ch)').flatMap(
			(segment) => (segment.kind === 'link' ? [segment.external] : [])
		);
		expect(kinds).toEqual([true, true, false]);
	});
});

describe('InlineText', () => {
	it('does not render a javascript link', () => {
		const out = html('[klick](javascript:alert(1))');
		expect(out).not.toContain('javascript');
		expect(out).not.toContain('<a');
		expect(out).toContain('klick');
	});

	it('opens external links safely', () => {
		const out = html('[GitHub](https://github.com/xc4pr/roomx)');
		expect(out).toContain('href="https://github.com/xc4pr/roomx"');
		expect(out).toContain('target="_blank"');
		expect(out).toContain('rel="noopener noreferrer"');
		expect(out).toContain('referrerpolicy="no-referrer"');
	});

	it('keeps mail links in the same tab', () => {
		const out = html('[Mail](mailto:a@b.ch)');
		expect(out).toContain('href="mailto:a@b.ch"');
		expect(out).not.toContain('target=');
	});
});
