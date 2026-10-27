import { describe, expect, it } from 'vitest';
import { createRoom, createElement } from '#lib/core/defaults.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import { WALL_THICKNESS } from '#lib/core/defaults.ts';
import { collectWarnings, isError } from './buildCheck.ts';

const none = () => ({ done: 0, total: 0 });

describe('collectWarnings', () => {
	it('warns when there are no rooms', () => {
		expect(collectWarnings([], none)).toEqual([{ kind: 'noRooms' }]);
	});

	it('is quiet for a clean room', () => {
		expect(collectWarnings([createRoom('r', 'Raum 1')], none)).toEqual([]);
	});

	it('reports element problems and missing photos', () => {
		const room = createRoom('r', 'Raum 1');
		const ids = sequentialIds();
		room.elements.push(createElement('window', room, 1, 2000, ids));
		room.elements.push(createElement('window', room, 1, 2100, ids));
		const warnings = collectWarnings([room], () => ({ done: 1, total: 3 }));
		expect(warnings.map((w) => w.kind)).toEqual(['issue', 'photos']);
		expect(warnings[1]).toEqual({ kind: 'photos', roomId: 'r', done: 1, total: 3 });
	});

	it('does not warn when all photos are taken', () => {
		expect(collectWarnings([createRoom('r', 'A')], () => ({ done: 2, total: 2 }))).toEqual([]);
	});
});

describe('new element findings', () => {
	it('flags an element that does not fit the room type as a hint, not an error', () => {
		const room = createRoom('r', 'Wohnen', 'living');
		room.elements.push(createElement('toilet', room, 1, 1000, sequentialIds()));
		const warnings = collectWarnings([room], none);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatchObject({ kind: 'issue', issue: { code: 'elementNotForRoomType' } });
		expect(isError(warnings[0])).toBe(false);
	});

	it('reports a roof window outside any slope', () => {
		const room = createRoom('r', 'Dach', 'other');
		room.elements.push(createElement('roofWindow', room, 1, 1000, sequentialIds()));
		const codes = collectWarnings([room], none).map((w) =>
			w.kind === 'issue' ? w.issue.code : ''
		);
		expect(codes).toContain('roofWindowOffSlope');
	});

	it('reports overlapping fixtures on one wall', () => {
		const room = createRoom('r', 'Bad', 'bath');
		const ids = sequentialIds();
		room.elements.push(
			createElement('washbasin', room, 1, 1000, ids),
			createElement('shower', room, 1, 1200, ids)
		);
		const codes = collectWarnings([room], none).map((w) =>
			w.kind === 'issue' ? w.issue.code : ''
		);
		expect(codes).toContain('elementOverlap');
	});

	it('does not block on a clean bath', () => {
		const room = createRoom('r', 'Bad', 'bath');
		room.elements.push(createElement('toilet', room, 1, 1000, sequentialIds()));
		expect(collectWarnings([room], none)).toEqual([]);
	});
});

describe('unconnected rooms', () => {
	const apart = (gap: number) => [
		createRoom('a', 'Wohnzimmer'),
		createRoom('b', 'Bad', 'bath', { x: 4000 + gap, y: 0, rot: 0 })
	];

	it('reports every room without a shared wall as an error, first in the list', () => {
		const rooms = apart(900);
		rooms[0].elements.push(createElement('window', rooms[0], 1, 2000, sequentialIds()));
		rooms[0].elements.push(createElement('window', rooms[0], 1, 2100, sequentialIds()));
		const warnings = collectWarnings(rooms, none);
		expect(warnings.slice(0, 2)).toEqual([
			{ kind: 'unconnected', roomId: 'a' },
			{ kind: 'unconnected', roomId: 'b' }
		]);
		expect(warnings.slice(2).map((warning) => warning.kind)).toEqual(['issue']);
		expect(warnings.map(isError)).toEqual([true, true, false]);
	});

	it('is quiet when the rooms share a wall', () => {
		expect(collectWarnings(apart(WALL_THICKNESS), none)).toEqual([]);
	});

	it('names only the lonely room when a third one is connected', () => {
		const rooms = [
			...apart(WALL_THICKNESS),
			createRoom('c', 'Keller', 'storage', { x: 0, y: 9000, rot: 0 })
		];
		expect(collectWarnings(rooms, none)).toEqual([{ kind: 'unconnected', roomId: 'c' }]);
	});

	it('does not complain about a single room', () => {
		expect(collectWarnings([createRoom('a', 'Allein')], none)).toEqual([]);
	});

	it('stays quiet for a room marked as deliberately separate', () => {
		const rooms = apart(900);
		rooms[1].separate = true;
		expect(collectWarnings(rooms, none).filter((w) => w.kind === 'unconnected')).toEqual([
			{ kind: 'unconnected', roomId: 'a' }
		]);
		rooms[0].separate = true;
		expect(collectWarnings(rooms, none)).toEqual([]);
	});
});

describe('collectWarnings for a scope of rooms', () => {
	const rooms = [
		createRoom('a', 'Wohnzimmer'),
		createRoom('b', 'Bad', 'bath', { x: 4000 + 900, y: 0, rot: 0 }),
		createRoom('c', 'Keller', 'storage', { x: 0, y: 9000, rot: 0 })
	];
	rooms[1].elements.push(createElement('window', rooms[1], 1, 2000, sequentialIds()));
	rooms[1].elements.push(createElement('window', rooms[1], 1, 2100, sequentialIds()));

	it('checks the whole project when no scope is given', () => {
		expect(collectWarnings(rooms, none).map((warning) => warning.kind)).toEqual([
			'unconnected',
			'unconnected',
			'unconnected',
			'issue'
		]);
	});

	it('limits unconnected rooms and element issues to the chosen rooms', () => {
		expect(collectWarnings(rooms, none, ['a'])).toEqual([{ kind: 'unconnected', roomId: 'a' }]);
		expect(collectWarnings(rooms, none, ['b']).map((warning) => warning.kind)).toEqual([
			'unconnected',
			'issue'
		]);
	});

	it('still counts a neighbour outside the scope as a connection', () => {
		const joined = [
			createRoom('a', 'Wohnzimmer'),
			createRoom('b', 'Bad', 'bath', { x: 4000 + WALL_THICKNESS, y: 0, rot: 0 })
		];
		expect(collectWarnings(joined, none, ['a'])).toEqual([]);
	});

	it('reports missing photos only for the chosen rooms', () => {
		const progress = (room: { id: string }) =>
			room.id === 'a' ? { done: 0, total: 2 } : { done: 2, total: 2 };
		expect(
			collectWarnings(rooms, progress, ['b', 'c']).map((warning) => warning.kind)
		).not.toContain('photos');
		expect(collectWarnings(rooms, progress, ['a']).map((warning) => warning.kind)).toContain(
			'photos'
		);
	});

	it('asks for rooms when the scope is empty', () => {
		expect(collectWarnings(rooms, none, [])).toEqual([{ kind: 'noRooms' }]);
	});
});

describe('unconnected rooms with floors', () => {
	it('groups a room without a floorId with the first floor', () => {
		const floors = [
			{ id: 'eg', name: 'EG', slabThickness: 300 },
			{ id: 'og', name: 'OG', slabThickness: 300 }
		];
		const rooms = [
			{ ...createRoom('a', 'Lose'), boardPos: { x: 0, y: 9000, rot: 0 } },
			{ ...createRoom('b', 'Wohnen'), floorId: 'eg' },
			{
				...createRoom('d', 'Bad', 'bath', { x: 4000 + WALL_THICKNESS, y: 0, rot: 0 }),
				floorId: 'eg'
			},
			{ ...createRoom('c', 'Oben'), floorId: 'og' }
		];
		const warnings = collectWarnings(rooms, none, undefined, [], floors);
		expect(warnings.filter((w) => w.kind === 'unconnected')).toEqual([
			{ kind: 'unconnected', roomId: 'a' }
		]);
	});
});
