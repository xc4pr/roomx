import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '#lib/state/db.ts';
import { emptyProject, saveProject } from '#lib/state/persistence.ts';
import { updateSettings } from '#lib/state/settings.svelte.ts';
import { toasts } from '#lib/ui/toast.svelte.ts';
import {
	checkReminders,
	REMINDER_KEY,
	remindOnLeave,
	startReminders,
	type ReminderTrigger
} from './reminders.ts';

const DAY = 24 * 60 * 60 * 1000;
const IOS =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

let items: Record<string, string>;

function stubBrowser(options: { ios?: boolean; standalone?: boolean; usage?: number } = {}) {
	items = {};
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => items[key] ?? null,
		setItem: (key: string, value: string) => (items[key] = value),
		removeItem: (key: string) => delete items[key],
		key: () => null,
		length: 0
	});
	vi.stubGlobal('navigator', {
		userAgent: options.ios ? IOS : 'Mozilla/5.0 (X11; Linux x86_64)',
		platform: options.ios ? 'iPhone' : 'Linux x86_64',
		maxTouchPoints: options.ios ? 5 : 0,
		languages: ['de'],
		storage: {
			persisted: async () => true,
			estimate: async () => ({ usage: options.usage ?? 1000, quota: 100_000 })
		}
	});
	vi.stubGlobal('matchMedia', () => ({ matches: options.standalone ?? false }));
}

async function seed(ageDays: number, changedDaysAgo = ageDays) {
	const created = new Date(Date.now() - ageDays * DAY).toISOString();
	const project = emptyProject('p', 'Wohnung', created);
	project.updatedAt = new Date(Date.now() - changedDaysAgo * DAY).toISOString();
	await saveProject(project);
}

const reminder = () => toasts.items.find((item) => item.id === 'backup-reminder');

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
	toasts.dismiss('backup-reminder');
	stubBrowser();
	updateSettings({ lastBackupAt: null, language: 'de' });
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	toasts.dismiss('backup-reminder');
});

describe('backup reminder', () => {
	it('stays quiet without projects and for fresh data', async () => {
		await checkReminders('start');
		expect(reminder()).toBeUndefined();
		await seed(2);
		await checkReminders('start');
		expect(reminder()).toBeUndefined();
	});

	it('reminds after 14 days without a backup, at most once a day', async () => {
		await seed(30);
		await checkReminders('timer');
		expect(reminder()?.message).toMatch(/14 Tagen/);
		toasts.dismiss('backup-reminder');
		await checkReminders('timer');
		expect(reminder()).toBeUndefined();
		expect(JSON.parse(items[REMINDER_KEY]).lastReminderAt).toBeTypeOf('string');
	});

	it('is satisfied by a recent backup', async () => {
		await seed(30);
		updateSettings({ lastBackupAt: new Date(Date.now() - 3 * DAY).toISOString() });
		await checkReminders('timer');
		expect(reminder()).toBeUndefined();
	});

	it('offers a backup after a session with changes in an uninstalled iOS Safari', async () => {
		stubBrowser({ ios: true });
		await seed(1, 0.01);
		await checkReminders('timer');
		expect(reminder()).toBeUndefined();
		await checkReminders('start');
		expect(reminder()?.message).toMatch(/Safari/);
		expect(reminder()?.actionLabel).toBe('Jetzt sichern');
		toasts.dismiss('backup-reminder');
		await checkReminders('resume');
		expect(reminder()).toBeUndefined();
	});

	it('does not nag in the installed app or after a backup', async () => {
		stubBrowser({ ios: true, standalone: true });
		await seed(1, 0.01);
		await checkReminders('start');
		expect(reminder()).toBeUndefined();
		stubBrowser({ ios: true });
		updateSettings({ lastBackupAt: new Date().toISOString() });
		await checkReminders('start');
		expect(reminder()).toBeUndefined();
	});

	it('warns when the storage is nearly full', async () => {
		stubBrowser({ usage: 85_000 });
		await seed(1, 0.01);
		await checkReminders('timer');
		expect(reminder()?.message).toMatch(/85 %/);
		toasts.dismiss('backup-reminder');
		await checkReminders('timer');
		expect(reminder()).toBeUndefined();
	});

	it('does not warn below 80 percent', async () => {
		stubBrowser({ usage: 79_000 });
		await seed(1, 0.01);
		await checkReminders('timer');
		expect(reminder()).toBeUndefined();
	});
});

describe('scheduling', () => {
	function install() {
		const listeners = new Map<string, () => void>();
		vi.stubGlobal('window', {});
		vi.stubGlobal('document', {
			visibilityState: 'visible',
			addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
			removeEventListener: (name: string) => listeners.delete(name)
		});
		return listeners;
	}

	it('checks at the start, regularly afterwards, on return and on leaving a project', async () => {
		vi.useFakeTimers();
		const listeners = install();
		const calls: ReminderTrigger[] = [];
		const stop = startReminders({
			lastSyncedAt: () => '2026-10-01T00:00:00.000Z',
			run: async (trigger, synced) => {
				expect(synced).toBe('2026-10-01T00:00:00.000Z');
				calls.push(trigger);
			}
		});
		expect(calls).toEqual([]);
		await vi.advanceTimersByTimeAsync(8_000);
		expect(calls).toEqual(['start']);
		await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);
		expect(calls.filter((call) => call === 'timer')).toHaveLength(6);
		listeners.get('visibilitychange')?.();
		remindOnLeave();
		expect(calls.slice(-2)).toEqual(['resume', 'leave']);
		stop();
		const count = calls.length;
		await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
		expect(calls).toHaveLength(count);
		remindOnLeave();
		expect(calls).toHaveLength(count);
	});

	it('does not check while the page is hidden', async () => {
		vi.useFakeTimers();
		const listeners = install();
		const calls: ReminderTrigger[] = [];
		const stop = startReminders({
			lastSyncedAt: () => null,
			run: async (trigger) => void calls.push(trigger)
		});
		vi.stubGlobal('document', {
			visibilityState: 'hidden',
			addEventListener: () => undefined,
			removeEventListener: () => undefined
		});
		listeners.get('visibilitychange')?.();
		expect(calls).toEqual([]);
		stop();
	});
});
