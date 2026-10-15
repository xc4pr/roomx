import { describe, expect, it } from 'vitest';
import {
	PANEL_DEFAULT_WIDTH,
	PANEL_MAX_WIDTH,
	PANEL_MIN_WIDTH,
	PANEL_STORAGE_KEY,
	clampPanelWidth,
	dragPanelWidth,
	loadPanelWidth,
	panelBounds,
	parseStoredWidth,
	savePanelWidth,
	stepPanelWidth
} from './panelWidth.ts';

function memoryStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	return {
		data,
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => void data.set(key, value)
	};
}

const throwing = {
	getItem: () => {
		throw new Error('blocked');
	},
	setItem: () => {
		throw new Error('quota');
	}
};

describe('panelBounds', () => {
	it('allows up to 60 percent of the window, capped at 720', () => {
		expect(panelBounds(1180)).toEqual({ min: 320, max: 708 });
		expect(panelBounds(1440)).toEqual({ min: 320, max: 720 });
		expect(panelBounds(900)).toEqual({ min: 320, max: 540 });
	});

	it('never drops the maximum below the minimum', () => {
		expect(panelBounds(400).max).toBe(PANEL_MIN_WIDTH);
		expect(panelBounds(0).max).toBe(PANEL_MIN_WIDTH);
		expect(panelBounds(Number.NaN).max).toBe(PANEL_MIN_WIDTH);
	});
});

describe('clampPanelWidth', () => {
	it('clamps to the bounds and rounds', () => {
		expect(clampPanelWidth(100, 1440)).toBe(320);
		expect(clampPanelWidth(900, 1440)).toBe(720);
		expect(clampPanelWidth(900, 1000)).toBe(600);
		expect(clampPanelWidth(400.4, 1440)).toBe(400);
	});

	it('falls back to the default for invalid input', () => {
		expect(clampPanelWidth(Number.NaN, 1440)).toBe(PANEL_DEFAULT_WIDTH);
		expect(clampPanelWidth(Infinity, 1440)).toBe(PANEL_DEFAULT_WIDTH);
	});

	it('shrinks with the window', () => {
		expect(clampPanelWidth(700, 1440)).toBe(700);
		expect(clampPanelWidth(700, 1000)).toBe(600);
	});
});

describe('dragPanelWidth', () => {
	it('widens when the edge moves left', () => {
		expect(dragPanelWidth(380, -100, 1440)).toBe(480);
		expect(dragPanelWidth(380, 40, 1440)).toBe(340);
	});

	it('stays within the bounds', () => {
		expect(dragPanelWidth(380, -1000, 1440)).toBe(PANEL_MAX_WIDTH);
		expect(dragPanelWidth(380, 1000, 1440)).toBe(PANEL_MIN_WIDTH);
	});
});

describe('stepPanelWidth', () => {
	it('moves by 16 px and by 64 px with shift', () => {
		expect(stepPanelWidth(380, 'ArrowLeft', false, 1440)).toBe(396);
		expect(stepPanelWidth(380, 'ArrowRight', false, 1440)).toBe(364);
		expect(stepPanelWidth(380, 'ArrowLeft', true, 1440)).toBe(444);
		expect(stepPanelWidth(380, 'ArrowRight', true, 1440)).toBe(320);
	});

	it('jumps to the bounds with Home and End', () => {
		expect(stepPanelWidth(500, 'Home', false, 1440)).toBe(320);
		expect(stepPanelWidth(500, 'End', false, 1440)).toBe(720);
		expect(stepPanelWidth(500, 'End', false, 1000)).toBe(600);
	});

	it('clamps at the edges and ignores other keys', () => {
		expect(stepPanelWidth(715, 'ArrowLeft', true, 1440)).toBe(720);
		expect(stepPanelWidth(324, 'ArrowRight', false, 1440)).toBe(320);
		expect(stepPanelWidth(380, 'ArrowUp', false, 1440)).toBeNull();
		expect(stepPanelWidth(380, 'a', false, 1440)).toBeNull();
	});
});

describe('parseStoredWidth', () => {
	it('accepts numbers inside the absolute range', () => {
		expect(parseStoredWidth('450')).toBe(450);
		expect(parseStoredWidth('450.6')).toBe(451);
		expect(parseStoredWidth('320')).toBe(320);
		expect(parseStoredWidth('720')).toBe(720);
	});

	it('rejects garbage and out-of-range values', () => {
		expect(parseStoredWidth(null)).toBeNull();
		expect(parseStoredWidth(undefined)).toBeNull();
		expect(parseStoredWidth('')).toBeNull();
		expect(parseStoredWidth('  ')).toBeNull();
		expect(parseStoredWidth('wide')).toBeNull();
		expect(parseStoredWidth('NaN')).toBeNull();
		expect(parseStoredWidth('100')).toBeNull();
		expect(parseStoredWidth('5000')).toBeNull();
	});
});

describe('loadPanelWidth and savePanelWidth', () => {
	it('round-trips through storage under the documented key', () => {
		const storage = memoryStorage();
		expect(savePanelWidth(storage, 512.4)).toBe(true);
		expect(storage.data.get(PANEL_STORAGE_KEY)).toBe('512');
		expect(PANEL_STORAGE_KEY).toBe('roomx.panelWidth');
		expect(loadPanelWidth(storage)).toBe(512);
	});

	it('uses the default without a stored value or storage', () => {
		expect(loadPanelWidth(memoryStorage())).toBe(PANEL_DEFAULT_WIDTH);
		expect(loadPanelWidth(null)).toBe(PANEL_DEFAULT_WIDTH);
		expect(loadPanelWidth(memoryStorage({ [PANEL_STORAGE_KEY]: 'abc' }))).toBe(PANEL_DEFAULT_WIDTH);
	});

	it('survives storage that throws', () => {
		expect(loadPanelWidth(throwing)).toBe(PANEL_DEFAULT_WIDTH);
		expect(savePanelWidth(throwing, 400)).toBe(false);
		expect(savePanelWidth(null, 400)).toBe(false);
		expect(savePanelWidth(memoryStorage(), Number.NaN)).toBe(false);
	});
});
