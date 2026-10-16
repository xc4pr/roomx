import { resolve } from '$app/paths';
import type { Reencode } from '#lib/features/photos/reencode.ts';
import { store } from '#lib/state/project.svelte.ts';
import { openMessage, sealMessage, type Frame, type Message } from './frames.ts';
import { createHostJob } from './job.ts';
import * as mailbox from './mailbox.ts';
import { deleteHostJob, getJob, listHostJobs, saveHostJob } from './jobs.ts';
import { placeShot } from './place.ts';
import { deriveKeys, type MirrorKeys } from './token.ts';
import { openNostrTransport } from './transport.ts';
import type {
	HostJob,
	HostJobStatus,
	LinkStatus,
	OpenTransport,
	PlaceResult,
	ShotTag,
	Transport
} from './types.ts';

const MAX_TIMER_MS = 2 ** 31 - 1;
const POLL_MS = 20_000;

export interface MirrorHostOptions {
	open?: OpenTransport;
	reencode?: Reencode;
	appUrl?: () => string;
	now?: () => number;
	mailbox?: mailbox.MailboxEnv;
	pollMs?: number;
}

interface Connection {
	jobId: string;
	keys: MirrorKeys;
	transport?: Transport;
	known: Set<string>;
	peers: Set<string>;
	pending: Map<string, Set<string>>;
	timer?: ReturnType<typeof setTimeout>;
	inbound: Promise<unknown>;
	closed: boolean;
}

interface LinkState {
	status: LinkStatus;
	peers: number;
	expected: number;
}

function defaultAppUrl(): string {
	const path = resolve('/');
	return location.origin + (path.endsWith('/') ? path : `${path}/`);
}

// Computer side. The project layout calls start(projectId) while a project is open; it connects only for open jobs of that project.
export class MirrorHost {
	jobs = $state<HostJob[]>([]);
	#links = $state<Record<string, LinkState>>({});
	#connections = new Map<string, Connection>();
	#queue: Promise<unknown> = Promise.resolve();
	#generation = 0;
	#pollStop: (() => void) | undefined;
	#polling = new Set<string>();
	#dead = new Set<string>();
	#left = new Set<string>();
	#options: Required<Omit<MirrorHostOptions, 'reencode'>> & { reencode?: Reencode };

	constructor(options: MirrorHostOptions = {}) {
		this.#options = {
			open: options.open ?? openNostrTransport,
			reencode: options.reencode,
			appUrl: options.appUrl ?? defaultAppUrl,
			now: options.now ?? Date.now,
			mailbox: options.mailbox ?? {},
			pollMs: options.pollMs ?? POLL_MS
		};
	}

	status(jobId: string): HostJobStatus {
		const link = this.#links[jobId];
		const job = this.jobs.find((candidate) => candidate.id === jobId);
		return {
			status: link?.status ?? 'idle',
			peers: link?.peers ?? 0,
			received: job?.received.length ?? 0,
			expected: link?.expected ?? 0
		};
	}

	start(projectId: string): () => void {
		const generation = ++this.#generation;
		void this.#shutdown();
		this.#pollStop = this.#startPolling(generation);
		void this.#begin(projectId, generation);
		return () => {
			if (this.#generation !== generation) return;
			this.#generation++;
			void this.#shutdown();
		};
	}

	async create(roomIds: string[]): Promise<HostJob> {
		const project = store.project;
		if (!project) throw new Error('no project open');
		const server = mailbox.mailboxAvailable(this.#options.mailbox);
		const created = await createHostJob(
			project,
			roomIds,
			this.#options.appUrl(),
			this.#options.now(),
			{ server }
		);
		if (server) created.server = await this.#register(created);
		await saveHostJob(created);
		this.jobs = [...this.jobs, created];
		const job = this.jobs.find((candidate) => candidate.id === created.id) ?? created;
		if (!store.readOnly) void this.#connect(job, this.#generation);
		return job;
	}

	// Tells connected phones, then deletes the job.
	async revoke(jobId: string): Promise<void> {
		const ending = this.jobs.find((job) => job.id === jobId);
		const server = ending?.server;
		if (ending && server && mailbox.mailboxAvailable(this.#options.mailbox)) {
			await this.#pollJob(ending, this.#generation);
		}
		const connection = this.#connections.get(jobId);
		if (connection) {
			if (connection.transport) {
				const sealed = await sealMessage(connection.keys.key, jobId, { frame: { t: 'revoked' } });
				await Promise.all(
					[...connection.known].map((peer) =>
						connection.transport?.send(sealed, peer).catch(() => {})
					)
				);
			}
			await this.#close(connection);
		}
		await deleteHostJob(jobId);
		this.jobs = this.jobs.filter((job) => job.id !== jobId);
		delete this.#links[jobId];
		if (server && mailbox.mailboxAvailable(this.#options.mailbox)) {
			await mailbox.remove(jobId, this.#options.mailbox);
		}
	}

	async #register(job: HostJob): Promise<boolean> {
		try {
			const keys = await deriveKeys(job.token);
			const result = await mailbox.register(
				job.id,
				await mailbox.mailboxHash(keys.mailbox),
				job.expiresAt,
				this.#options.mailbox
			);
			return result.kind === 'ok';
		} catch {
			return false;
		}
	}

	#startPolling(generation: number): () => void {
		const run = () => {
			if (this.#generation === generation) void this.#pollAll();
		};
		const visible = () => {
			if (document.visibilityState === 'visible') run();
		};
		const timer = setInterval(run, this.#options.pollMs);
		const canListen = typeof window !== 'undefined' && typeof document !== 'undefined';
		if (canListen) {
			window.addEventListener('online', run);
			document.addEventListener('visibilitychange', visible);
		}
		return () => {
			clearInterval(timer);
			if (canListen) {
				window.removeEventListener('online', run);
				document.removeEventListener('visibilitychange', visible);
			}
		};
	}

	async #pollAll(): Promise<void> {
		if (store.readOnly || !store.project) return;
		if (!mailbox.mailboxAvailable(this.#options.mailbox)) return;
		const generation = this.#generation;
		for (const job of this.jobs) {
			if (
				job.server &&
				job.projectId === store.project.id &&
				job.revokedAt === undefined &&
				job.expiresAt > this.#options.now() &&
				!this.#dead.has(job.id) &&
				!this.#polling.has(job.id)
			) {
				this.#polling.add(job.id);
				void this.#pollJob(job, generation).finally(() => this.#polling.delete(job.id));
			}
		}
	}

	async #pollJob(job: HostJob, generation: number): Promise<void> {
		const env = this.#options.mailbox;
		const active = () =>
			this.#generation === generation &&
			!store.readOnly &&
			store.project?.id === job.projectId &&
			this.jobs.some((candidate) => candidate.id === job.id);
		try {
			const keys = await deriveKeys(job.token);
			const listing = await mailbox.list(job.id, env);
			if (listing.kind === 'gone' || listing.kind === 'notFound') this.#dead.add(job.id);
			if (listing.kind !== 'ok') return;
			for (const entry of listing.value) {
				const mark = `${job.id}:${entry.id}`;
				if (!active()) return;
				if (this.#left.has(mark)) continue;
				const fetched = await mailbox.download(job.id, entry.id, env);
				if (fetched.kind === 'gone' || fetched.kind === 'notFound') continue;
				if (fetched.kind !== 'ok') return;
				const message = await openMessage(keys.key, job.id, fetched.value);
				if (!message || message.frame.t !== 'photo' || !message.body) {
					this.#left.add(mark);
					continue;
				}
				if (!active()) return;
				const { shot } = message.frame;
				const result = await this.#place(
					job,
					{ room: shot.room, stepKey: shot.stepKey, takenAt: shot.takenAt, hash: shot.hash },
					message.body
				);
				if (result.ok) {
					await mailbox.discard(job.id, entry.id, env);
				} else if (result.reason === 'readOnly' || result.reason === 'storage') {
					return;
				} else if (result.reason === 'unknownJob') {
					return;
				} else {
					this.#left.add(mark);
				}
			}
		} catch {
			// The next round tries again.
		}
	}

	// Fallback path: a photo file shared from the phone and dropped into the app.
	// The job is looked up inside the queue, so a copy read from storage already carries the marks of earlier imports.
	importShot(tag: ShotTag, bytes: Uint8Array<ArrayBuffer>): Promise<PlaceResult> {
		return this.#enqueue(async () => {
			const job =
				this.jobs.find((candidate) => candidate.id === tag.jobId) ?? (await getJob(tag.jobId));
			if (!job || job.role !== 'host') return { ok: false, reason: 'unknownJob' };
			if (job.revokedAt !== undefined || job.expiresAt <= this.#options.now()) {
				return { ok: false, reason: 'unknownJob' };
			}
			const shot = { room: tag.room, stepKey: tag.stepKey };
			return placeShot(job, shot, bytes, this.#options.reencode);
		});
	}

	#place(
		job: HostJob,
		shot: { room: number; stepKey: string; takenAt?: string; hash?: string },
		bytes: Uint8Array<ArrayBuffer>
	): Promise<PlaceResult> {
		return this.#enqueue(() => placeShot(job, shot, bytes, this.#options.reencode));
	}

	#enqueue(task: () => Promise<PlaceResult>): Promise<PlaceResult> {
		const run = this.#queue.then(task);
		this.#queue = run.catch(() => {});
		return run.catch(() => ({ ok: false, reason: 'storage' }) as const);
	}

	async #begin(projectId: string, generation: number): Promise<void> {
		let jobs: HostJob[];
		try {
			jobs = await listHostJobs(projectId, this.#options.now());
		} catch {
			return;
		}
		if (this.#generation !== generation) return;
		this.jobs = jobs;
		if (jobs.length === 0 || store.readOnly) return;
		for (const job of this.jobs) void this.#connect(job, generation);
	}

	async #shutdown(): Promise<void> {
		this.#pollStop?.();
		this.#pollStop = undefined;
		this.#dead.clear();
		this.#left.clear();
		const open = [...this.#connections.values()];
		this.jobs = [];
		this.#links = {};
		await Promise.all(open.map((connection) => this.#close(connection)));
	}

	#setLink(connection: Connection, status?: LinkStatus): void {
		const expected = new Set<string>();
		for (const hashes of connection.pending.values()) hashes.forEach((hash) => expected.add(hash));
		this.#links[connection.jobId] = {
			status: status ?? this.#links[connection.jobId]?.status ?? 'idle',
			peers: connection.peers.size,
			expected: expected.size
		};
	}

	async #close(connection: Connection): Promise<void> {
		if (connection.closed) return;
		connection.closed = true;
		clearTimeout(connection.timer);
		this.#connections.delete(connection.jobId);
		connection.peers.clear();
		connection.pending.clear();
		this.#setLink(connection, 'ended');
		try {
			await connection.transport?.leave();
		} catch {
			// Already gone.
		}
	}

	async #connect(job: HostJob, generation: number): Promise<void> {
		if (this.#connections.has(job.id) || this.#generation !== generation) return;
		const now = this.#options.now();
		if (job.revokedAt !== undefined || job.expiresAt <= now) return;
		const connection: Connection = {
			jobId: job.id,
			keys: undefined as unknown as MirrorKeys,
			known: new Set(),
			peers: new Set(),
			pending: new Map(),
			inbound: Promise.resolve(),
			closed: false
		};
		this.#connections.set(job.id, connection);
		try {
			connection.keys = await deriveKeys(job.token);
			if (connection.closed) return;
			const transport = await this.#options.open({
				topic: connection.keys.topic,
				password: connection.keys.password
			});
			if (connection.closed) {
				await transport.leave().catch(() => {});
				return;
			}
			connection.transport = transport;
			this.#setLink(connection, 'searching');
			const expire = () => {
				const remaining = job.expiresAt - this.#options.now();
				if (remaining > 0) connection.timer = setTimeout(expire, Math.min(remaining, MAX_TIMER_MS));
				else void this.#close(connection);
			};
			expire();
			transport.onPeerJoin((peer) => void connection.known.add(peer));
			transport.onPeerLeave((peer) => {
				connection.known.delete(peer);
				connection.peers.delete(peer);
				connection.pending.delete(peer);
				if (!connection.closed) {
					this.#setLink(connection, connection.peers.size > 0 ? 'connected' : 'searching');
				}
			});
			transport.onData((data, peer) => {
				connection.inbound = connection.inbound.then(() =>
					this.#receive(job, connection, data, peer)
				);
			});
		} catch {
			await this.#close(connection);
		}
	}

	async #receive(
		job: HostJob,
		connection: Connection,
		data: Uint8Array<ArrayBuffer>,
		peer: string
	): Promise<void> {
		let message: Message | null;
		try {
			message = await openMessage(connection.keys.key, job.id, data);
		} catch {
			return;
		}
		if (!message || connection.closed || job.expiresAt <= this.#options.now()) return;
		const { frame, body } = message;
		if (frame.t === 'hello') {
			const pending = frame.pending.filter((shot) => !job.received.includes(shot.hash));
			connection.known.add(peer);
			connection.peers.add(peer);
			connection.pending.set(peer, new Set(pending.map((shot) => shot.hash)));
			this.#setLink(connection, 'connected');
			const received = frame.pending
				.map((shot) => shot.hash)
				.filter((hash) => job.received.includes(hash));
			await this.#reply(connection, peer, { t: 'state', received });
		} else if (frame.t === 'photo' && body && connection.peers.has(peer)) {
			const result = await this.#place(
				job,
				{
					room: frame.shot.room,
					stepKey: frame.shot.stepKey,
					takenAt: frame.shot.takenAt,
					hash: frame.shot.hash
				},
				body
			);
			if (connection.closed) return;
			if (result.ok) connection.pending.get(peer)?.delete(frame.shot.hash);
			this.#setLink(connection);
			const ack: Frame = result.ok
				? {
						t: 'ack',
						hash: frame.shot.hash,
						ok: true,
						...(result.duplicate ? { duplicate: true } : {})
					}
				: {
						t: 'ack',
						hash: frame.shot.hash,
						ok: false,
						reason: result.reason === 'unknownJob' ? 'storage' : result.reason
					};
			await this.#reply(connection, peer, ack);
		}
	}

	async #reply(connection: Connection, peer: string, frame: Frame): Promise<void> {
		try {
			const sealed = await sealMessage(connection.keys.key, connection.jobId, { frame });
			await connection.transport?.send(sealed, peer);
		} catch {
			// The phone is gone; it resumes with hello on the next connection.
		}
	}
}

export const mirrorHost = new MirrorHost();
