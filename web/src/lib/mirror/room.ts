import { createElement } from '#lib/core/defaults.ts';
import type { Perspective, PerspectiveKind, Room, RoomElement } from '#lib/core/schema.ts';
import { generateTour } from '#lib/features/photos/tour.ts';
import type { MirrorRoom } from './types.ts';

const PHONE_ID = /^e(\d+)$/;

export function roomFromMirror(room: MirrorRoom): Room {
	const base = { polygon: room.polygon, height: room.height };
	const elements = room.elements.map((element, index): RoomElement => {
		const id = `e${index}`;
		if (element.kind === 'ceilingLamp') {
			const point = room.polygon[0];
			return { id, kind: 'ceilingLamp', status: 'existing', x: point.x, y: point.y };
		}
		return {
			...createElement(element.kind, base, element.wall, 0, () => id),
			wall: element.wall,
			offset: element.offset,
			width: element.width
		} as RoomElement;
	});
	return {
		id: `mirror-${room.index}`,
		name: room.name,
		type: room.openAir ? 'terrace' : 'other',
		polygon: room.polygon,
		height: room.height,
		boardPos: { x: 0, y: 0, rot: 0 },
		elements,
		photos: []
	};
}

function split(stepKey: string): { prefix: string; id: string } | null {
	const match = /^(element|electric):(.+)$/.exec(stepKey);
	return match ? { prefix: match[1], id: match[2] } : null;
}

export function toPhoneStepKey(stepKey: string, elementIds: readonly string[]): string {
	const parts = split(stepKey);
	if (!parts) return stepKey;
	const index = elementIds.indexOf(parts.id);
	return index < 0 ? stepKey : `${parts.prefix}:e${index}`;
}

export function toHostStepKey(stepKey: string, elementIds: readonly string[]): string | null {
	const parts = split(stepKey);
	if (!parts) return stepKey;
	const match = PHONE_ID.exec(parts.id);
	if (!match) return null;
	const id = elementIds[Number(match[1])];
	return id === undefined ? null : `${parts.prefix}:${id}`;
}

const PREFIX_KINDS: Record<string, PerspectiveKind> = {
	corner: 'corner',
	wall: 'wall',
	ceiling: 'ceiling',
	floor: 'floor',
	element: 'element',
	electric: 'element'
};

const PHONE_CAPTION = { de: 'Foto vom Handy', en: 'Photo from phone' };

export function perspectiveFor(room: Room, stepKey: string): Perspective {
	const step = generateTour(room).find((candidate) => candidate.key === stepKey);
	if (step) return step.perspective;
	const kind = PREFIX_KINDS[stepKey.split(':')[0]] ?? 'free';
	return { kind, stepKey, caption: { ...PHONE_CAPTION } };
}

// Corner and wall steps are numbered along the polygon. Once the room has more or fewer corners
// than when the job was made, such a step may name another corner, so the photo gets none.
export function placedPerspective(
	room: Room,
	stepKey: string,
	corners: number | undefined
): Perspective {
	const renumbered =
		corners !== undefined && corners !== room.polygon.length && /^(corner|wall):/.test(stepKey);
	return renumbered
		? { kind: 'free', caption: { ...PHONE_CAPTION } }
		: perspectiveFor(room, stepKey);
}
