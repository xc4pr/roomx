import { describe, expect, it } from 'vitest';
import { qrPath } from './qr.ts';

describe('qrPath', () => {
	it('is empty without dark modules', () => {
		expect(qrPath([])).toBe('');
		expect(qrPath([[false, false]])).toBe('');
	});

	it('merges horizontal runs into one rectangle', () => {
		expect(qrPath([[false, true, true, false]])).toBe('M1 0h2v1h-2z');
	});

	it('emits one rectangle per run and row', () => {
		expect(
			qrPath([
				[true, false, true],
				[false, true, false]
			])
		).toBe('M0 0h1v1h-1zM2 0h1v1h-1zM1 1h1v1h-1z');
	});
});
