import { elementFitsRoom } from '#lib/core/elements.ts';
import { ROOM_TYPES, type Room, type RoomType } from '#lib/core/schema.ts';
import { roomTypeNames } from '#lib/i18n/common.ts';
import { locale, t } from '#lib/i18n/index.svelte.ts';
import { store } from '#lib/state/project.svelte.ts';
import { toasts } from '#lib/ui/toast.svelte.ts';
import { messages } from './i18n.ts';
import { isAutoName, uniqueName } from './naming.ts';

export function selectableTypes(_current: RoomType): RoomType[] {
	return [...ROOM_TYPES];
}

export interface TypeChangeNotice {
	// Doors and windows that moved into the wall of an indoor neighbour, per neighbour.
	moved: { room: string; count: number }[];
	// Elements that stay in the room but do not fit its new type.
	unfit: number;
}

export function describeTypeChange(
	roomId: string,
	elementIdsBefore: readonly string[],
	after: readonly Room[]
): TypeChangeNotice {
	const current = after.find((room) => room.id === roomId);
	if (!current) return { moved: [], unfit: 0 };
	const kept = new Set(current.elements.map((element) => element.id));
	const left = new Set(elementIdsBefore.filter((id) => !kept.has(id)));
	const moved = after
		.filter((room) => room.id !== roomId)
		.map((room) => ({
			room: room.name,
			count: room.elements.filter((element) => left.has(element.id)).length
		}))
		.filter((entry) => entry.count > 0);
	return { moved, unfit: current.elements.filter((e) => !elementFitsRoom(current, e)).length };
}

export function noticeMessage(notice: TypeChangeNotice): string {
	const parts = notice.moved.map((entry) =>
		t(messages, entry.count === 1 ? 'typeMoved_one' : 'typeMoved_other', {
			n: entry.count,
			room: entry.room
		})
	);
	if (notice.unfit > 0) parts.push(t(messages, 'typeUnfit', { n: notice.unfit }));
	return parts.join(' ');
}

export function changeType(roomId: string, type: RoomType): void {
	const project = store.project;
	const room = project?.rooms.find((candidate) => candidate.id === roomId);
	if (!project || !room || room.type === type) return;
	const before = room.elements.map((element) => element.id);
	const taken = project.rooms.filter((other) => other.id !== roomId).map((other) => other.name);
	const name = isAutoName(room.name, roomTypeNames)
		? uniqueName(roomTypeNames[locale.language][type], taken)
		: undefined;
	store.changeRoomType(roomId, type, name);
	const notice = describeTypeChange(roomId, before, store.project?.rooms ?? []);
	if (notice.moved.length > 0 || notice.unfit > 0) {
		toasts.show({ message: noticeMessage(notice), duration: 8000 });
	}
}
