import { OUTDOOR_TYPES, ROOM_TYPES, type RoomType } from '#lib/core/schema.ts';
import { roomTypeNames } from '#lib/i18n/common.ts';
import { locale } from '#lib/i18n/index.svelte.ts';
import { store } from '#lib/state/project.svelte.ts';
import { isAutoName, uniqueName } from './naming.ts';

// Outdoor types come with their own package; a room that already has one keeps showing it.
export function selectableTypes(current: RoomType): RoomType[] {
	return ROOM_TYPES.filter(
		(type) => type === current || !(OUTDOOR_TYPES as readonly string[]).includes(type)
	);
}

export function changeType(roomId: string, type: RoomType): void {
	const project = store.project;
	const room = project?.rooms.find((candidate) => candidate.id === roomId);
	if (!project || !room || room.type === type) return;
	const taken = project.rooms.filter((other) => other.id !== roomId).map((other) => other.name);
	const name = isAutoName(room.name, roomTypeNames)
		? uniqueName(roomTypeNames[locale.language][type], taken)
		: undefined;
	store.changeRoomType(roomId, type, name);
}
