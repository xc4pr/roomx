import {
	PANEL_DEFAULT_WIDTH,
	browserStorage,
	clampPanelWidth,
	loadPanelWidth,
	panelBounds,
	savePanelWidth,
	type PanelBounds
} from './panelWidth.ts';

const FALLBACK_WINDOW = 1440;

let preferred = $state(loadPanelWidth(browserStorage()));
let windowWidth = $state(typeof window === 'undefined' ? FALLBACK_WINDOW : window.innerWidth);
let dragging = $state(false);
let frozen = $state(PANEL_DEFAULT_WIDTH);

if (typeof window !== 'undefined') {
	window.addEventListener('resize', () => {
		windowWidth = window.innerWidth;
	});
}

function current(): number {
	return clampPanelWidth(preferred, windowWidth);
}

function persist(): void {
	savePanelWidth(browserStorage(), preferred);
}

function set(width: number): void {
	preferred = clampPanelWidth(width, windowWidth);
	persist();
}

export const panelLayout = {
	get width(): number {
		return current();
	},
	get settledWidth(): number {
		return dragging ? frozen : current();
	},
	get dragging(): boolean {
		return dragging;
	},
	get bounds(): PanelBounds {
		return panelBounds(windowWidth);
	},
	setWindowWidth(width: number): void {
		windowWidth = width;
	},
	begin(): void {
		frozen = current();
		dragging = true;
	},
	drag(width: number): void {
		preferred = clampPanelWidth(width, windowWidth);
	},
	end(): void {
		if (!dragging) return;
		dragging = false;
		persist();
	},
	set,
	reset(): void {
		set(PANEL_DEFAULT_WIDTH);
	}
};
