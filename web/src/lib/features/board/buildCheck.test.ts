import { describe, expect, it } from 'vitest';
import { createRoom, createElement } from '#lib/core/defaults.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import { collectWarnings } from './buildCheck.ts';

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
