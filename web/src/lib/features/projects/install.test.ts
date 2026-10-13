import { describe, expect, it } from 'vitest';
import { shouldShowInstallHint, type InstallEnvironment } from './install.ts';

const safari: InstallEnvironment = {
	userAgent:
		'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
	platform: 'iPad',
	maxTouchPoints: 5,
	standalone: false
};

describe('shouldShowInstallHint', () => {
	it('shows in iOS Safari outside the installed app', () => {
		expect(shouldShowInstallHint(safari, false)).toBe(true);
	});

	it('stays hidden once seen or installed', () => {
		expect(shouldShowInstallHint(safari, true)).toBe(false);
		expect(shouldShowInstallHint({ ...safari, standalone: true }, false)).toBe(false);
	});

	it('stays hidden on other browsers', () => {
		const chrome = { ...safari, userAgent: safari.userAgent + ' CriOS/120' };
		expect(shouldShowInstallHint(chrome, false)).toBe(false);
		const desktop = {
			userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
			platform: 'Linux x86_64',
			maxTouchPoints: 0,
			standalone: false
		};
		expect(shouldShowInstallHint(desktop, false)).toBe(false);
	});
});
