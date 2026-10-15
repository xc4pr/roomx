import { PANEL_MAX_FRACTION } from '#lib/ui/panelWidth.ts';
import { SHEET_FRACTIONS, type SheetSnap } from '#lib/ui/sheet.ts';
import { NO_INSETS, type Insets } from './camera.ts';

export const CONTROLS_INSET = 76;
export const FAB_INSET = 96;
export const FAB_TOP_INSET = 84;
export const SHEET_MAX_COVER = 0.58;

export interface CoverInput {
	width: number;
	height: number;
	wide: boolean;
	panelOpen: boolean;
	panelWidth: number;
	snap: SheetSnap;
	fab: boolean;
}

export function coverInsets(input: CoverInput): Insets {
	if (input.width === 0 || input.height === 0) return NO_INSETS;
	const insets: Insets = { ...NO_INSETS, left: CONTROLS_INSET };
	if (input.panelOpen && input.wide) {
		insets.right = Math.min(input.panelWidth, input.width * PANEL_MAX_FRACTION) + 24;
		if (input.fab) insets.bottom = FAB_INSET;
	} else if (input.panelOpen) {
		insets.bottom = input.height * Math.min(SHEET_FRACTIONS[input.snap], SHEET_MAX_COVER);
		if (input.fab) insets.top = FAB_TOP_INSET;
	} else if (input.fab) {
		insets.bottom = FAB_INSET;
	}
	return insets;
}
