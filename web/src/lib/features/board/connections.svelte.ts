import { mirroredOpenings, wallLinks } from '#lib/core/adjacency.ts';
import type { MirroredOpening, WallLink } from '#lib/core/adjacency.ts';
import type { Room, RoomElement } from '#lib/core/schema.ts';
import { store } from '#lib/state/project.svelte.ts';

const links = $derived(wallLinks(store.project?.rooms ?? []));
const mirrored = $derived(mirroredOpenings(store.project?.rooms ?? []));
const sharedIds = $derived(
	new Set(mirrored.flatMap((entry) => [entry.element.id, originalId(entry.element.id)]))
);

export function originalId(id: string): string {
	const at = id.indexOf('@');
	return at < 0 ? id : id.slice(0, at);
}

export const connections = {
	get links(): readonly WallLink[] {
		return links;
	},
	get mirrored(): readonly MirroredOpening[] {
		return mirrored;
	},
	get sharedIds(): ReadonlySet<string> {
		return sharedIds;
	},
	roomLinks(roomId: string): WallLink[] {
		return links.filter((link) => link.roomId === roomId);
	},
	mirroredIn(roomId: string): MirroredOpening[] {
		return mirrored.filter((entry) => entry.roomId === roomId);
	},
	withNeighbourOpenings(room: Room): Room {
		const extra: RoomElement[] = mirrored
			.filter((entry) => entry.roomId === room.id)
			.map((entry) => entry.element);
		return extra.length > 0 ? { ...room, elements: [...room.elements, ...extra] } : room;
	}
};
