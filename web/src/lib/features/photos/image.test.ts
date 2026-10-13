import { describe, expect, it } from 'vitest';
import { fitSize, isHeic, MAX_EDGE, MAX_FILE_BYTES, precheck } from './image.ts';

describe('fitSize', () => {
	it('keeps small images', () => {
		expect(fitSize(1600, 1200, MAX_EDGE)).toEqual({ w: 1600, h: 1200 });
	});

	it('scales landscape and portrait to the long edge', () => {
		expect(fitSize(4032, 3024, MAX_EDGE)).toEqual({ w: 2560, h: 1920 });
		expect(fitSize(3024, 4032, MAX_EDGE)).toEqual({ w: 1920, h: 2560 });
		expect(fitSize(8000, 2000, 320)).toEqual({ w: 320, h: 80 });
	});

	it('never produces a zero side', () => {
		expect(fitSize(10000, 1, 320)).toEqual({ w: 320, h: 1 });
	});
});

describe('precheck', () => {
	const file = (name: string, type: string, size = 1000) => ({ name, type, size });

	it('accepts common images', () => {
		expect(precheck(file('a.jpg', 'image/jpeg'))).toBeNull();
		expect(precheck(file('IMG_1.PNG', ''))).toBeNull();
	});

	it('rejects empty, oversized and non-image files', () => {
		expect(precheck(file('a.jpg', 'image/jpeg', 0))).toBe('empty');
		expect(precheck(file('a.jpg', 'image/jpeg', MAX_FILE_BYTES + 1))).toBe('tooLarge');
		expect(precheck(file('a.pdf', 'application/pdf'))).toBe('notImage');
		expect(precheck(file('notes', ''))).toBe('notImage');
	});

	it('lets HEIC through to the decoder', () => {
		expect(isHeic(file('a.HEIC', ''))).toBe(true);
		expect(isHeic(file('a.bin', 'image/heif'))).toBe(true);
		expect(precheck(file('a.heic', 'image/heic'))).toBeNull();
	});
});
