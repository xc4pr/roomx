import { describe, expect, it } from 'vitest';
import { resolveEdition } from './editionConfig.ts';

describe('resolveEdition', () => {
	it('defaults to pro', () => {
		expect(resolveEdition({})).toBe('pro');
	});

	it('accepts free and pro', () => {
		expect(resolveEdition({ EDITION: 'free' })).toBe('free');
		expect(resolveEdition({ EDITION: 'pro' })).toBe('pro');
	});

	it('rejects other values', () => {
		expect(() => resolveEdition({ EDITION: 'public' })).toThrow('EDITION must be');
		expect(() => resolveEdition({ EDITION: '' })).toThrow('EDITION must be');
	});

	it('rejects the removed LOCAL_ONLY switch', () => {
		expect(() => resolveEdition({ LOCAL_ONLY: '1' })).toThrow('LOCAL_ONLY was replaced');
		expect(() => resolveEdition({ LOCAL_ONLY: '' })).toThrow('LOCAL_ONLY was replaced');
	});
});
