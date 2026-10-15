import type { OpenTransport, Transport } from './types.ts';

export interface FakePeer extends Transport {
	readonly id: string;
}

interface Member {
	id: string;
	roomKey: string;
	joinListeners: ((peer: string) => void)[];
	leaveListeners: ((peer: string) => void)[];
	dataListeners: ((data: Uint8Array<ArrayBuffer>, peer: string) => void)[];
	left: boolean;
}

export type Tap = (from: string, to: string, data: Uint8Array<ArrayBuffer>) => void;

// In-memory stand-in for Trystero: peers with the same topic and password find each other.
export class FakeHub {
	#members = new Map<string, Member>();
	#cut = new Set<string>();
	#counter = 0;
	#taps: Tap[] = [];

	// Called for every message at the moment it is sent; may cut the link to simulate a drop mid-transfer.
	tap(listener: Tap): void {
		this.#taps.push(listener);
	}

	peers(): string[] {
		return [...this.#members.values()].filter((member) => !member.left).map((member) => member.id);
	}

	readonly open: OpenTransport = async (room) => {
		const roomKey = `${room.topic}\n${room.password}`;
		const member: Member = {
			id: `peer${++this.#counter}`,
			roomKey,
			joinListeners: [],
			leaveListeners: [],
			dataListeners: [],
			left: false
		};
		this.#members.set(member.id, member);
		for (const other of this.#sameRoom(member)) {
			this.#later(() => this.#notify(member, 'join', other.id));
			this.#later(() => this.#notify(other, 'join', member.id));
		}
		const peer: FakePeer = {
			id: member.id,
			send: async (data, to) => {
				const target = this.#members.get(to);
				if (member.left || !target || target.left || target.roomKey !== roomKey) {
					throw new Error('no such peer');
				}
				if (this.#cut.has(this.#link(member.id, to))) throw new Error('link is cut');
				const copy = new Uint8Array(data);
				this.#taps.forEach((tap) => tap(member.id, to, copy));
				if (this.#cut.has(this.#link(member.id, to))) throw new Error('link is cut');
				this.#later(() => {
					if (target.left || this.#cut.has(this.#link(member.id, to))) return;
					target.dataListeners.forEach((listener) => listener(new Uint8Array(copy), member.id));
				});
			},
			onPeerJoin: (listener) => void member.joinListeners.push(listener),
			onPeerLeave: (listener) => void member.leaveListeners.push(listener),
			onData: (listener) => void member.dataListeners.push(listener),
			leave: async () => {
				if (member.left) return;
				member.left = true;
				for (const other of this.#sameRoom(member)) this.#notify(other, 'leave', member.id);
			}
		};
		return peer;
	};

	// Cuts every link of a peer; both sides see a leave.
	sever(id: string): void {
		const member = this.#members.get(id);
		if (!member || member.left) return;
		for (const other of this.#sameRoom(member)) {
			const link = this.#link(id, other.id);
			if (this.#cut.has(link)) continue;
			this.#cut.add(link);
			this.#notify(member, 'leave', other.id);
			this.#notify(other, 'leave', id);
		}
	}

	// Reconnects a severed peer; both sides see a join.
	heal(id: string): void {
		const member = this.#members.get(id);
		if (!member || member.left) return;
		for (const other of this.#sameRoom(member)) {
			const link = this.#link(id, other.id);
			if (!this.#cut.delete(link)) continue;
			this.#later(() => this.#notify(member, 'join', other.id));
			this.#later(() => this.#notify(other, 'join', id));
		}
	}

	#sameRoom(member: Member): Member[] {
		return [...this.#members.values()].filter(
			(other) => other !== member && !other.left && other.roomKey === member.roomKey
		);
	}

	#link(a: string, b: string): string {
		return a < b ? `${a}|${b}` : `${b}|${a}`;
	}

	#notify(member: Member, kind: 'join' | 'leave', peer: string): void {
		if (member.left) return;
		const listeners = kind === 'join' ? member.joinListeners : member.leaveListeners;
		listeners.forEach((listener) => listener(peer));
	}

	#later(task: () => void): void {
		setTimeout(task, 0);
	}
}
