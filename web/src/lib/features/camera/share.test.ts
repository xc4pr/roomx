import { describe, expect, it, vi } from 'vitest';
import { canShareFiles, shareFiles, uniqueNames } from './share.ts';

const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });

describe('uniqueNames', () => {
	it('numbers repeated names', () => {
		expect(uniqueNames(['a.jpg', 'b.jpg', 'a.jpg', 'a.jpg'])).toEqual([
			'a.jpg',
			'b.jpg',
			'a-2.jpg',
			'a-3.jpg'
		]);
	});
});

describe('shareFiles', () => {
	it('checks canShare with files', () => {
		expect(canShareFiles({ share: vi.fn(), canShare: () => true }, [file])).toBe(true);
		expect(canShareFiles({ share: vi.fn(), canShare: () => false }, [file])).toBe(false);
		expect(canShareFiles({ share: vi.fn() }, [file])).toBe(false);
		expect(canShareFiles({ share: vi.fn(), canShare: () => true }, [])).toBe(false);
	});

	it('shares through the share sheet when allowed', async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		const download = vi.fn();
		expect(await shareFiles([file], 'T', { share, canShare: () => true }, download)).toBe('shared');
		expect(share).toHaveBeenCalledOnce();
		expect(download).not.toHaveBeenCalled();
	});

	it('downloads when sharing files is unsupported', async () => {
		const download = vi.fn();
		expect(await shareFiles([file], 'T', {}, download)).toBe('downloaded');
		expect(download).toHaveBeenCalledWith([file]);
	});

	it('does not download after the user cancels', async () => {
		const share = vi.fn().mockRejectedValue(new DOMException('x', 'AbortError'));
		const download = vi.fn();
		expect(await shareFiles([file], 'T', { share, canShare: () => true }, download)).toBe(
			'cancelled'
		);
		expect(download).not.toHaveBeenCalled();
	});
});
