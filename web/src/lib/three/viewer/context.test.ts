import { describe, expect, it } from 'vitest';
import {
	contextLost,
	contextRestored,
	contextTimeout,
	initialContext,
	LOSS_WINDOW_MS,
	lossIsRepeating,
	remainingMs,
	RESTORE_TIMEOUT_MS
} from './context.ts';

describe('context loss state', () => {
	it('starts in the ok phase', () => {
		expect(initialContext().phase).toBe('ok');
	});

	it('enters the lost phase and remembers when', () => {
		const state = contextLost(initialContext(), 1000);
		expect(state.phase).toBe('lost');
		expect(state.lostAt).toBe(1000);
	});

	it('returns to ok when the context is restored', () => {
		const state = contextRestored(contextLost(initialContext(), 1000));
		expect(state.phase).toBe('ok');
		expect(state.lostAt).toBeNull();
	});

	it('keeps waiting until the timeout has passed', () => {
		const lost = contextLost(initialContext(), 1000);
		expect(contextTimeout(lost, 1000 + RESTORE_TIMEOUT_MS - 1).phase).toBe('lost');
		expect(contextTimeout(lost, 1000 + RESTORE_TIMEOUT_MS).phase).toBe('failed');
	});

	it('reports the time left before giving up', () => {
		const lost = contextLost(initialContext(), 1000);
		expect(remainingMs(lost, 1000)).toBe(RESTORE_TIMEOUT_MS);
		expect(remainingMs(lost, 1000 + RESTORE_TIMEOUT_MS + 50)).toBe(0);
		expect(remainingMs(initialContext(), 5000)).toBe(0);
	});

	it('ignores the timeout once the context is back', () => {
		const ok = contextRestored(contextLost(initialContext(), 0));
		expect(contextTimeout(ok, RESTORE_TIMEOUT_MS * 10).phase).toBe('ok');
	});

	it('recovers from the failed phase when the context comes back late', () => {
		const failed = contextTimeout(contextLost(initialContext(), 0), RESTORE_TIMEOUT_MS);
		expect(failed.phase).toBe('failed');
		expect(contextRestored(failed).phase).toBe('ok');
	});

	it('does not restart the wait on a second loss event', () => {
		const first = contextLost(initialContext(), 1000);
		const again = contextLost(first, 3000);
		expect(again.lostAt).toBe(1000);
		expect(again.phase).toBe('lost');
	});

	it('stays failed when another loss arrives', () => {
		const failed = contextTimeout(contextLost(initialContext(), 0), RESTORE_TIMEOUT_MS);
		expect(contextLost(failed, RESTORE_TIMEOUT_MS + 10).phase).toBe('failed');
	});

	it('detects repeated losses within the window', () => {
		let state = contextLost(initialContext(), 1000);
		expect(lossIsRepeating(state, 1000)).toBe(false);
		state = contextLost(contextRestored(state), 9000);
		expect(lossIsRepeating(state, 9000)).toBe(true);
	});

	it('forgets old losses', () => {
		let state = contextLost(initialContext(), 0);
		state = contextLost(contextRestored(state), LOSS_WINDOW_MS + 1);
		expect(lossIsRepeating(state, LOSS_WINDOW_MS + 1)).toBe(false);
		expect(state.recent).toEqual([LOSS_WINDOW_MS + 1]);
	});
});
