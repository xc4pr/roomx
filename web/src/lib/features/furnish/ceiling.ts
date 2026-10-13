import { ceilingHeightAt, itemFootprint } from '#lib/core/geometry.ts';
import type { Item, Room } from '#lib/core/schema.ts';

export interface Clearance {
	height: number;
	tooLow: boolean;
}

export function ceilingClearance(
	room: Pick<Room, 'polygon' | 'height' | 'slopes'>,
	item: Pick<Item, 'x' | 'y' | 'rotation' | 'dims' | 'elevation'>
): Clearance | undefined {
	if (!room.slopes || room.slopes.length === 0) return undefined;
	const lowest = Math.min(...itemFootprint(item).map((corner) => ceilingHeightAt(room, corner)));
	if (lowest >= room.height - 1) return undefined;
	return { height: Math.round(lowest), tooLow: item.elevation + item.dims.h > lowest + 1 };
}
