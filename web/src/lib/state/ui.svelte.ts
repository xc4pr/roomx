import type { ElementKind } from '#lib/core/schema.ts';

export type PanelTab = 'dims' | 'elements' | 'photos';

export interface UiState {
	selectedRoomId: string | null;
	selectedElementId: string | null;
	selectedItemId: string | null;
	focusRoomId: string | null;
	panelTab: PanelTab;
	placingKind: ElementKind | null;
	wallViewWall: number | null;
	electricalLayer: boolean;
}

export const ui = $state<UiState>({
	selectedRoomId: null,
	selectedElementId: null,
	selectedItemId: null,
	focusRoomId: null,
	panelTab: 'dims',
	placingKind: null,
	wallViewWall: null,
	electricalLayer: true
});

export function selectRoom(roomId: string | null): void {
	if (ui.selectedRoomId !== roomId) {
		ui.selectedElementId = null;
		ui.selectedItemId = null;
		ui.wallViewWall = null;
	}
	ui.selectedRoomId = roomId;
	if (roomId === null) ui.focusRoomId = null;
}

export function resetUi(): void {
	selectRoom(null);
	ui.panelTab = 'dims';
	ui.placingKind = null;
}
