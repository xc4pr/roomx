import { describe, expect, it, vi } from 'vitest';
import type { TabBus } from './channel.ts';
import { TabGuard, type LockManagerLike, type ModeReason, type TabMode } from './tabs.ts';
import { FakeLocks, Network } from './tabsTesting.ts';

interface Tab {
	guard: TabGuard;
	modes: [TabMode, ModeReason][];
	remoteSaves: number;
	yielded: number;
	bus: TabBus | null;
}

function tab(
	id: string,
	network: Network,
	locks: LockManagerLike | null,
	options: { projectId?: string; bus?: boolean } = {}
): Tab {
	const bus = options.bus === false ? null : network.bus();
	const state: Tab = {
		guard: undefined as unknown as TabGuard,
		modes: [],
		remoteSaves: 0,
		yielded: 0,
		bus
	};
	state.guard = new TabGuard({
		projectId: options.projectId ?? 'p1',
		tabId: id,
		locks,
		bus,
		probeMs: 20,
		takeoverMs: 60,
		onMode: (mode, reason) => state.modes.push([mode, reason]),
		onRemoteSave: () => state.remoteSaves++,
		beforeYield: async () => {
			state.yielded++;
		}
	});
	return state;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('TabGuard with Web Locks', () => {
	it('lets the first tab edit and opens the second one read-only', async () => {
		const network = new Network();
		const locks = new FakeLocks();
		const a = tab('a', network, locks);
		const b = tab('b', network, locks);
		expect(await a.guard.acquire()).toBe('edit');
		expect(await b.guard.acquire()).toBe('readonly');
		expect(a.modes).toEqual([['edit', 'acquired']]);
		expect(b.modes).toEqual([['readonly', 'busy']]);
	});

	it('keeps different projects independent', async () => {
		const network = new Network();
		const locks = new FakeLocks();
		const a = tab('a', network, locks, { projectId: 'one' });
		const b = tab('b', network, locks, { projectId: 'two' });
		expect(await a.guard.acquire()).toBe('edit');
		expect(await b.guard.acquire()).toBe('edit');
	});

	it('tells the read-only tab about saves from the other tab', async () => {
		const network = new Network();
		const locks = new FakeLocks();
		const a = tab('a', network, locks);
		const b = tab('b', network, locks);
		await a.guard.acquire();
		await b.guard.acquire();
		a.bus?.post({ type: 'saved', projectId: 'p1', from: 'a' });
		a.bus?.post({ type: 'saved', projectId: 'other', from: 'a' });
		await flush();
		expect(b.remoteSaves).toBe(1);
		expect(a.remoteSaves).toBe(0);
	});

	it('hands the lock over: the old tab saves first and turns read-only', async () => {
		const network = new Network();
		const locks = new FakeLocks();
		const a = tab('a', network, locks);
		const b = tab('b', network, locks);
		await a.guard.acquire();
		await b.guard.acquire();
		await b.guard.takeOver();
		expect(a.yielded).toBe(1);
		expect(a.guard.mode).toBe('readonly');
		expect(a.modes.at(-1)).toEqual(['readonly', 'taken']);
		expect(b.guard.mode).toBe('edit');
		expect(b.modes.at(-1)).toEqual(['edit', 'acquired']);
		await b.guard.takeOver();
		await a.guard.takeOver();
		expect(a.guard.mode).toBe('edit');
		expect(b.guard.mode).toBe('readonly');
		expect(b.yielded).toBe(1);
	});

	it('steals the lock from a tab that does not answer', async () => {
		const network = new Network();
		const locks = new FakeLocks();
		const a = tab('a', network, locks, { bus: false });
		const b = tab('b', network, locks);
		await a.guard.acquire();
		await b.guard.acquire();
		await b.guard.takeOver();
		expect(b.guard.mode).toBe('edit');
		await flush();
		expect(a.yielded).toBe(0);
		expect(a.guard.mode).toBe('readonly');
		expect(a.modes.at(-1)).toEqual(['readonly', 'lost']);
	});

	it('lets another tab edit as soon as the first one leaves the project', async () => {
		const network = new Network();
		const locks = new FakeLocks();
		const a = tab('a', network, locks);
		const b = tab('b', network, locks);
		await a.guard.acquire();
		await b.guard.acquire();
		a.guard.release();
		await flush();
		const started = Date.now();
		await b.guard.takeOver();
		expect(Date.now() - started).toBeLessThan(40);
		expect(b.guard.mode).toBe('edit');
		expect(a.modes).toEqual([['edit', 'acquired']]);
	});

	it('does not change anything for a tab that already edits', async () => {
		const network = new Network();
		const a = tab('a', network, new FakeLocks());
		await a.guard.acquire();
		await a.guard.takeOver();
		expect(a.modes).toEqual([['edit', 'acquired']]);
	});

	it('lets the user edit when the lock manager itself fails', async () => {
		const network = new Network();
		const broken: LockManagerLike = {
			request: () => Promise.reject(new DOMException('no', 'SecurityError'))
		};
		const a = tab('a', network, broken);
		expect(await a.guard.acquire()).toBe('edit');
	});
});

describe('TabGuard without Web Locks', () => {
	it('lets the first tab claim the project and shows the second read-only', async () => {
		const network = new Network();
		const a = tab('a', network, null);
		const b = tab('b', network, null);
		expect(await a.guard.acquire()).toBe('edit');
		expect(await b.guard.acquire()).toBe('readonly');
	});

	it('hands over when asked', async () => {
		const network = new Network();
		const a = tab('a', network, null);
		const b = tab('b', network, null);
		await a.guard.acquire();
		await b.guard.acquire();
		await b.guard.takeOver();
		expect(a.yielded).toBe(1);
		expect(a.guard.mode).toBe('readonly');
		expect(b.guard.mode).toBe('edit');
	});

	it('lets exactly one of two tabs that open at the same time edit', async () => {
		const network = new Network();
		const a = tab('a', network, null);
		const b = tab('b', network, null);
		await Promise.all([a.guard.acquire(), b.guard.acquire()]);
		await flush();
		const editing = [a, b].filter((entry) => entry.guard.mode === 'edit');
		expect(editing).toHaveLength(1);
	});

	it('frees the project when the editing tab leaves', async () => {
		const network = new Network();
		const a = tab('a', network, null);
		await a.guard.acquire();
		a.guard.release();
		await flush();
		const b = tab('b', network, null);
		expect(await b.guard.acquire()).toBe('edit');
	});

	it('edits when there is nothing to coordinate with', async () => {
		const a = tab('a', new Network(), null, { bus: false });
		expect(await a.guard.acquire()).toBe('edit');
	});
});

describe('timing', () => {
	it('waits for the takeover timeout only when the holder stays silent', async () => {
		vi.useFakeTimers();
		try {
			const network = new Network();
			const locks = new FakeLocks();
			const a = tab('a', network, locks, { bus: false });
			const b = tab('b', network, locks);
			await a.guard.acquire();
			const acquired = b.guard.acquire();
			await vi.advanceTimersByTimeAsync(1);
			await acquired;
			const takeover = b.guard.takeOver();
			await vi.advanceTimersByTimeAsync(59);
			expect(b.guard.mode).toBe('readonly');
			await vi.advanceTimersByTimeAsync(5);
			await takeover;
			expect(b.guard.mode).toBe('edit');
		} finally {
			vi.useRealTimers();
		}
	});
});
