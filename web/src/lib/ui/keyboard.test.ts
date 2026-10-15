import { describe, expect, it } from 'vitest';
import { keyboardInset, revealDelta } from './keyboard.ts';

describe('keyboardInset', () => {
	it('reports zero without a keyboard and for browser chrome changes', () => {
		expect(keyboardInset(844, 844, 0)).toBe(0);
		expect(keyboardInset(844, 780, 0)).toBe(0);
	});

	it('reports the covered height when the visual viewport shrinks', () => {
		expect(keyboardInset(844, 508, 0)).toBe(336);
		expect(keyboardInset(844, 508, 40)).toBe(296);
	});
});

describe('revealDelta', () => {
	const visible = { top: 0, bottom: 500 };

	it('leaves a field that is already visible alone', () => {
		expect(revealDelta({ top: 200, bottom: 250 }, visible)).toBe(0);
	});

	it('scrolls down just enough to lift a covered field above the keyboard', () => {
		expect(revealDelta({ top: 520, bottom: 570 }, visible)).toBe(90);
	});

	it('never scrolls the field past the top of the band', () => {
		expect(revealDelta({ top: 30, bottom: 700 }, visible)).toBe(10);
	});

	it('scrolls up when the field sits above the band', () => {
		expect(revealDelta({ top: -40, bottom: 10 }, visible)).toBe(-60);
	});
});
