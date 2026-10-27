import type { ElementKind, Project } from '#lib/core/schema.ts';

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
	// Floor shown in plan, furnishing and walk mode (projects with floors); null = the first one.
	floorId: string | null;
	selectedStairId: string | null;
}

export const ui = $state<UiState>({
	selectedRoomId: null,
	selectedElementId: null,
	selectedItemId: null,
	focusRoomId: null,
	panelTab: 'dims',
	placingKind: null,
	wallViewWall: null,
	electricalLayer: true,
	floorId: null,
	selectedStairId: null
});

// The floor in use: the chosen one if it still exists, else the first; undefined without floors.
export function activeFloorId(
	project: Pick<Project, 'floors'> | null | undefined
): string | undefined {
	const floors = project?.floors ?? [];
	if (floors.length === 0) return undefined;
	return floors.some((floor) => floor.id === ui.floorId) ? (ui.floorId ?? undefined) : floors[0].id;
}

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
	ui.floorId = null;
	ui.selectedStairId = null;
	ui.panelTab = 'dims';
	ui.placingKind = null;
}
