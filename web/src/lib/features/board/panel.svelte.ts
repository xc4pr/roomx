import { panelLayout } from '#lib/ui/panelWidth.svelte.ts';
import type { SheetSnap } from '#lib/ui/sheet.ts';

let snap = $state<SheetSnap>('half');

export const panel = {
	get snap(): SheetSnap {
		return snap;
	},
	set snap(value: SheetSnap) {
		snap = value;
	},
	get width(): number {
		return panelLayout.width;
	},
	get settledWidth(): number {
		return panelLayout.settledWidth;
	}
};
