import { roomTypeNames } from '#lib/i18n/common.ts';
import { locale, t } from '#lib/i18n/index.svelte.ts';
import { rotatedBoardPos } from '#lib/features/board/rooms.ts';
import { store } from '#lib/state/project.svelte.ts';
import { selectRoom, ui } from '#lib/state/ui.svelte.ts';
import type { RoomType } from '#lib/core/schema.ts';
import { messages } from './i18n.ts';
import { fresh } from './fresh.svelte.ts';
import { isAutoName, uniqueName } from './naming.ts';

export function createRoomAndSelect(): string | undefined {
	const project = store.project;
	if (!project) return undefined;
	const id = store.addRoom(t(messages, 'newRoomName', { n: project.rooms.length + 1 }));
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

export function setRoomType(roomId: string, type: RoomType): void {
	store.mutate((project) => {
		const room = project.rooms.find((candidate) => candidate.id === roomId);
		if (!room) return;
		room.type = type;
		if (isAutoName(room.name, roomTypeNames)) {
			const taken = project.rooms.filter((other) => other.id !== roomId).map((other) => other.name);
			room.name = uniqueName(roomTypeNames[locale.language][type], taken);
		}
	});
}
