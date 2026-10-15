import { describe, expect, it } from 'vitest';
import { wallLinks } from '#lib/core/adjacency.ts';
import { WALL_THICKNESS } from '#lib/core/defaults.ts';
import { rectangleRoom } from '#lib/core/fixtures.ts';
import type { Room } from '#lib/core/schema.ts';
import { changeThickness, neighbourComponent } from './thickness.ts';

function room(id: string, w: number, h: number, x: number, y: number): Room {
	return { ...rectangleRoom(id, w, h), elements: [], boardPos: { x, y, rot: 0 } };
}

const T = WALL_THICKNESS;

function chain(): Room[] {
	return [
		room('a', 4000, 3000, 0, 0),
		room('b', 3000, 3000, 4000 + T, 0),
		room('c', 2000, 3000, 7000 + 2 * T, 0)
	];
}

function apply(rooms: Room[], moves: { roomId: string; boardPos: Room['boardPos'] }[]): Room[] {
	return rooms.map((r) => {
		const move = moves.find((m) => m.roomId === r.id);
		return move ? { ...r, boardPos: move.boardPos } : r;
	});
}

function linkOf(rooms: Room[], from: string, to: string) {
	const link = wallLinks(rooms).find((l) => l.roomId === from && l.otherRoomId === to);
	if (!link) throw new Error('no link');
	return link;
}

describe('changeThickness', () => {
	it('moves the neighbour and everything behind it in a chain', () => {
		const rooms = chain();
		const result = changeThickness(rooms, linkOf(rooms, 'a', 'b'), 250);
		expect(result.detached).toBe(false);
		expect(result.moves.map((m) => m.roomId).sort()).toEqual(['b', 'c']);
		const next = apply(rooms, result.moves);
		expect(linkOf(next, 'a', 'b').thickness).toBe(250);
		expect(linkOf(next, 'b', 'c').thickness).toBe(T);
		expect(next[2].boardPos.x - rooms[2].boardPos.x).toBe(250 - T);
	});

	it('shrinks a wall too', () => {
		const rooms = chain();
		const next = apply(rooms, changeThickness(rooms, linkOf(rooms, 'b', 'c'), 100).moves);
		expect(linkOf(next, 'b', 'c').thickness).toBe(100);
		expect(linkOf(next, 'a', 'b').thickness).toBe(T);
	});

	it('moves only the neighbour when the rooms form a ring', () => {
		const rooms = [
			room('a', 4000, 3000, 0, 0),
			room('b', 4000, 3000, 4000 + T, 0),
			room('c', 4000, 3000, 4000 + T, 3000 + T),
			room('d', 4000, 3000, 0, 3000 + T)
		];
		const link = linkOf(rooms, 'a', 'b');
		expect(neighbourComponent(rooms, link).has('a')).toBe(true);
		const result = changeThickness(rooms, link, 200);
		expect(result.detached).toBe(true);
		expect(result.moves.map((m) => m.roomId)).toEqual(['b']);
	});

	it('does nothing when the thickness is already right', () => {
		const rooms = chain();
		expect(changeThickness(rooms, linkOf(rooms, 'a', 'b'), T)).toEqual({
			moves: [],
			detached: false
		});
	});
});
