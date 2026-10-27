import { t } from '#lib/i18n/index.svelte.ts';
import { rotatedBoardPos } from '#lib/features/board/rooms.ts';
import { store } from '#lib/state/project.svelte.ts';
import { activeFloorId, selectRoom, ui } from '#lib/state/ui.svelte.ts';
import { messages } from './i18n.ts';
import { fresh } from './fresh.svelte.ts';

export function createRoomAndSelect(): string | undefined {
	const project = store.project;
	if (!project) return undefined;
	const id = store.addRoom(
		t(messages, 'newRoomName', { n: project.rooms.length + 1 }),
		'other',
		activeFloorId(project)
	);
	if (!id) return undefined;
	fresh.roomId = id;
	ui.panelTab = 'dims';
	ui.focusRoomId = null;
	selectRoom(id);
	return id;
}

export function duplicateAndSelect(roomId: string): string | undefined {
	const id = store.duplicateRoom(roomId);
	if (id) selectRoom(id);
	return id;
}

export function rotateRoomBy(roomId: string, degrees: number): void {
	const room = store.room(roomId);
	if (room) store.moveRoom(roomId, rotatedBoardPos(room, degrees));
}

export function deleteRoom(roomId: string): void {
	store.removeRoom(roomId);
	if (ui.selectedRoomId === roomId) selectRoom(null);
}
