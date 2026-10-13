import { backoffDelay } from './backoff.ts';
import type { RunResult } from './runner.ts';

export type SyncStatus = 'off' | 'synced' | 'pending' | 'offline' | 'conflict';

export interface SyncSnapshot {
	status: SyncStatus;
	lastSyncedAt: string | null;
	running: boolean;
	unauthorized: boolean;
}

export type Resolution<T> = { kind: 'target'; target: T } | { kind: 'off' } | { kind: 'retry' };

export interface ControllerDeps<T> {
	resolveTarget: () => Promise<Resolution<T>>;
	abortRun?: () => void;
	run: (target: T) => Promise<RunResult>;
	report: (snapshot: SyncSnapshot) => void;
	onResult?: (result: RunResult) => void;
	now?: () => number;
	lastSyncedAt?: string | null;
}

export const LOCAL_CHANGE_DELAY_MS = 5_000;
export const CONFLICT_DISPLAY_MS = 4_000;
export const FOREGROUND_MIN_GAP_MS = 10_000;

export class SyncController<T> {
	#deps: ControllerDeps<T>;
	#status: SyncStatus = 'off';
	#lastSyncedAt: string | null;
	#running = false;
	#unauthorized = false;
	#failures = 0;
	#rerun = false;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#dueAt = 0;
	#conflictTimer: ReturnType<typeof setTimeout> | null = null;
	#lastFinishedAt = 0;
	#current: Promise<void> | null = null;
	#disposed = false;

	constructor(deps: ControllerDeps<T>) {
		this.#deps = deps;
		this.#lastSyncedAt = deps.lastSyncedAt ?? null;
	}

	get status(): SyncStatus {
		return this.#status;
	}

	#now(): number {
		return this.#deps.now ? this.#deps.now() : Date.now();
	}

	#report(): void {
		this.#deps.report({
			status: this.#status,
			lastSyncedAt: this.#lastSyncedAt,
			running: this.#running,
			unauthorized: this.#unauthorized
		});
	}

	#setStatus(status: SyncStatus): void {
		this.#status = status;
		this.#report();
	}

	schedule(delay: number): void {
		if (this.#disposed) return;
		const due = this.#now() + delay;
		if (this.#timer !== null && this.#dueAt <= due) return;
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#dueAt = due;
		this.#timer = setTimeout(() => {
			this.#timer = null;
			void this.syncNow();
		}, delay);
	}

	localChange(): void {
		if (this.#status === 'off') return;
		if (this.#status === 'synced' || this.#status === 'conflict') this.#setStatus('pending');
		if (this.#timer === null) this.schedule(LOCAL_CHANGE_DELAY_MS);
	}

	foreground(): void {
		if (this.#now() - this.#lastFinishedAt < FOREGROUND_MIN_GAP_MS && this.#status === 'synced') {
			return;
		}
		this.schedule(0);
	}

	reconnect(): void {
		this.#failures = 0;
		if (this.#current) {
			this.#rerun = true;
			this.#deps.abortRun?.();
			return;
		}
		this.schedule(0);
	}

	syncNow(): Promise<void> {
		if (this.#disposed) return Promise.resolve();
		if (this.#current) {
			this.#rerun = true;
			return this.#current;
		}
		this.#current = this.#execute().finally(() => {
			this.#current = null;
			this.#running = false;
			if (this.#rerun && !this.#disposed) {
				this.#rerun = false;
				this.schedule(0);
			}
		});
		return this.#current;
	}

	async #execute(): Promise<void> {
		this.#running = true;
		if (this.#timer !== null) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}
		let resolution: Resolution<T>;
		try {
			resolution = await this.#deps.resolveTarget();
		} catch {
			resolution = { kind: 'retry' };
		}
		if (resolution.kind !== 'target') {
			this.#unauthorized = false;
			this.#running = false;
			if (resolution.kind === 'retry') {
				this.#failures += 1;
				this.schedule(backoffDelay(this.#failures));
			} else {
				this.#failures = 0;
			}
			this.#setStatus('off');
			return;
		}
		const target = resolution.target;
		if (this.#status === 'off' || this.#status === 'synced') this.#status = 'pending';
		this.#report();
		const result = await this.#deps.run(target);
		this.#lastFinishedAt = this.#now();
		this.#running = false;
		this.#deps.onResult?.(result);
		this.#finish(result);
	}

	#finish(result: RunResult): void {
		this.#unauthorized = result.outcome === 'unauthorized';
		if (result.outcome === 'ok') {
			this.#failures = 0;
			this.#lastSyncedAt = new Date(this.#now()).toISOString();
			if (result.again) this.schedule(0);
			if (result.conflicts.length > 0) this.#showConflict();
			else if (this.#status === 'conflict' && this.#conflictTimer !== null) this.#report();
			else this.#setStatus(this.#timer !== null || this.#rerun ? 'pending' : 'synced');
			return;
		}
		if (this.#rerun) {
			this.#setStatus('pending');
			return;
		}
		this.#failures += 1;
		this.#setStatus(result.outcome === 'error' ? 'pending' : 'offline');
		this.schedule(backoffDelay(this.#failures));
	}

	#showConflict(): void {
		if (this.#conflictTimer !== null) clearTimeout(this.#conflictTimer);
		this.#setStatus('conflict');
		this.#conflictTimer = setTimeout(() => {
			this.#conflictTimer = null;
			if (this.#status === 'conflict')
				this.#setStatus(this.#timer === null && !this.#running ? 'synced' : 'pending');
		}, CONFLICT_DISPLAY_MS);
	}

	dispose(): void {
		this.#disposed = true;
		if (this.#timer !== null) clearTimeout(this.#timer);
		if (this.#conflictTimer !== null) clearTimeout(this.#conflictTimer);
		this.#timer = null;
		this.#conflictTimer = null;
	}
}
