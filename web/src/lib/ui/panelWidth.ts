export const PANEL_MIN_WIDTH = 320;
export const PANEL_MAX_WIDTH = 720;
export const PANEL_MAX_FRACTION = 0.6;
export const PANEL_DEFAULT_WIDTH = 380;
export const PANEL_STEP = 16;
export const PANEL_STEP_LARGE = 64;
export const PANEL_STORAGE_KEY = 'roomx.panelWidth';

export interface PanelBounds {
	min: number;
	max: number;
}

export function panelBounds(windowWidth: number): PanelBounds {
	const fraction = Number.isFinite(windowWidth) ? Math.floor(windowWidth * PANEL_MAX_FRACTION) : 0;
	return {
		min: PANEL_MIN_WIDTH,
		max: Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, fraction))
	};
}

export function clampPanelWidth(width: number, windowWidth: number): number {
	const { min, max } = panelBounds(windowWidth);
	if (!Number.isFinite(width)) return Math.min(max, Math.max(min, PANEL_DEFAULT_WIDTH));
	return Math.min(max, Math.max(min, Math.round(width)));
}

export function dragPanelWidth(startWidth: number, deltaX: number, windowWidth: number): number {
	return clampPanelWidth(startWidth - deltaX, windowWidth);
}

export function stepPanelWidth(
	current: number,
	key: string,
	large: boolean,
	windowWidth: number
): number | null {
	const step = large ? PANEL_STEP_LARGE : PANEL_STEP;
	const { min, max } = panelBounds(windowWidth);
	switch (key) {
		case 'ArrowLeft':
			return clampPanelWidth(current + step, windowWidth);
		case 'ArrowRight':
			return clampPanelWidth(current - step, windowWidth);
		case 'Home':
			return min;
		case 'End':
			return max;
		default:
			return null;
	}
}

export function parseStoredWidth(raw: string | null | undefined): number | null {
	if (raw === null || raw === undefined || raw.trim() === '') return null;
	const value = Number(raw);
	if (!Number.isFinite(value)) return null;
	if (value < PANEL_MIN_WIDTH || value > PANEL_MAX_WIDTH) return null;
	return Math.round(value);
}

export function browserStorage(): Storage | null {
	if (typeof window === 'undefined') return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

export function loadPanelWidth(storage: Pick<Storage, 'getItem'> | null): number {
	if (!storage) return PANEL_DEFAULT_WIDTH;
	try {
		return parseStoredWidth(storage.getItem(PANEL_STORAGE_KEY)) ?? PANEL_DEFAULT_WIDTH;
	} catch {
		return PANEL_DEFAULT_WIDTH;
	}
}

export function savePanelWidth(storage: Pick<Storage, 'setItem'> | null, width: number): boolean {
	if (!storage || !Number.isFinite(width)) return false;
	try {
		storage.setItem(PANEL_STORAGE_KEY, String(Math.round(width)));
		return true;
	} catch {
		return false;
	}
}
