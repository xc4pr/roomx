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
