import { sharedBus, tabId as ownTabId, type TabBus, type TabMessage } from './channel.ts';

export type TabMode = 'edit' | 'readonly';
export type ModeReason = 'acquired' | 'busy' | 'lost' | 'taken';

export interface LockRequestOptions {
	ifAvailable?: boolean;
	steal?: boolean;
	signal?: AbortSignal;
}

export interface LockManagerLike {
	request(
		name: string,
		options: LockRequestOptions,
		callback: (lock: object | null) => Promise<unknown> | unknown
	): Promise<unknown>;
}

export interface TabGuardOptions {
	projectId: string;
	tabId?: string;
	locks: LockManagerLike | null;
	bus: TabBus | null;
	onMode: (mode: TabMode, reason: ModeReason) => void;
	onRemoteSave: () => void;
	beforeYield: () => Promise<void>;
	probeMs?: number;
	takeoverMs?: number;
}

const PROBE_MS = 200;
const TAKEOVER_MS = 1500;

export function lockName(projectId: string): string {
	return `roomx.project.${projectId}`;
}

export class TabGuard {
	mode: TabMode = 'readonly';
	readonly #options: TabGuardOptions;
	readonly #tabId: string;
	readonly #name: string;
	#releaseHold: (() => void) | null = null;
	#stopBus: (() => void) | null = null;
	#claimedAt = 0;
	#closed = false;

	constructor(options: TabGuardOptions) {
		this.#options = options;
		this.#tabId = options.tabId ?? ownTabId;
		this.#name = lockName(options.projectId);
	}

	get locking(): boolean {
		return this.#options.locks !== null;
	}

	async acquire(): Promise<TabMode> {
		const { bus } = this.#options;
		this.#stopBus = bus?.subscribe((message) => void this.#onMessage(message)) ?? null;
		const mode = this.#options.locks ? await this.#acquireLock() : await this.#acquireByBus();
		this.mode = mode;
		this.#options.onMode(mode, mode === 'edit' ? 'acquired' : 'busy');
		return mode;
	}

	async takeOver(): Promise<void> {
		if (this.#closed || this.mode === 'edit') return;
		const { locks, bus, takeoverMs = TAKEOVER_MS } = this.#options;
		bus?.post({ type: 'takeover', projectId: this.#options.projectId, from: this.#tabId });
		if (locks) {
			if (!(await this.#requestLock(locks, takeoverMs))) await this.#stealLock(locks);
		} else {
			await this.#waitForRelease(takeoverMs);
			this.#claim();
		}
		this.mode = 'edit';
		this.#options.onMode('edit', 'acquired');
	}

	release(): void {
		if (this.#closed) return;
		this.#closed = true;
		const wasEditing = this.mode === 'edit';
		this.#releaseHold?.();
		this.#releaseHold = null;
		if (wasEditing && !this.#options.locks) {
			this.#options.bus?.post({
				type: 'released',
				projectId: this.#options.projectId,
				from: this.#tabId
			});
		}
		this.#stopBus?.();
		this.#stopBus = null;
	}

	#hold(onGranted: () => void): Promise<void> {
		this.mode = 'edit';
		onGranted();
		return new Promise<void>((release) => {
			this.#releaseHold = release;
		});
	}

	#acquireLock(): Promise<TabMode> {
		const locks = this.#options.locks!;
		return new Promise<TabMode>((resolve) => {
			let granted = false;
			try {
				void locks
					.request(this.#name, { ifAvailable: true }, (lock) => {
						if (!lock) {
							resolve('readonly');
							return undefined;
						}
						granted = true;
						return this.#hold(() => resolve('edit'));
					})
					.catch(() => {
						if (granted) this.#lost();
						else resolve('edit');
					});
			} catch {
				resolve('edit');
			}
		});
	}

	#requestLock(locks: LockManagerLike, timeoutMs: number): Promise<boolean> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		return new Promise<boolean>((resolve) => {
			let granted = false;
			locks
				.request(this.#name, { signal: controller.signal }, () => {
					clearTimeout(timer);
					granted = true;
					return this.#hold(() => resolve(true));
				})
				.catch(() => {
					clearTimeout(timer);
					if (granted) this.#lost();
					else resolve(false);
				});
		});
	}

	#stealLock(locks: LockManagerLike): Promise<void> {
		return new Promise<void>((resolve) => {
			locks
				.request(this.#name, { steal: true }, () => this.#hold(resolve))
				.catch(() => this.#lost());
		});
	}

	#lost(): void {
		if (this.#closed || this.mode === 'readonly') return;
		this.#releaseHold?.();
		this.#releaseHold = null;
		this.mode = 'readonly';
		this.#options.onMode('readonly', 'lost');
	}

	#claim(): void {
		this.#claimedAt = Date.now();
		this.mode = 'edit';
		this.#options.bus?.post({
			type: 'owner',
			projectId: this.#options.projectId,
			from: this.#tabId,
			claimedAt: this.#claimedAt
		});
	}

	async #acquireByBus(): Promise<TabMode> {
		const { bus, projectId, probeMs = PROBE_MS } = this.#options;
		if (!bus) return 'edit';
		const busy = await new Promise<boolean>((resolve) => {
			let stop: (() => void) | null = null;
			const timer = setTimeout(() => {
				stop?.();
				resolve(false);
			}, probeMs);
			stop = bus.subscribe((message) => {
				if (message.type !== 'owner' || message.projectId !== projectId) return;
				if (message.from === this.#tabId) return;
				clearTimeout(timer);
				stop?.();
				resolve(true);
			});
			bus.post({ type: 'who', projectId, from: this.#tabId });
		});
		if (busy) return 'readonly';
		this.#claim();
		return 'edit';
	}

	#waitForRelease(timeoutMs: number): Promise<void> {
		const { bus, projectId } = this.#options;
		return new Promise<void>((resolve) => {
			if (!bus) {
				resolve();
				return;
			}
			let stop: (() => void) | null = null;
			const timer = setTimeout(() => {
				stop?.();
				resolve();
			}, timeoutMs);
			stop = bus.subscribe((message) => {
				if (message.type !== 'released' || message.projectId !== projectId) return;
				clearTimeout(timer);
				stop?.();
				resolve();
			});
		});
	}

	async #onMessage(message: TabMessage): Promise<void> {
		if (this.#closed || message.type === 'wiped') return;
		if (message.from === this.#tabId || message.projectId !== this.#options.projectId) return;
		if (message.type === 'saved') {
			if (this.mode === 'readonly') this.#options.onRemoteSave();
			return;
		}
		if (this.mode !== 'edit') return;
		if (message.type === 'takeover') {
			await this.#options.beforeYield().catch(() => undefined);
			if (this.#closed || this.mode !== 'edit') return;
			this.#releaseHold?.();
			this.#releaseHold = null;
			this.mode = 'readonly';
			this.#options.onMode('readonly', 'taken');
			if (!this.#options.locks) {
				this.#options.bus?.post({
					type: 'released',
					projectId: this.#options.projectId,
					from: this.#tabId
				});
			}
			return;
		}
		if (this.#options.locks) return;
		if (message.type === 'who') {
			this.#options.bus?.post({
				type: 'owner',
				projectId: this.#options.projectId,
				from: this.#tabId,
				claimedAt: this.#claimedAt
			});
			return;
		}
		if (message.type === 'owner') {
			const theirsFirst =
				message.claimedAt < this.#claimedAt ||
				(message.claimedAt === this.#claimedAt && message.from < this.#tabId);
			if (theirsFirst) {
				this.mode = 'readonly';
				this.#options.onMode('readonly', 'lost');
			}
		}
	}
}

export function browserLocks(): LockManagerLike | null {
	if (typeof navigator === 'undefined') return null;
	return (navigator as Navigator & { locks?: LockManagerLike }).locks ?? null;
}

export function createBrowserGuard(
	options: Pick<TabGuardOptions, 'projectId' | 'onMode' | 'onRemoteSave' | 'beforeYield'>
): TabGuard | null {
	if (typeof window === 'undefined') return null;
	return new TabGuard({ ...options, locks: browserLocks(), bus: sharedBus() });
}
