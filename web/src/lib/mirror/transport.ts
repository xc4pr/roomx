import type { OpenTransport } from './types.ts';

// Trystero over the fixed Nostr relays (MIRROR_NETWORK), loaded only when a job connects.
export const openNostrTransport: OpenTransport = async (room) => {
	void room;
	throw new Error('not implemented');
};
