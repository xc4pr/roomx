import { MIRROR_NETWORK } from './network.ts';
import type { OpenTransport, Transport } from './types.ts';

const APP_ID = 'roomx-mirror';
const ACTION = 'm';
const SOCKET_WAIT_MS = 5000;
const SOCKET_CLOSE_WAIT_MS = 2000;

let openTransports = 0;
let parked = false;

type Nostr = typeof import('@trystero-p2p/nostr');

function relaySockets(
	nostr: Nostr
): Pick<WebSocket, 'readyState' | 'close' | 'addEventListener'>[] {
	return Object.values(nostr.getRelaySockets() as Record<string, WebSocket | undefined>).filter(
		(socket): socket is WebSocket => socket !== undefined
	);
}

// Trystero never closes its relay sockets. After the last room is left they are closed by hand and
// reconnection is held back until the next transport opens.
async function park(nostr: Nostr): Promise<void> {
	parked = true;
	nostr.pauseRelayReconnection();
	await Promise.all(
		relaySockets(nostr).map(
			(socket) =>
				new Promise<void>((done) => {
					socket.close();
					if (socket.readyState === 3) return done();
					socket.addEventListener('close', () => done(), { once: true });
					setTimeout(done, SOCKET_CLOSE_WAIT_MS);
				})
		)
	);
}

async function release(nostr: Nostr | undefined): Promise<void> {
	openTransports--;
	if (openTransports === 0 && nostr) await park(nostr);
}

async function wake(nostr: Nostr): Promise<void> {
	if (!parked) return;
	parked = false;
	nostr.resumeRelayReconnection();
	const deadline = Date.now() + SOCKET_WAIT_MS;
	while (Date.now() < deadline) {
		if (relaySockets(nostr).some((socket) => socket.readyState === 1)) return;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

// Trystero over the fixed Nostr relays (MIRROR_NETWORK), loaded only when a job connects.
export const openNostrTransport: OpenTransport = async (room) => {
	openTransports++;
	let nostr: Nostr | undefined;
	let joined;
	let action;
	try {
		nostr = await import('@trystero-p2p/nostr');
		await wake(nostr);
		const urls = [...MIRROR_NETWORK.relays];
		const stun = [...MIRROR_NETWORK.stun];
		joined = nostr.joinRoom(
			{
				appId: APP_ID,
				password: room.password,
				relayConfig: { urls, redundancy: urls.length },
				rtcConfig: { iceServers: stun.length ? [{ urls: stun }] : [] }
			},
			room.topic
		);
		action = joined.makeAction<Uint8Array>(ACTION);
	} catch (error) {
		await release(nostr);
		throw error;
	}
	const loaded = nostr;
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
	let left = false;
	const transport: Transport = {
		send: (data, peer) => action.send(data, { target: peer }),
		onPeerJoin: (listener) => void joinListeners.push(listener),
		onPeerLeave: (listener) => void leaveListeners.push(listener),
		onData: (listener) => void dataListeners.push(listener),
		leave: async () => {
			if (left) return;
			left = true;
			try {
				await joined.leave();
			} finally {
				await release(loaded);
			}
		}
	};
	return transport;
};
