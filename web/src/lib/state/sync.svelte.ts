import { untrack } from 'svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { newId } from '#lib/core/ids.ts';
import { t } from '#lib/i18n/index.svelte.ts';
import { toasts } from '#lib/ui/toast.svelte.ts';
import { db } from './db.ts';
import { onLocalChange } from './persistence.ts';
import { store } from './project.svelte.ts';
import { settings } from './settings.svelte.ts';
import { createApi, type Api } from './sync/api.ts';
import { SyncController, type Resolution, type SyncSnapshot } from './sync/controller.ts';
import { messages } from './sync/i18n.ts';
import { createOriginChecker } from './sync/origin.ts';
import { prefetchPhotos, setPhotoSource } from './sync/photos.ts';
import { reminderDue } from './sync/reminder.ts';
import { runSync, type Host, type RunResult } from './sync/runner.ts';
import {
	normalizeServerUrl,
	testConnection,
	type ConnectionResult,
	type Fetch
} from './sync/connection.ts';

export type { SyncStatus } from './sync/controller.ts';
export { ensurePhoto, onPhotoStored } from './sync/photos.ts';
export type { ConnectionResult } from './sync/connection.ts';

const STORAGE_KEY = 'roomx.sync';
const START_DELAY_MS = 400;
const SETTINGS_DELAY_MS = 800;
const REMINDER_DELAY_MS = 8_000;

interface Persisted {
	lastSyncedAt: string | null;
	lastReminderAt: string | null;
}

function readPersisted(): Persisted {
	try {
		const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
		const parsed = raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
		return {
			lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
			lastReminderAt: typeof parsed.lastReminderAt === 'string' ? parsed.lastReminderAt : null
		};
	} catch {
		return { lastSyncedAt: null, lastReminderAt: null };
	}
}

function writePersisted(patch: Partial<Persisted>): void {
	persisted = { ...persisted, ...patch };
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(persisted));
	} catch {
		return;
	}
}

let persisted = readPersisted();

export const syncState = $state<{
	status: 'off' | 'synced' | 'pending' | 'offline' | 'conflict';
	lastSyncedAt: string | null;
}>({
	status: 'off',
	lastSyncedAt: persisted.lastSyncedAt
});

export const syncDetail = $state({
	running: false,
	unauthorized: false,
	originFound: false
});

interface Target {
	api: Api;
}

const fetcher: Fetch = (input, init) => globalThis.fetch(input, init);

const host: Host = {
	openProjectId: () => store.project?.id ?? null,
	flush: () => store.flush(),
	replaceOpen: (project) => store.replace(project),
	closeOpen: () => {
		void store.close();
		void goto(resolve('/'));
	}
};

let controller: SyncController<Target> | null = null;
let runCancel: AbortController | null = null;

function ownOrigin(): string | null {
	return globalThis.location?.origin && /^https?:/.test(globalThis.location.origin)
		? globalThis.location.origin
		: null;
}

const originChecker = createOriginChecker(ownOrigin, fetcher, (found) => {
	syncDetail.originFound = found !== null;
});

async function resolveTarget(): Promise<Resolution<Target>> {
	const token = settings.token.trim();
	let base: string | null;
	if (settings.serverUrl.trim()) {
		base = normalizeServerUrl(settings.serverUrl);
	} else {
		const found = await originChecker.check();
		if (found === undefined) return { kind: 'retry' };
		base = found;
	}
	if (!base || !token) {
		setPhotoSource(null);
		return { kind: 'off' };
	}
	runCancel = new AbortController();
	const api = createApi(base, token, fetcher, runCancel.signal);
	setPhotoSource(api);
	return { kind: 'target', target: { api } };
}

function conflictName(name: string, date: string): string {
	const device = settings.deviceName.trim();
	return device
		? t(messages, 'conflictCopyName', { name, device, date })
		: t(messages, 'conflictCopyNameAnonymous', { name, date });
}

function announceConflicts(result: RunResult): void {
	const [first] = result.conflicts;
	if (!first) return;
	const message =
		result.conflicts.length === 1
			? t(messages, 'conflictToast', {
					name: first.originalName,
					copy: first.name
				})
			: t(messages, 'conflictToastMany', { n: result.conflicts.length });
	toasts.show({ id: 'sync-conflict', message, kind: 'info', duration: 10_000 });
}

async function checkReminder(): Promise<void> {
	try {
		const projects = (await db.projects.toArray()).filter((project) => !project.deleted);
		const earliest = projects.map((project) => project.createdAt).sort()[0] ?? null;
		const due = reminderDue({
			now: Date.now(),
			lastSyncedAt: syncState.lastSyncedAt,
			lastBackupAt: settings.lastBackupAt,
			earliestCreatedAt: earliest,
			lastReminderAt: persisted.lastReminderAt
		});
		if (!due) return;
		writePersisted({ lastReminderAt: new Date().toISOString() });
		toasts.show({
			id: 'backup-reminder',
			message: t(messages, 'backupReminder'),
			actionLabel: t(messages, 'backupAction'),
			onaction: () => {
				const latest = projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
				void goto(latest ? resolve('/p/[id]/share', { id: latest.id }) : resolve('/'));
			},
			duration: 12_000
		});
	} catch {
		return;
	}
}

function onResult(result: RunResult): void {
	announceConflicts(result);
	if (result.photoHashes.length > 0) void prefetchPhotos(result.photoHashes);
	void checkReminder();
}

function onReport(snapshot: SyncSnapshot): void {
	syncState.status = snapshot.status;
	syncState.lastSyncedAt = snapshot.lastSyncedAt;
	syncDetail.running = snapshot.running;
	syncDetail.unauthorized = snapshot.unauthorized;
	if (snapshot.lastSyncedAt !== persisted.lastSyncedAt) {
		writePersisted({ lastSyncedAt: snapshot.lastSyncedAt });
	}
}

export async function syncNow(): Promise<void> {
	await controller?.syncNow();
}

export function testServerConnection(url: string, token: string): Promise<ConnectionResult> {
	return testConnection(url, token, fetcher, ownOrigin());
}

export function startSync(): () => void {
	if (typeof window === 'undefined') return () => {};
	controller?.dispose();
	originChecker.reset();
	const active = new SyncController<Target>({
		resolveTarget,
		abortRun: () => runCancel?.abort(),
		run: (target) =>
			runSync({
				api: target.api,
				host,
				newId,
				now: () => new Date(),
				conflictName
			}),
		report: onReport,
		onResult,
		lastSyncedAt: persisted.lastSyncedAt
	});
	controller = active;

	const stopChanges = onLocalChange(() => active.localChange());
	const onOnline = () => active.reconnect();
	const onVisible = () => {
		if (document.visibilityState !== 'visible') return;
		active.foreground();
		void checkReminder();
	};
	window.addEventListener('online', onOnline);
	document.addEventListener('visibilitychange', onVisible);

	let first = true;
	const stopSettings = $effect.root(() => {
		$effect(() => {
			void settings.serverUrl;
			void settings.token;
			untrack(() => active.schedule(first ? START_DELAY_MS : SETTINGS_DELAY_MS));
			first = false;
		});
	});
	const reminderTimer = setTimeout(() => void checkReminder(), REMINDER_DELAY_MS);

	return () => {
		clearTimeout(reminderTimer);
		stopSettings();
		stopChanges();
		window.removeEventListener('online', onOnline);
		document.removeEventListener('visibilitychange', onVisible);
		active.dispose();
		if (controller === active) controller = null;
		setPhotoSource(null);
	};
}
