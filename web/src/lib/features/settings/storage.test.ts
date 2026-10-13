import { describe, expect, it } from 'vitest';
import { formatBytes } from './storage.ts';

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
