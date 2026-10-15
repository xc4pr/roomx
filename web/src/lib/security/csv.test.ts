import { describe, expect, it } from 'vitest';
import { neutralizeFormula } from './csv.ts';

describe('neutralizeFormula', () => {
	it('marks text that a spreadsheet would run as a formula', () => {
		for (const text of [
			'=1+1',
			'+49 123',
			'-2+3',
			'@SUM(A1)',
			'\t=1',
			'\r=1',
			'=HYPERLINK("https://evil.example","x")'
		]) {
			expect(neutralizeFormula(text)).toBe(`'${text}`);
		}
	});

	it('leaves normal names alone', () => {
		for (const text of ['MALM Bettgestell 160×200', 'Regal (weiss)', '', ' =1', '1=1']) {
			expect(neutralizeFormula(text)).toBe(text);
		}
	});
});
