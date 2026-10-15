import { t } from '#lib/i18n/index.svelte.ts';
import { isIosSafari, readEnvironment } from '#lib/features/projects/install.ts';
import { readProjectTimes } from '#lib/state/persistence.ts';
import { settings } from '#lib/state/settings.svelte.ts';
import { reminderDue, sessionReminderDue } from '#lib/state/sync/reminder.ts';
import { toasts } from '#lib/ui/toast.svelte.ts';
import { backupAndAnnounce } from './backupFlow.ts';
import { messages } from './i18n.ts';
import { quotaLevel, quotaShare, readStorage } from './storage.ts';

export const REMINDER_KEY = 'roomx.reminder';
const START_DELAY_MS = 8_000;
const INTERVAL_MS = 30 * 60 * 1000;
const QUOTA_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type ReminderTrigger = 'start' | 'resume' | 'leave' | 'timer';

interface Persisted {
	lastReminderAt: string | null;
	lastOfferAt: string | null;
	lastQuotaAt: string | null;
}

function text(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

function readPersisted(): Persisted {
	try {
		const raw = globalThis.localStorage?.getItem(REMINDER_KEY);
		const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
		return {
			lastReminderAt: text(parsed.lastReminderAt),
			lastOfferAt: text(parsed.lastOfferAt),
			lastQuotaAt: text(parsed.lastQuotaAt)
		};
	} catch {
		return { lastReminderAt: null, lastOfferAt: null, lastQuotaAt: null };
	}
}

function writePersisted(patch: Partial<Persisted>): void {
	const next = { ...readPersisted(), ...patch };
	try {
		globalThis.localStorage?.setItem(REMINDER_KEY, JSON.stringify(next));
	} catch {
		return;
	}
}

function offerBackup(message: string, kind: 'info' | 'error' = 'info'): void {
	toasts.show({
		id: 'backup-reminder',
		message,
		kind,
		actionLabel: t(messages, 'reminderAction'),
		onaction: () => void backupAndAnnounce(),
		duration: 14_000
	});
}

async function checkQuota(now: Date, persisted: Persisted): Promise<void> {
	const last = persisted.lastQuotaAt ? Date.parse(persisted.lastQuotaAt) : 0;
	if (now.getTime() - last < QUOTA_INTERVAL_MS) return;
	const info = await readStorage(false);
	const level = quotaLevel(info);
	if (level !== 'warn' && level !== 'full') return;
	const percent = Math.round((quotaShare(info) ?? 0) * 100);
	writePersisted({ lastQuotaAt: now.toISOString() });
	offerBackup(
		t(messages, level === 'full' ? 'quotaFullToast' : 'quotaWarnToast', { percent }),
		'error'
	);
}

export async function checkReminders(
	trigger: ReminderTrigger,
	lastSyncedAt: string | null = null
): Promise<void> {
	try {
		const now = new Date();
		const times = await readProjectTimes();
		if (times.count === 0) return;
		const persisted = readPersisted();
		const env = readEnvironment();
		const iosUninstalled = isIosSafari(env) && !env.standalone;
		if (
			trigger !== 'timer' &&
			sessionReminderDue({
				now: now.getTime(),
				iosUninstalled,
				latestChangeAt: times.latestChangeAt,
				lastSyncedAt,
				lastBackupAt: settings.lastBackupAt,
				lastOfferAt: persisted.lastOfferAt
			})
		) {
			writePersisted({ lastOfferAt: now.toISOString() });
			offerBackup(t(messages, 'reminderSession'));
			return;
		}
		if (
			reminderDue({
				now: now.getTime(),
				lastSyncedAt,
				lastBackupAt: settings.lastBackupAt,
				earliestCreatedAt: times.earliestCreatedAt,
				lastReminderAt: persisted.lastReminderAt
			})
		) {
			writePersisted({ lastReminderAt: now.toISOString() });
			offerBackup(t(messages, 'reminderPeriodic'));
			return;
		}
		await checkQuota(now, persisted);
	} catch {
		return;
	}
}

export interface ReminderOptions {
	lastSyncedAt: () => string | null;
	run?: (trigger: ReminderTrigger, lastSyncedAt: string | null) => Promise<void>;
	startDelayMs?: number;
	intervalMs?: number;
}

let active: ReminderOptions | null = null;

export function remindOnLeave(): void {
	if (active) void (active.run ?? checkReminders)('leave', active.lastSyncedAt());
}

// Runs for both editions and keeps checking, so a long session cannot skip the reminder.
export function startReminders(options: ReminderOptions): () => void {
	if (typeof window === 'undefined') return () => {};
	active = options;
	const check = options.run ?? checkReminders;
	const run = (trigger: ReminderTrigger) => void check(trigger, options.lastSyncedAt());
	const starter = setTimeout(() => run('start'), options.startDelayMs ?? START_DELAY_MS);
	const interval = setInterval(() => run('timer'), options.intervalMs ?? INTERVAL_MS);
	const onVisible = () => {
		if (document.visibilityState === 'visible') run('resume');
	};
	document.addEventListener('visibilitychange', onVisible);
	return () => {
		clearTimeout(starter);
		clearInterval(interval);
		document.removeEventListener('visibilitychange', onVisible);
		if (active === options) active = null;
	};
}
