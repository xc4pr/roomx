import type { Language, LengthUnit } from '#lib/core/units.ts';
import { detectLanguage, setLanguage } from '#lib/i18n/index.svelte.ts';

const STORAGE_KEY = 'roomx.settings';

export interface Settings {
	language: Language;
	unit: LengthUnit;
	serverUrl: string;
	token: string;
	deviceName: string;
	tourSeen: boolean;
	tourStep: number | null;
	tourSampleId: string | null;
	installHintSeen: boolean;
	lastBackupAt: string | null;
}

function defaults(): Settings {
	return {
		language: typeof navigator === 'undefined' ? 'de' : detectLanguage(),
		unit: 'cm',
		serverUrl: '',
		token: '',
		deviceName: '',
		tourSeen: false,
		tourStep: null,
		tourSampleId: null,
		installHintSeen: false,
		lastBackupAt: null
	};
}

function read(): Settings {
	try {
		const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
		const base = defaults();
		const parsed: unknown = raw ? JSON.parse(raw) : null;
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return base;
		const stored = parsed as Record<string, unknown>;
		const result: Record<string, unknown> = { ...base };
		for (const key of Object.keys(base)) {
			if (key in stored) result[key] = stored[key];
		}
		return result as unknown as Settings;
	} catch {
		return defaults();
	}
}

export const settings = $state<Settings>(read());

setLanguage(settings.language);

export function updateSettings(patch: Partial<Settings>): void {
	Object.assign(settings, patch);
	if (patch.language) setLanguage(patch.language);
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		return;
	}
}
