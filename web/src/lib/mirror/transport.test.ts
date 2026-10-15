import { describe, expect, it, vi } from 'vitest';
import { FakeHub } from './fakeTransport.ts';
import { MIRROR_NETWORK } from './network.ts';

const loaded = vi.hoisted(() => ({ count: 0 }));
const joinRoom = vi.hoisted(() => vi.fn());
const relay = vi.hoisted(() => ({
	pause: vi.fn(),
	resume: vi.fn(),
	sockets: {} as Record<
		string,
		{ readyState: number; close: () => void; addEventListener: () => void }
	>
}));

vi.mock('@trystero-p2p/nostr', () => {
	loaded.count++;
	return {
		joinRoom,
		pauseRelayReconnection: relay.pause,
		resumeRelayReconnection: relay.resume,
		getRelaySockets: () => relay.sockets
	};
});

interface FakeAction {
	send: ReturnType<typeof vi.fn>;
	onMessage: ((data: unknown, context: { peerId: string }) => void) | null;
}

const bytes = (...values: number[]) => new Uint8Array(values);
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('openNostrTransport', () => {
	it('loads Trystero only when a transport is opened and passes the fixed network', async () => {
		const { openNostrTransport } = await import('./transport.ts');
		expect(loaded.count).toBe(0);
		const action: FakeAction = { send: vi.fn(async () => undefined), onMessage: null };
		const room = {
			makeAction: vi.fn(() => action),
			onPeerJoin: null as ((peer: string) => void) | null,
			onPeerLeave: null as ((peer: string) => void) | null,
			leave: vi.fn(async () => undefined)
		};
		joinRoom.mockReturnValue(room);

		const transport = await openNostrTransport({ topic: 'topic-1', password: 'secret' });
		expect(loaded.count).toBe(1);
		const [config, roomId] = joinRoom.mock.calls[0];
		expect(roomId).toBe('topic-1');
		expect(config).toMatchObject({
			appId: 'roomx-mirror',
			password: 'secret',
			relayConfig: { urls: MIRROR_NETWORK.relays, redundancy: MIRROR_NETWORK.relays.length }
		});
		expect(config.rtcConfig.iceServers).toEqual(
			MIRROR_NETWORK.stun.length ? [{ urls: MIRROR_NETWORK.stun }] : []
		);
		expect(config.turnConfig).toBeUndefined();

		const joined: string[] = [];
		const left: string[] = [];
		const received: [number[], string][] = [];
		transport.onPeerJoin((peer) => joined.push(peer));
		transport.onPeerLeave((peer) => left.push(peer));
		transport.onData((data, peer) => received.push([[...data], peer]));
		room.onPeerJoin?.('a');
		room.onPeerLeave?.('a');
		action.onMessage?.(bytes(1, 2), { peerId: 'a' });
		action.onMessage?.('not bytes', { peerId: 'a' });
		expect(joined).toEqual(['a']);
		expect(left).toEqual(['a']);
		expect(received).toEqual([[[1, 2], 'a']]);

		await transport.send(bytes(9), 'a');
		expect(action.send).toHaveBeenCalledWith(bytes(9), { target: 'a' });
		await transport.leave();
		expect(room.leave).toHaveBeenCalled();
	});
});

describe('relay sockets', () => {
	function fakeRoom() {
		return {
			makeAction: () => ({ send: vi.fn(), onMessage: null }),
			onPeerJoin: null,
			onPeerLeave: null,
			leave: vi.fn(async () => undefined)
		};
	}

	it('closes the sockets after the last leave and wakes them for the next transport', async () => {
		const { openNostrTransport } = await import('./transport.ts');
		const socket = {
			readyState: 1,
			close: vi.fn(() => {
				socket.readyState = 3;
			}),
			addEventListener: vi.fn()
		};
		relay.sockets = { 'ws://relay': socket };
		relay.pause.mockClear();
		relay.resume.mockClear();
		joinRoom.mockImplementation(fakeRoom);

		const first = await openNostrTransport({ topic: 'a', password: 'p' });
		const second = await openNostrTransport({ topic: 'b', password: 'p' });
		await first.leave();
		await first.leave();
		expect(relay.pause).not.toHaveBeenCalled();
		await second.leave();
		expect(relay.pause).toHaveBeenCalledTimes(1);
		expect(socket.close).toHaveBeenCalledTimes(1);

		socket.readyState = 0;
		setTimeout(() => (socket.readyState = 1), 120);
		const third = await openNostrTransport({ topic: 'c', password: 'p' });
		expect(relay.resume).toHaveBeenCalledTimes(2);
		expect(socket.readyState).toBe(1);
		await third.leave();
		expect(relay.pause).toHaveBeenCalledTimes(2);
	});
});

describe('FakeHub', () => {
	it('connects peers of the same room only and delivers data', async () => {
		const hub = new FakeHub();
		const a = await hub.open({ topic: 't', password: 'p' });
		const b = await hub.open({ topic: 't', password: 'p' });
		const other = await hub.open({ topic: 't', password: 'different' });
		const joined: string[] = [];
		const inbox: number[][] = [];
		a.onPeerJoin((peer) => joined.push(peer));
		b.onData((data) => inbox.push([...data]));
		other.onPeerJoin((peer) => joined.push(`other:${peer}`));
		await tick();
		expect(joined).toHaveLength(1);
		await a.send(bytes(1, 2, 3), joined[0]);
		await tick();
		expect(inbox).toEqual([[1, 2, 3]]);
		await expect(a.send(bytes(1), 'peer-none')).rejects.toThrow();
	});

	it('reports leave and can cut and restore a link', async () => {
		const hub = new FakeHub();
		const a = await hub.open({ topic: 't', password: 'p' });
		const b = await hub.open({ topic: 't', password: 'p' });
		const events: string[] = [];
		a.onPeerJoin((peer) => events.push(`join ${peer}`));
		a.onPeerLeave((peer) => events.push(`leave ${peer}`));
		await tick();
		const peer = hub.peers().find((id) => id !== (a as { id?: string }).id) ?? '';
		hub.sever(peer);
		await expect(a.send(bytes(1), peer)).rejects.toThrow();
		hub.heal(peer);
		await tick();
		await b.leave();
		expect(events).toEqual([`join ${peer}`, `leave ${peer}`, `join ${peer}`, `leave ${peer}`]);
	});

	it('lets a tap cut the link in the middle of a send', async () => {
		const hub = new FakeHub();
		const a = await hub.open({ topic: 't', password: 'p' });
		const b = await hub.open({ topic: 't', password: 'p' });
		const inbox: number[][] = [];
		b.onData((data) => inbox.push([...data]));
		await tick();
		let count = 0;
		hub.tap((from) => {
			if (++count === 2) hub.sever(from);
		});
		const target = hub.peers()[1];
		await a.send(bytes(1), target);
		await tick();
		await expect(a.send(bytes(2), target)).rejects.toThrow();
		await tick();
		expect(inbox).toEqual([[1]]);
	});
});
