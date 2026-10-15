import { newPhotoId } from '#lib/features/photos/process.ts';
import type { ProcessedImage } from '#lib/features/photos/image.ts';
import { openMessage, sealMessage, type Frame } from './frames.ts';
import { addShot as storeShot, deleteShot, getJob, listShots, markCameraRevoked } from './jobs.ts';
import { deriveKeys, type MirrorKeys } from './token.ts';
import { openNostrTransport } from './transport.ts';
import {
	FALLBACK_AFTER_MS,
	type CameraJob,
	type CameraStatus,
	type OpenTransport,
	type Shot,
	type Transport
} from './types.ts';

const ACK_TIMEOUT_MS = 30_000;
const RETRY_LATER_MS = 15_000;
const MAX_TIMER_MS = 2 ** 31 - 1;

export interface CameraOptions {
	ackTimeoutMs?: number;
	retryLaterMs?: number;
	fallbackAfterMs?: number;
	now?: () => number;
}

type AckFrame = Extract<Frame, { t: 'ack' }>;

interface Link {
	keys: MirrorKeys;
	transport?: Transport;
	closed: boolean;
	authed: Set<string>;
	active?: string;
	looping: boolean;
	queue: Shot[];
	deferred: Shot[];
	waiter?: {
		hash: string;
		resolve: (ack: AckFrame | null) => void;
		timer: ReturnType<typeof setTimeout>;
	};
	inbound: Promise<unknown>;
	timers: Set<ReturnType<typeof setTimeout>>;
}

// Phone side for one job: keeps the photos, connects while the camera page is open and the job is valid, sends what the computer has not confirmed.
export class CameraSession {
	readonly jobId: string;
	job = $state<CameraJob | undefined>();
	shots = $state<Shot[]>([]);
	status = $state<CameraStatus>({
		status: 'idle',
		sent: 0,
		total: 0,
		pending: 0,
		failed: [],
		fallbackSuggested: false,
		revoked: false,
		expired: false
	});
	#open: OpenTransport;
	#options: Required<CameraOptions>;
	#link: Link | undefined;
	#generation = 0;
	#lastTaken = 0;

	constructor(jobId: string, open?: OpenTransport, options: CameraOptions = {}) {
		this.jobId = jobId;
		this.#open = open ?? openNostrTransport;
		this.#options = {
			ackTimeoutMs: options.ackTimeoutMs ?? ACK_TIMEOUT_MS,
			retryLaterMs: options.retryLaterMs ?? RETRY_LATER_MS,
			fallbackAfterMs: options.fallbackAfterMs ?? FALLBACK_AFTER_MS,
			now: options.now ?? Date.now
		};
	}

	start(): () => void {
		const generation = ++this.#generation;
		void this.#begin(generation);
		return () => {
			if (this.#generation !== generation) return;
			this.#generation++;
			void this.#stop();
		};
	}

	async addShot(room: number, stepKey: string, image: ProcessedImage): Promise<Shot> {
		const shot: Shot = {
			id: newPhotoId(),
			jobId: this.jobId,
			room,
			stepKey,
			hash: image.hash,
			blob: image.blob,
			thumbnail: image.thumbnail,
			w: image.w,
			h: image.h,
			takenAt: this.#nextTakenAt()
		};
		await storeShot(shot);
		this.shots = [...this.shots, shot];
		this.status.pending = this.shots.length;
		const link = this.#link;
		if (link && link.active && !link.closed) {
			link.queue.push(shot);
			this.status.total++;
			void this.#drain(link, link.active);
		}
		return shot;
	}

	#nextTakenAt(): string {
		const newest = this.shots.reduce(
			(latest, shot) => Math.max(latest, Date.parse(shot.takenAt) || 0),
			0
		);
		this.#lastTaken = Math.max(this.#options.now(), this.#lastTaken + 1, newest + 1);
		return new Date(this.#lastTaken).toISOString();
	}

	async removeShot(id: string): Promise<void> {
		await deleteShot(id);
		this.#forget(id);
		const link = this.#link;
		if (link) {
			link.queue = link.queue.filter((shot) => shot.id !== id);
			link.deferred = link.deferred.filter((shot) => shot.id !== id);
		}
	}

	#forget(id: string): void {
		this.shots = this.shots.filter((shot) => shot.id !== id);
		this.status.pending = this.shots.length;
		this.status.failed = this.status.failed.filter((failed) => failed !== id);
	}

	async #begin(generation: number): Promise<void> {
		let job: Awaited<ReturnType<typeof getJob>>;
		let shots: Shot[];
		try {
			job = await getJob(this.jobId);
			shots = await listShots(this.jobId);
		} catch {
			return;
		}
		if (this.#generation !== generation) return;
		this.shots = shots;
		this.status.pending = shots.length;
		if (!job || job.role !== 'camera') {
			this.status.expired = true;
			this.status.status = 'ended';
			return;
		}
		this.job = job;
		if (job.revokedAt !== undefined) {
			this.status.revoked = true;
			this.status.status = 'ended';
			return;
		}
		if (job.expiresAt <= this.#options.now()) {
			this.status.expired = true;
			this.status.status = 'ended';
			return;
		}
		await this.#connect(job, generation);
	}

	#timer(link: Link, task: () => void, ms: number): void {
		const timer = setTimeout(() => {
			link.timers.delete(timer);
			if (!link.closed) task();
		}, ms);
		link.timers.add(timer);
	}

	async #connect(job: CameraJob, generation: number): Promise<void> {
		const link: Link = {
			keys: undefined as unknown as MirrorKeys,
			closed: false,
			authed: new Set(),
			looping: false,
			queue: [],
			deferred: [],
			inbound: Promise.resolve(),
			timers: new Set()
		};
		this.#link = link;
		this.status.status = 'searching';
		this.status.fallbackSuggested = false;
		this.#timer(
			link,
			() => (this.status.fallbackSuggested = !link.active),
			this.#options.fallbackAfterMs
		);
		const expire = () => {
			const remaining = job.expiresAt - this.#options.now();
			if (remaining > 0) this.#timer(link, expire, Math.min(remaining, MAX_TIMER_MS));
			else {
				this.status.expired = true;
				void this.#stop();
			}
		};
		expire();
		try {
			link.keys = await deriveKeys(job.token);
			const transport = await this.#open({
				topic: link.keys.topic,
				password: link.keys.password
			});
			if (link.closed || this.#generation !== generation) {
				await transport.leave().catch(() => {});
				return;
			}
			link.transport = transport;
			transport.onPeerJoin((peer) => void this.#hello(link, peer));
			transport.onPeerLeave((peer) => this.#left(link, peer));
			transport.onData((data, peer) => {
				link.inbound = link.inbound.then(() => this.#receive(job, link, data, peer));
			});
		} catch {
			await this.#stop();
		}
	}

	async #stop(): Promise<void> {
		const link = this.#link;
		this.#link = undefined;
		if (!link || link.closed) return;
		link.closed = true;
		link.timers.forEach(clearTimeout);
		link.timers.clear();
		this.#cancelWait(link);
		link.authed.clear();
		link.active = undefined;
		this.status.status = 'ended';
		try {
			await link.transport?.leave();
		} catch {
			// Already gone.
		}
	}

	#cancelWait(link: Link): void {
		const waiter = link.waiter;
		if (!waiter) return;
		clearTimeout(waiter.timer);
		link.waiter = undefined;
		waiter.resolve(null);
	}

	async #send(
		link: Link,
		peer: string,
		frame: Frame,
		body?: Uint8Array<ArrayBuffer>
	): Promise<boolean> {
		try {
			const sealed = await sealMessage(link.keys.key, this.jobId, {
				frame,
				...(body ? { body } : {})
			});
			await link.transport?.send(sealed, peer);
			return true;
		} catch {
			return false;
		}
	}

	async #hello(link: Link, peer: string): Promise<void> {
		if (link.closed) return;
		const pending = this.shots.map((shot) => ({
			hash: shot.hash,
			room: shot.room,
			stepKey: shot.stepKey,
			takenAt: shot.takenAt,
			size: shot.blob.size
		}));
		await this.#send(link, peer, { t: 'hello', pending });
	}

	#left(link: Link, peer: string): void {
		if (link.closed) return;
		link.authed.delete(peer);
		if (link.active !== peer) return;
		link.active = undefined;
		this.#cancelWait(link);
		const next = link.authed.values().next();
		if (!next.done) {
			link.active = next.value;
			void this.#hello(link, next.value);
			return;
		}
		this.status.status = 'searching';
		this.status.fallbackSuggested = false;
		this.#timer(
			link,
			() => (this.status.fallbackSuggested = !link.active),
			this.#options.fallbackAfterMs
		);
	}

	async #receive(
		job: CameraJob,
		link: Link,
		data: Uint8Array<ArrayBuffer>,
		peer: string
	): Promise<void> {
		let message;
		try {
			message = await openMessage(link.keys.key, job.id, data);
		} catch {
			return;
		}
		if (!message || link.closed) return;
		const { frame } = message;
		if (frame.t === 'revoked') {
			try {
				await markCameraRevoked(job.id, this.#options.now());
			} catch {
				// The flag is also kept in memory for this session.
			}
			this.status.revoked = true;
			await this.#stop();
		} else if (frame.t === 'state') {
			await this.#state(link, peer, frame.received);
		} else if (frame.t === 'ack' && link.active === peer && link.waiter?.hash === frame.hash) {
			const waiter = link.waiter;
			clearTimeout(waiter.timer);
			link.waiter = undefined;
			waiter.resolve(frame);
		}
	}

	async #state(link: Link, peer: string, received: string[]): Promise<void> {
		link.authed.add(peer);
		if (link.active && link.active !== peer) return;
		if (link.looping && link.active === peer) return;
		const confirmed = this.shots.filter((shot) => received.includes(shot.hash));
		for (const shot of confirmed) {
			try {
				await deleteShot(shot.id);
			} catch {
				continue;
			}
			this.#forget(shot.id);
		}
		if (link.closed) return;
		link.active = peer;
		link.deferred = [];
		this.status.failed = [];
		this.status.status = 'connected';
		this.status.fallbackSuggested = false;
		link.queue = [...this.shots];
		this.status.sent = 0;
		this.status.total = link.queue.length;
		void this.#drain(link, peer);
	}

	async #drain(link: Link, peer: string): Promise<void> {
		if (link.looping || link.closed || link.active !== peer) return;
		link.looping = true;
		try {
			while (!link.closed && link.active === peer) {
				const shot = link.queue.shift();
				if (!shot) break;
				if (!this.shots.some((candidate) => candidate.id === shot.id)) {
					this.status.total--;
					continue;
				}
				const outcome = await this.#sendShot(link, peer, shot);
				if (outcome === 'lost') {
					link.queue.unshift(shot);
					return;
				}
			}
		} finally {
			link.looping = false;
		}
		if (!link.closed && link.active === peer && link.deferred.length > 0) {
			this.#timer(
				link,
				() => {
					if (link.active !== peer || link.looping) return;
					link.deferred = [];
					void this.#hello(link, peer);
				},
				this.#options.retryLaterMs
			);
		}
	}

	async #sendShot(link: Link, peer: string, shot: Shot): Promise<'done' | 'lost'> {
		const body = new Uint8Array(await shot.blob.arrayBuffer());
		const ack = new Promise<AckFrame | null>((resolve) => {
			link.waiter = {
				hash: shot.hash,
				resolve,
				timer: setTimeout(() => {
					link.waiter = undefined;
					resolve(null);
				}, this.#options.ackTimeoutMs)
			};
		});
		const sent = await this.#send(
			link,
			peer,
			{
				t: 'photo',
				shot: {
					hash: shot.hash,
					room: shot.room,
					stepKey: shot.stepKey,
					takenAt: shot.takenAt,
					size: body.byteLength
				}
			},
			body
		);
		if (!sent) {
			this.#cancelWait(link);
			await ack;
			this.#retryHello(link, peer);
			return 'lost';
		}
		const result = await ack;
		if (!result) {
			if (!link.closed && link.active === peer) this.#retryHello(link, peer);
			return 'lost';
		}
		if (result.ok || result.duplicate) {
			try {
				await deleteShot(shot.id);
			} catch {
				// Kept; the next hello reports it as confirmed.
			}
			this.#forget(shot.id);
			this.status.sent++;
		} else if (result.reason === 'readOnly' || result.reason === 'storage') {
			link.deferred.push(shot);
		} else if (!this.status.failed.includes(shot.id)) {
			this.status.failed = [...this.status.failed, shot.id];
		}
		return 'done';
	}

	#retryHello(link: Link, peer: string): void {
		link.queue = [];
		link.deferred = [];
		link.active = undefined;
		this.#timer(
			link,
			() => {
				if (link.authed.has(peer)) void this.#hello(link, peer);
			},
			this.#options.retryLaterMs
		);
	}
}
