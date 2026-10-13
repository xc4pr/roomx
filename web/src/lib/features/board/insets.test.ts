import { describe, expect, it } from 'vitest';
import { FAB_INSET, FAB_TOP_INSET, CONTROLS_INSET, coverInsets } from './insets.ts';

const base = {
	width: 1180,
	height: 820,
	wide: true,
	panelOpen: false,
	snap: 'half',
	fab: true
} as const;

describe('coverInsets', () => {
	it('reserves the zoom bar and the add button without a panel', () => {
		expect(coverInsets(base)).toEqual({
			left: CONTROLS_INSET,
			top: 0,
			right: 0,
			bottom: FAB_INSET
		});
	});

	it('reserves the floating panel on wide screens', () => {
		const insets = coverInsets({ ...base, panelOpen: true });
		expect(insets.right).toBeCloseTo(404);
		expect(insets.bottom).toBe(FAB_INSET);
	});

	it('follows the sheet snap on narrow screens', () => {
		const half = coverInsets({ ...base, wide: false, width: 820, height: 1180, panelOpen: true });
		const peek = coverInsets({
			...base,
			wide: false,
			width: 820,
			height: 1180,
			panelOpen: true,
			snap: 'peek'
		});
		expect(half.bottom).toBeCloseTo(1180 * 0.58);
		expect(peek.bottom).toBeCloseTo(1180 * 0.3);
		expect(half.top).toBe(FAB_TOP_INSET);
	});

	it('does not shrink the board further when the sheet is full', () => {
		const full = coverInsets({ ...base, wide: false, panelOpen: true, snap: 'full' });
		expect(full.bottom).toBeCloseTo(820 * 0.58);
	});

	it('returns no insets before the board is measured', () => {
		expect(coverInsets({ ...base, width: 0 })).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
	});
});
