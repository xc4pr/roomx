import { describe, expect, it } from 'vitest';
import { onPhoneRoute, parseRoute } from './route.ts';

describe('parseRoute', () => {
	it('recognises the top-level screens', () => {
		expect(parseRoute('/')).toEqual({ screen: 'projects', projectId: null });
		expect(parseRoute('/settings')).toEqual({ screen: 'settings', projectId: null });
		expect(parseRoute('/nope')).toEqual({ screen: 'other', projectId: null });
	});

	it('recognises project screens and their id', () => {
		expect(parseRoute('/p/abc')).toEqual({ screen: 'plan', projectId: 'abc' });
		expect(parseRoute('/p/abc/')).toEqual({ screen: 'plan', projectId: 'abc' });
		expect(parseRoute('/p/abc/3d')).toEqual({ screen: '3d', projectId: 'abc' });
		expect(parseRoute('/p/abc/furnish')).toEqual({ screen: 'furnish', projectId: 'abc' });
		expect(parseRoute('/p/a%20b/share')).toEqual({ screen: 'share', projectId: 'a b' });
		expect(parseRoute('/p/abc/other')).toEqual({ screen: 'other', projectId: null });
	});

	it('strips a base path', () => {
		expect(parseRoute('/roomx', '/roomx')).toEqual({ screen: 'projects', projectId: null });
		expect(parseRoute('/roomx/', '/roomx')).toEqual({ screen: 'projects', projectId: null });
		expect(parseRoute('/roomx/p/x/furnish', '/roomx')).toEqual({
			screen: 'furnish',
			projectId: 'x'
		});
	});
});

describe('onPhoneRoute', () => {
	it('is true for the photo pages and pairing links', () => {
		expect(onPhoneRoute('/m/abc')).toBe(true);
		expect(onPhoneRoute('/app/m/abc', '/app')).toBe(true);
		expect(onPhoneRoute('/', '', '#pair=xyz')).toBe(true);
	});

	it('is false elsewhere', () => {
		expect(onPhoneRoute('/')).toBe(false);
		expect(onPhoneRoute('/p/m/abc')).toBe(false);
		expect(onPhoneRoute('/', '', '#other')).toBe(false);
	});
});
