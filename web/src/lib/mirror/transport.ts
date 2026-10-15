import { MIRROR_NETWORK } from './network.ts';
import type { OpenTransport, Transport } from './types.ts';

const APP_ID = 'roomx-mirror';
const ACTION = 'm';

// Trystero over the fixed Nostr relays (MIRROR_NETWORK), loaded only when a job connects.
export const openNostrTransport: OpenTransport = async (room) => {
	const { joinRoom } = await import('@trystero-p2p/nostr');
	const urls = [...MIRROR_NETWORK.relays];
	const stun = [...MIRROR_NETWORK.stun];
	const joined = joinRoom(
		{
			appId: APP_ID,
			password: room.password,
			relayConfig: { urls, redundancy: urls.length },
			rtcConfig: { iceServers: stun.length ? [{ urls: stun }] : [] }
		},
		room.topic
	);
	const action = joined.makeAction<Uint8Array>(ACTION);
	const joinListeners: ((peer: string) => void)[] = [];
	const leaveListeners: ((peer: string) => void)[] = [];
	const dataListeners: ((data: Uint8Array<ArrayBuffer>, peer: string) => void)[] = [];
	joined.onPeerJoin = (peer) => joinListeners.forEach((listener) => listener(peer));
	joined.onPeerLeave = (peer) => leaveListeners.forEach((listener) => listener(peer));
	action.onMessage = (data, context) => {
		if (!(data instanceof Uint8Array)) return;
		const copy = new Uint8Array(data.byteLength);
		copy.set(data);
		dataListeners.forEach((listener) => listener(copy, context.peerId));
	};
	const transport: Transport = {
		send: (data, peer) => action.send(data, { target: peer }),
		onPeerJoin: (listener) => void joinListeners.push(listener),
		onPeerLeave: (listener) => void leaveListeners.push(listener),
		onData: (listener) => void dataListeners.push(listener),
		leave: () => joined.leave()
	};
	return transport;
};
