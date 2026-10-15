import type { Language, LengthUnit } from '#lib/core/units.ts';
import { detectLanguage, setLanguage } from '#lib/i18n/index.svelte.ts';

const STORAGE_KEY = 'roomx.settings';

export interface Settings {
	language: Language;
	unit: LengthUnit;
	serverUrl: string;
	token: string;
	deviceName: string;
	coachMarksSeen: boolean;
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
		coachMarksSeen: false,
		tourStep: null,
		tourSampleId: null,
		installHintSeen: false,
		lastBackupAt: null
	};
}

function read(): Settings {
	try {
		const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
		return { ...defaults(), ...(raw ? (JSON.parse(raw) as Partial<Settings>) : {}) };
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
