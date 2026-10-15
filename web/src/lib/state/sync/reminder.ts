export const REMINDER_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
export const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface ReminderInput {
	now: number;
	lastSyncedAt: string | null;
	lastBackupAt: string | null;
	earliestCreatedAt: string | null;
	lastReminderAt: string | null;
}

function time(value: string | null): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

export function reminderDue(input: ReminderInput): boolean {
	const created = time(input.earliestCreatedAt);
	if (created === null) return false;
	const reference = Math.max(created, time(input.lastSyncedAt) ?? 0, time(input.lastBackupAt) ?? 0);
	if (input.now - reference < REMINDER_AFTER_MS) return false;
	const reminded = time(input.lastReminderAt);
	return reminded === null || input.now - reminded >= REMINDER_INTERVAL_MS;
}

export const SESSION_OFFER_GAP_MS = 10 * 60 * 1000;

export interface SessionReminderInput {
	now: number;
	iosUninstalled: boolean;
	latestChangeAt: string | null;
	lastSyncedAt: string | null;
	lastBackupAt: string | null;
	lastOfferAt: string | null;
}

// Safari may delete the data of a site that was not visited for 7 days, unless it is installed.
// So on an uninstalled iOS Safari every session with changes gets a backup offer.
export function sessionReminderDue(input: SessionReminderInput): boolean {
	if (!input.iosUninstalled) return false;
	const changed = time(input.latestChangeAt);
	if (changed === null) return false;
	const safe = Math.max(time(input.lastBackupAt) ?? 0, time(input.lastSyncedAt) ?? 0);
	if (changed <= safe) return false;
	const offered = time(input.lastOfferAt);
	if (offered === null) return true;
	return changed > offered && input.now - offered >= SESSION_OFFER_GAP_MS;
}
