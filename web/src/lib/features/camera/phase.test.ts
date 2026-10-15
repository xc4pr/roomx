import { describe, expect, it } from 'vitest';
import { hoursLeft, jobPhase, needsSafariNote, SOON_MS, statusKind } from './phase.ts';

const HOUR = 60 * 60 * 1000;

describe('jobPhase', () => {
	const base = { revoked: false, expired: false };
	it('is open far from expiry', () => {
		expect(jobPhase({ ...base, expiresAt: 100 * HOUR }, 0)).toBe('open');
	});
	it('warns within 24 hours', () => {
		expect(jobPhase({ ...base, expiresAt: SOON_MS - 1 }, 0)).toBe('soon');
		expect(jobPhase({ ...base, expiresAt: SOON_MS }, 0)).toBe('open');
	});
	it('ends on revoke, flag or time', () => {
		expect(jobPhase({ revoked: true, expired: false, expiresAt: 100 * HOUR }, 0)).toBe('ended');
		expect(jobPhase({ revoked: false, expired: true, expiresAt: 100 * HOUR }, 0)).toBe('ended');
		expect(jobPhase({ ...base, expiresAt: 5 }, 5)).toBe('ended');
	});
	it('rounds hours up', () => {
		expect(hoursLeft(90 * 60 * 1000, 0)).toBe(2);
		expect(hoursLeft(0, 10)).toBe(1);
	});
});

describe('statusKind', () => {
	const base = { status: 'connected' as const, sent: 0, total: 0, revoked: false, expired: false };
	it('maps link states', () => {
		expect(statusKind({ ...base, status: 'searching' })).toBe('searching');
		expect(statusKind({ ...base, status: 'idle' })).toBe('offline');
		expect(statusKind(base)).toBe('connected');
		expect(statusKind({ ...base, sent: 7, total: 14 })).toBe('progress');
		expect(statusKind({ ...base, sent: 14, total: 14 })).toBe('allSent');
		expect(statusKind({ ...base, revoked: true })).toBe('ended');
	});
});

describe('needsSafariNote', () => {
	it('flags iOS browsers but not the installed app', () => {
		const iphone = {
			userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)',
			platform: 'iPhone',
			maxTouchPoints: 5
		};
		expect(needsSafariNote({ ...iphone, standalone: false })).toBe(true);
		expect(needsSafariNote({ ...iphone, standalone: true })).toBe(false);
		expect(
			needsSafariNote({
				userAgent: 'Mozilla/5.0 (Macintosh)',
				platform: 'MacIntel',
				maxTouchPoints: 5,
				standalone: false
			})
		).toBe(true);
		expect(
			needsSafariNote({
				userAgent: 'Mozilla/5.0 (Linux; Android 14)',
				platform: 'Linux armv8l',
				maxTouchPoints: 5,
				standalone: false
			})
		).toBe(false);
	});
});
