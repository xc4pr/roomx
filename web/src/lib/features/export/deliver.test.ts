import { afterEach, describe, expect, it, vi } from 'vitest';
import { canShareFiles, copyText, shareFiles, toFiles } from './deliver.ts';

afterEach(() => vi.unstubAllGlobals());

const files = toFiles([{ name: 'a.json', data: new Uint8Array([1, 2]), type: 'application/json' }]);

describe('deliver', () => {
	it('builds files with name and type', () => {
		expect(files[0].name).toBe('a.json');
		expect(files[0].type).toBe('application/json');
		expect(files[0].size).toBe(2);
	});

	it('uses the share sheet only when the files can be shared', () => {
		vi.stubGlobal('navigator', { share: vi.fn(), canShare: () => true });
		expect(canShareFiles(files)).toBe(true);
		vi.stubGlobal('navigator', { share: vi.fn(), canShare: () => false });
		expect(canShareFiles(files)).toBe(false);
		vi.stubGlobal('navigator', {});
		expect(canShareFiles(files)).toBe(false);
	});

	it('treats a dismissed share sheet as cancelled and rethrows other errors', async () => {
		vi.stubGlobal('navigator', {
			share: vi.fn().mockRejectedValue(new DOMException('x', 'AbortError'))
		});
		expect(await shareFiles(files, 't')).toBe('cancelled');
		vi.stubGlobal('navigator', {
			share: vi.fn().mockRejectedValue(new DOMException('x', 'NotAllowedError'))
		});
		await expect(shareFiles(files, 't')).rejects.toThrow();
		const share = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { share });
		expect(await shareFiles(files, 'title')).toBe('shared');
		expect(share).toHaveBeenCalledWith({ files, title: 'title' });
	});
});

describe('copyText', () => {
	it('writes to the clipboard when it is available', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { clipboard: { writeText } });
		expect(await copyText('Prompt')).toBe(true);
		expect(writeText).toHaveBeenCalledWith('Prompt');
	});

	it('reports false without the clipboard API or when it refuses', async () => {
		vi.stubGlobal('navigator', {});
		expect(await copyText('x')).toBe(false);
		vi.stubGlobal('navigator', {
			clipboard: { writeText: vi.fn().mockRejectedValue(new DOMException('x', 'NotAllowedError')) }
		});
		expect(await copyText('x')).toBe(false);
	});
});
