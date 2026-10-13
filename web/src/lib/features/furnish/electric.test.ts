import { describe, expect, it } from 'vitest';
import { rectangleRoom } from '#lib/core/fixtures.ts';
import { socketDistance } from '#lib/core/checks.ts';
import type { Item } from '#lib/core/schema.ts';
import { socketLink } from './electric.ts';

const room = rectangleRoom();

describe('socketLink', () => {
	it('agrees with the distance used by the room checks', () => {
		const item: Item = {
			id: 'tv',
			roomId: room.id,
			name: 'tv',
			category: 'electronics',
			dims: { w: 800, d: 200, h: 500 },
			x: 1500,
			y: 1500,
			rotation: 33,
			elevation: 0,
			power: 80
		};
		const link = socketLink(room.polygon, item, room.elements);
		expect(link?.distance).toBe(socketDistance(room, item, room.elements));
	});

	it('returns nothing without sockets', () => {
		const item = { x: 0, y: 0, rotation: 0, dims: { w: 100, d: 100, h: 100 } };
		expect(socketLink(room.polygon, item, [])).toBeUndefined();
	});
});
