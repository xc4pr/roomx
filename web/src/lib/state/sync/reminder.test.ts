import { describe, expect, it } from 'vitest';
import { reminderDue, type ReminderInput } from './reminder.ts';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-10-30T12:00:00Z');
const ago = (days: number) => new Date(now - days * DAY).toISOString();

const input = (patch: Partial<ReminderInput> = {}): ReminderInput => ({
	now,
	lastSyncedAt: null,
	lastBackupAt: null,
	earliestCreatedAt: ago(30),
	lastReminderAt: null,
	...patch
});

describe('reminderDue', () => {
	it('stays quiet without projects', () => {
		expect(reminderDue(input({ earliestCreatedAt: null }))).toBe(false);
	});

	it('stays quiet for fresh data', () => {
		expect(reminderDue(input({ earliestCreatedAt: ago(3) }))).toBe(false);
	});

	it('reminds when nothing was synced or backed up for 14 days', () => {
		expect(reminderDue(input())).toBe(true);
		expect(reminderDue(input({ lastSyncedAt: ago(15), lastBackupAt: ago(20) }))).toBe(true);
	});

	it('is satisfied by a recent sync or a recent backup', () => {
		expect(reminderDue(input({ lastSyncedAt: ago(2) }))).toBe(false);
		expect(reminderDue(input({ lastBackupAt: ago(13) }))).toBe(false);
	});

	it('reminds at most once per day', () => {
		expect(reminderDue(input({ lastReminderAt: ago(0.5) }))).toBe(false);
		expect(reminderDue(input({ lastReminderAt: ago(1.1) }))).toBe(true);
	});

	it('ignores unparsable dates', () => {
		expect(reminderDue(input({ lastSyncedAt: 'x', lastReminderAt: 'y' }))).toBe(true);
	});
});
