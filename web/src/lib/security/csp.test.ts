import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cspDirectives } from './csp.ts';

const config = readFileSync(new URL('../../../vite.config.ts', import.meta.url), 'utf8');

describe('cspDirectives', () => {
	it('allows only the own origin for the public edition', () => {
		const csp = cspDirectives({ localOnly: true });
		expect(csp['default-src']).toEqual(['self']);
		expect(csp['script-src']).toEqual(['self']);
		expect(csp['connect-src']).toEqual(['self']);
		expect(csp['img-src']).toEqual(['self', 'blob:', 'data:']);
		expect(csp['worker-src']).toEqual(['self', 'blob:']);
		expect(csp['object-src']).toEqual(['none']);
		expect(csp['frame-src']).toEqual(['none']);
		expect(csp['base-uri']).toEqual(['self']);
		const everything = Object.values(csp).flat();
		expect(everything.filter((value) => /^https?:\/\/|^\*$|unsafe-eval/.test(value))).toEqual([]);
		expect(csp['script-src']).not.toContain('unsafe-inline');
	});

	it('widens only connect-src for the self-hosted edition, or names the origins given', () => {
		const open = cspDirectives({ localOnly: false });
		expect(open['connect-src']).toEqual(['self', 'http:', 'https:']);
		expect({ ...open, 'connect-src': [] }).toEqual({
			...cspDirectives({ localOnly: true }),
			'connect-src': []
		});
		const named = cspDirectives({
			localOnly: false,
			connectSrc: 'https://sync.example  https://b.example'
		});
		expect(named['connect-src']).toEqual(['self', 'https://sync.example', 'https://b.example']);
	});

	it('is wired into the SvelteKit options as hashes in a meta tag', () => {
		expect(config).toMatch(/csp:\s*\{[^}]*mode:\s*'hash'/);
		expect(config).toContain('cspDirectives(');
		expect(config).toContain("process.env.LOCAL_ONLY === '1'");
	});
});
