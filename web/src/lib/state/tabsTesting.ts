import type { TabBus, TabMessage } from './channel.ts';
import type { LockManagerLike, LockRequestOptions } from './tabs.ts';

export class FakeLocks implements LockManagerLike {
	#holders = new Map<string, { abort: (error: Error) => void }>();
	#queues = new Map<string, (() => void)[]>();

	request(
		name: string,
		options: LockRequestOptions,
		callback: (lock: object | null) => Promise<unknown> | unknown
	): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const grant = () => {
				let stolen = false;
				this.#holders.set(name, {
					abort: (error) => {
						stolen = true;
						reject(error);
					}
				});
				const done = () => {
					if (stolen) return;
					this.#holders.delete(name);
					this.#next(name);
				};
				Promise.resolve(callback({ name })).then(
					(value) => {
						done();
						if (!stolen) resolve(value);
					},
					(error) => {
						done();
						if (!stolen) reject(error);
					}
				);
			};
			const held = this.#holders.get(name);
			if (!held) return grant();
			if (options.ifAvailable) {
				Promise.resolve(callback(null)).then(resolve, reject);
				return;
			}
			if (options.steal) {
				held.abort(new DOMException('stolen', 'AbortError'));
				this.#holders.delete(name);
				return grant();
			}
			const queue = this.#queues.get(name) ?? [];
			queue.push(grant);
			this.#queues.set(name, queue);
			options.signal?.addEventListener('abort', () => {
				const index = queue.indexOf(grant);
				if (index < 0) return;
				queue.splice(index, 1);
				reject(new DOMException('aborted', 'AbortError'));
			});
		});
	}

	#next(name: string): void {
		this.#queues.get(name)?.shift()?.();
	}
}

export class Network {
	#buses: { listeners: Set<(message: TabMessage) => void> }[] = [];

	bus(): TabBus {
		const mine = { listeners: new Set<(message: TabMessage) => void>() };
		this.#buses.push(mine);
		return {
			post: (message) => {
				for (const other of this.#buses) {
					if (other === mine) continue;
					queueMicrotask(() => other.listeners.forEach((listener) => listener(message)));
				}
			},
			subscribe: (listener) => {
				mine.listeners.add(listener);
				return () => mine.listeners.delete(listener);
			}
		};
	}
}
