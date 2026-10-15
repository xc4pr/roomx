export const CHANNEL_NAME = 'roomx-changes';

export type TabMessage =
	| { type: 'saved'; projectId: string; from: string }
	| { type: 'takeover'; projectId: string; from: string }
	| { type: 'released'; projectId: string; from: string }
	| { type: 'who'; projectId: string; from: string }
	| { type: 'owner'; projectId: string; from: string; claimedAt: number }
	| { type: 'wiped'; from: string };

export interface TabBus {
	post(message: TabMessage): void;
	subscribe(listener: (message: TabMessage) => void): () => void;
}

const MESSAGE_TYPES = new Set(['saved', 'takeover', 'released', 'who', 'owner', 'wiped']);

export function isTabMessage(value: unknown): value is TabMessage {
	if (typeof value !== 'object' || value === null) return false;
	const message = value as Record<string, unknown>;
	return (
		typeof message.type === 'string' &&
		MESSAGE_TYPES.has(message.type) &&
		typeof message.from === 'string'
	);
}

export function newTabId(): string {
	const random = globalThis.crypto;
	if (typeof random?.randomUUID === 'function') return random.randomUUID();
	return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const tabId = newTabId();

export function createBroadcastBus(name = CHANNEL_NAME): TabBus | null {
	if (typeof BroadcastChannel === 'undefined') return null;
	let channel: BroadcastChannel;
	try {
		channel = new BroadcastChannel(name);
	} catch {
		return null;
	}
	const listeners = new Set<(message: TabMessage) => void>();
	channel.addEventListener('message', (event: MessageEvent<unknown>) => {
		if (!isTabMessage(event.data)) return;
		for (const listener of listeners) listener(event.data);
	});
	return {
		post(message) {
			try {
				channel.postMessage(message);
			} catch {
				return;
			}
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}

let shared: TabBus | null | undefined;

export function sharedBus(): TabBus | null {
	if (shared === undefined) shared = typeof window === 'undefined' ? null : createBroadcastBus();
	return shared;
}

export function useBus(bus: TabBus | null): void {
	shared = bus;
}
