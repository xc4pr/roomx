import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CONFLICT_DISPLAY_MS,
	LOCAL_CHANGE_DELAY_MS,
	SyncController,
	type Resolution,
	type SyncSnapshot
} from './controller.ts';
import type { RunOutcome, RunResult } from './runner.ts';

function result(outcome: RunOutcome = 'ok', patch: Partial<RunResult> = {}): RunResult {
	return {
		outcome,
		conflicts: [],
		pulled: [],
		photoHashes: [],
		pushed: 0,
		failed: 0,
		again: false,
		...patch
	};
}

function build(initial: { target?: boolean; results?: RunResult[] } = {}) {
	const state = { target: initial.target ?? true, retry: false };
	const queue = [...(initial.results ?? [])];
	const run = vi.fn(async () => queue.shift() ?? result());
	const resolveTarget = vi.fn(async (): Promise<Resolution<object>> =>
		state.retry
			? { kind: 'retry' }
			: state.target
				? { kind: 'target', target: {} }
				: { kind: 'off' }
	);
	const reports: SyncSnapshot[] = [];
	const abortRun = vi.fn();
	const controller = new SyncController({
		resolveTarget,
		abortRun,
		run,
		report: (snapshot) => reports.push(snapshot)
	});
	return { controller, run, resolveTarget, abortRun, reports, state, last: () => reports.at(-1)! };
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-10-30T10:00:00.000Z'));
});

afterEach(() => {
	vi.useRealTimers();
});

describe('SyncController', () => {
	it('stays off and makes no run without a target', async () => {
		const { controller, run, last } = build({ target: false });
		await controller.syncNow();
		expect(run).not.toHaveBeenCalled();
		expect(last().status).toBe('off');
	});

	it('goes to synced and records the time after a good run', async () => {
		const { controller, last } = build();
		await controller.syncNow();
		expect(last().status).toBe('synced');
		expect(last().lastSyncedAt).toBe('2026-10-30T10:00:00.000Z');
	});

	it('shows pending while running', async () => {
		const { controller, reports } = build();
		await controller.syncNow();
		expect(reports.map((entry) => entry.status)).toContain('pending');
		expect(reports.some((entry) => entry.running)).toBe(true);
	});

	it('syncs five seconds after a local change', async () => {
		const { controller, run } = build();
		await controller.syncNow();
		run.mockClear();
		controller.localChange();
		expect(controller.status).toBe('pending');
		await vi.advanceTimersByTimeAsync(LOCAL_CHANGE_DELAY_MS - 1);
		expect(run).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(run).toHaveBeenCalledTimes(1);
		expect(controller.status).toBe('synced');
	});

	it('ignores local changes while off', async () => {
		const { controller, run } = build({ target: false });
		await controller.syncNow();
		controller.localChange();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(run).not.toHaveBeenCalled();
	});

	it('never runs in parallel and repeats once afterwards', async () => {
		const { controller, run } = build();
		let release: () => void = () => {};
		run.mockImplementationOnce(
			() =>
				new Promise<RunResult>((resolve) => {
					release = () => resolve(result());
				})
		);
		const first = controller.syncNow();
		await vi.advanceTimersByTimeAsync(0);
		const second = controller.syncNow();
		const third = controller.syncNow();
		expect(run).toHaveBeenCalledTimes(1);
		release();
		await Promise.all([first, second, third]);
		await vi.advanceTimersByTimeAsync(0);
		expect(run).toHaveBeenCalledTimes(2);
	});

	it('retries with growing delays after failures and recovers', async () => {
		const { controller, run, last } = build({
			results: [result('offline'), result('offline'), result('offline'), result()]
		});
		await controller.syncNow();
		expect(last().status).toBe('offline');
		await vi.advanceTimersByTimeAsync(4_999);
		expect(run).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(run).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(9_999);
		expect(run).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(run).toHaveBeenCalledTimes(3);
		await vi.advanceTimersByTimeAsync(20_000);
		expect(run).toHaveBeenCalledTimes(4);
		expect(last().status).toBe('synced');
		await vi.advanceTimersByTimeAsync(600_000);
		expect(run).toHaveBeenCalledTimes(4);
	});

	it('flags a rejected token and keeps retrying', async () => {
		const { controller, run, last } = build({ results: [result('unauthorized')] });
		await controller.syncNow();
		expect(last()).toMatchObject({ status: 'offline', unauthorized: true });
		await vi.advanceTimersByTimeAsync(5_000);
		expect(run).toHaveBeenCalledTimes(2);
		expect(last()).toMatchObject({ status: 'synced', unauthorized: false });
	});

	it('stays pending after per-project failures', async () => {
		const { controller, last } = build({ results: [result('error', { failed: 1 })] });
		await controller.syncNow();
		expect(last().status).toBe('pending');
	});

	it('shows a conflict briefly', async () => {
		const conflict = { originalId: 'a', originalName: 'A', copyId: 'b', name: 'A (K)' };
		const { controller, last } = build({
			results: [result('ok', { conflicts: [conflict], again: true })]
		});
		await controller.syncNow();
		expect(last().status).toBe('conflict');
		await vi.advanceTimersByTimeAsync(0);
		expect(last().status).toBe('conflict');
		await vi.advanceTimersByTimeAsync(CONFLICT_DISPLAY_MS);
		expect(last().status).toBe('synced');
	});

	it('reconnect and foreground trigger an immediate run', async () => {
		const { controller, run } = build();
		await controller.syncNow();
		run.mockClear();
		controller.reconnect();
		await vi.advanceTimersByTimeAsync(0);
		expect(run).toHaveBeenCalledTimes(1);
		controller.foreground();
		await vi.advanceTimersByTimeAsync(0);
		expect(run).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(11_000);
		controller.foreground();
		await vi.advanceTimersByTimeAsync(0);
		expect(run).toHaveBeenCalledTimes(2);
	});

	it('stops everything after dispose', async () => {
		const { controller, run } = build();
		controller.schedule(1_000);
		controller.dispose();
		await vi.advanceTimersByTimeAsync(10_000);
		await controller.syncNow();
		expect(run).not.toHaveBeenCalled();
	});

	it('retries silently with backoff while the target cannot be resolved yet', async () => {
		const { controller, run, resolveTarget, state, last } = build();
		state.retry = true;
		await controller.syncNow();
		expect(last().status).toBe('off');
		await vi.advanceTimersByTimeAsync(5_000);
		expect(resolveTarget).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(resolveTarget).toHaveBeenCalledTimes(3);
		expect(run).not.toHaveBeenCalled();
		state.retry = false;
		controller.reconnect();
		await vi.advanceTimersByTimeAsync(0);
		expect(run).toHaveBeenCalledTimes(1);
		expect(last().status).toBe('synced');
	});

	it('aborts a hanging run on reconnect and starts a new one right away', async () => {
		const { controller, run, abortRun, last } = build();
		run.mockImplementationOnce(
			() =>
				new Promise<RunResult>((resolve) =>
					abortRun.mockImplementation(() => resolve(result('offline')))
				)
		);
		const first = controller.syncNow();
		await vi.advanceTimersByTimeAsync(0);
		controller.reconnect();
		expect(abortRun).toHaveBeenCalledTimes(1);
		await first;
		expect(last().status).toBe('pending');
		await vi.advanceTimersByTimeAsync(0);
		expect(run).toHaveBeenCalledTimes(2);
		expect(last().status).toBe('synced');
	});

	it('resets the backoff when the network returns', async () => {
		const { controller, run } = build({ results: [result('offline'), result('offline')] });
		await controller.syncNow();
		await vi.advanceTimersByTimeAsync(5_000);
		expect(run).toHaveBeenCalledTimes(2);
		controller.reconnect();
		await vi.advanceTimersByTimeAsync(0);
		expect(run).toHaveBeenCalledTimes(3);
	});
});
