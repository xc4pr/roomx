import { describe, expect, it } from 'vitest';
import { afterPendingSaves } from './update.svelte.ts';

describe('afterPendingSaves', () => {
	it('waits for the pending saves before it lets the reload go ahead', async () => {
		const order: string[] = [];
		let finish: () => void = () => undefined;
		const flush = () =>
			new Promise<void>((resolve) => {
				finish = () => {
					order.push('saved');
					resolve();
				};
			});
		const done = afterPendingSaves(flush, 1000).then(() => order.push('reload'));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(order).toEqual([]);
		finish();
		await done;
		expect(order).toEqual(['saved', 'reload']);
	});

	it('does not hang on a save that never finishes', async () => {
		const started = Date.now();
		await afterPendingSaves(() => new Promise<void>(() => undefined), 30);
		expect(Date.now() - started).toBeLessThan(500);
	});

	it('goes ahead when saving fails', async () => {
		await expect(
			afterPendingSaves(() => Promise.reject(new Error('full')), 1000)
		).resolves.toBeUndefined();
	});
});
