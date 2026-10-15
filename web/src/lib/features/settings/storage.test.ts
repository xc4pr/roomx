import { describe, expect, it } from 'vitest';
import { formatBytes, quotaLevel, quotaShare } from './storage.ts';

describe('formatBytes', () => {
	it('picks a readable unit', () => {
		expect(formatBytes(0, 'en')).toBe('0 B');
		expect(formatBytes(1500, 'en')).toBe('1.5 KB');
		expect(formatBytes(12_340_000, 'en')).toBe('12.3 MB');
		expect(formatBytes(4_000_000_000, 'en')).toBe('4 GB');
	});

	it('uses the decimal comma in German', () => {
		expect(formatBytes(1500, 'de')).toBe('1,5 KB');
	});
});

describe('quotaLevel', () => {
	it('warns from 80 percent and flags a nearly full store at 95 percent', () => {
		expect(quotaLevel({ usage: 10, quota: 100 })).toBe('ok');
		expect(quotaLevel({ usage: 79, quota: 100 })).toBe('ok');
		expect(quotaLevel({ usage: 80, quota: 100 })).toBe('warn');
		expect(quotaLevel({ usage: 94, quota: 100 })).toBe('warn');
		expect(quotaLevel({ usage: 95, quota: 100 })).toBe('full');
		expect(quotaLevel({ usage: 120, quota: 100 })).toBe('full');
	});

	it('says nothing when the browser does not tell', () => {
		expect(quotaLevel({ usage: null, quota: null })).toBe('unknown');
		expect(quotaLevel({ usage: 5, quota: 0 })).toBe('unknown');
		expect(quotaShare({ usage: null, quota: 10 })).toBeNull();
		expect(quotaShare({ usage: 5, quota: 10 })).toBe(0.5);
	});
});
