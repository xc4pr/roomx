import { getPhoto } from '#lib/state/persistence.ts';
import { ensurePhoto, onPhotoStored } from '#lib/state/sync.svelte.ts';

export class ThumbCache {
	urls = $state<Record<string, string>>({});
	missing = $state<Record<string, boolean>>({});
	fetching = $state<Record<string, boolean>>({});
	#known = new Map<string, string>();
	#pending = new Set<string>();
	#absent = new Set<string>();
	#wanted = new Set<string>();
	#disposed = false;
	#stop: () => void;

	constructor() {
		const unsubscribe = onPhotoStored((hash) => this.#arrived(hash));
		const retry = () => this.#retryAbsent();
		if (typeof window !== 'undefined') window.addEventListener('online', retry);
		this.#stop = () => {
			unsubscribe();
			if (typeof window !== 'undefined') window.removeEventListener('online', retry);
		};
	}

	sync(hashes: Iterable<string>): void {
		if (this.#disposed) return;
		const wanted = new Set(hashes);
		this.#wanted = wanted;
		for (const [hash, url] of [...this.#known]) {
			if (wanted.has(hash)) continue;
			URL.revokeObjectURL(url);
			this.#known.delete(hash);
			delete this.urls[hash];
		}
		for (const hash of wanted) {
			if (this.#known.has(hash) || this.#pending.has(hash) || this.#absent.has(hash)) continue;
			this.#pending.add(hash);
			void this.#load(hash);
		}
	}

	#arrived(hash: string): void {
		if (this.#disposed || !this.#wanted.has(hash) || this.#known.has(hash)) return;
		this.#absent.delete(hash);
		if (this.#pending.has(hash)) return;
		this.#pending.add(hash);
		void this.#load(hash);
	}

	#retryAbsent(): void {
		for (const hash of [...this.#absent]) {
			if (!this.#wanted.has(hash) || this.#pending.has(hash)) continue;
			this.#absent.delete(hash);
			this.#pending.add(hash);
			void this.#load(hash);
		}
	}

	async #load(hash: string): Promise<void> {
		try {
			const stored = await getPhoto(hash);
			if (this.#disposed) return;
			if (!stored) {
				this.#absent.add(hash);
				this.missing[hash] = true;
				void this.#fetch(hash);
				return;
			}
			const url = URL.createObjectURL(stored.thumbnail);
			this.#known.set(hash, url);
			this.urls[hash] = url;
			delete this.missing[hash];
		} catch {
			this.#absent.add(hash);
			this.missing[hash] = true;
		} finally {
			this.#pending.delete(hash);
		}
	}

	async #fetch(hash: string): Promise<void> {
		this.fetching[hash] = true;
		try {
			const arrived = await ensurePhoto(hash);
			if (arrived && !this.#disposed && !this.#known.has(hash)) this.#arrived(hash);
		} catch {
			return;
		} finally {
			if (!this.#disposed) delete this.fetching[hash];
		}
	}

	dispose(): void {
		this.#disposed = true;
		this.#stop();
		for (const url of this.#known.values()) URL.revokeObjectURL(url);
		this.#known.clear();
		this.urls = {};
	}
}
