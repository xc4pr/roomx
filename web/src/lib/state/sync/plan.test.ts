import { describe, expect, it } from 'vitest';
import { planSync, type LocalEntry, type RemoteEntry } from './plan.ts';

const local = (patch: Partial<LocalEntry> = {}): LocalEntry => ({
	id: 'a',
	baseRev: 2,
	dirty: false,
	deleted: false,
	...patch
});
const remote = (patch: Partial<RemoteEntry> = {}): RemoteEntry => ({
	id: 'a',
	rev: 2,
	deleted: false,
	...patch
});

describe('planSync', () => {
	it('does nothing when nothing differs', () => {
		expect(planSync([local()], [remote()])).toEqual([]);
		expect(planSync([], [])).toEqual([]);
	});

	it('pushes a dirty project whose base matches the server', () => {
		expect(planSync([local({ dirty: true })], [remote()])).toEqual([
			{ type: 'push', id: 'a', baseRev: 2 }
		]);
	});

	it('pulls a newer server state when nothing changed locally', () => {
		expect(planSync([local()], [remote({ rev: 5 })])).toEqual([
			{ type: 'pull', id: 'a', force: false }
		]);
	});

	it('creates a conflict when both sides changed', () => {
		expect(planSync([local({ dirty: true })], [remote({ rev: 3 })])).toEqual([
			{ type: 'conflict', id: 'a' }
		]);
	});

	it('creates a conflict when the server deleted a project that was edited locally', () => {
		expect(planSync([local({ dirty: true })], [remote({ rev: 3, deleted: true })])).toEqual([
			{ type: 'conflict', id: 'a' }
		]);
	});

	it('lets the server win when it changed and the project was deleted locally', () => {
		expect(planSync([local({ dirty: true, deleted: true })], [remote({ rev: 3 })])).toEqual([
			{ type: 'pull', id: 'a', force: true }
		]);
	});

	it('adopts a server tombstone without local changes', () => {
		expect(planSync([local()], [remote({ rev: 3, deleted: true })])).toEqual([
			{ type: 'pull', id: 'a', force: false }
		]);
	});

	it('pushes a local tombstone', () => {
		expect(planSync([local({ dirty: true, deleted: true })], [remote()])).toEqual([
			{ type: 'push', id: 'a', baseRev: 2 }
		]);
	});

	it('does nothing when both sides are deleted and in step', () => {
		expect(planSync([local({ deleted: true })], [remote({ deleted: true })])).toEqual([]);
	});

	it('uploads a new local project as revision zero', () => {
		expect(planSync([local({ baseRev: 0, dirty: true })], [])).toEqual([
			{ type: 'push', id: 'a', baseRev: 0 }
		]);
	});

	it('downloads a project the device does not know', () => {
		expect(planSync([], [remote()])).toEqual([{ type: 'pull', id: 'a', force: false }]);
	});

	it('ignores server tombstones of unknown projects', () => {
		expect(planSync([], [remote({ deleted: true })])).toEqual([]);
	});

	it('does not upload a local tombstone the server never saw', () => {
		expect(planSync([local({ baseRev: 0, dirty: true, deleted: true })], [])).toEqual([]);
	});

	it('re-seeds a server that lost its data', () => {
		expect(planSync([local({ baseRev: 4 })], [])).toEqual([{ type: 'push', id: 'a', baseRev: 0 }]);
	});

	it('pushes against a server that is behind the known revision', () => {
		expect(planSync([local({ baseRev: 4 })], [remote({ rev: 3 })])).toEqual([
			{ type: 'push', id: 'a', baseRev: 3 }
		]);
	});

	it('handles several projects independently and in order', () => {
		const actions = planSync(
			[
				local({ id: 'a', dirty: true }),
				local({ id: 'b' }),
				local({ id: 'c', dirty: true, baseRev: 1 }),
				local({ id: 'd', baseRev: 0, dirty: true })
			],
			[
				remote({ id: 'a' }),
				remote({ id: 'b', rev: 9 }),
				remote({ id: 'c', rev: 4 }),
				remote({ id: 'e', rev: 1 })
			]
		);
		expect(actions).toEqual([
			{ type: 'push', id: 'a', baseRev: 2 },
			{ type: 'pull', id: 'b', force: false },
			{ type: 'conflict', id: 'c' },
			{ type: 'push', id: 'd', baseRev: 0 },
			{ type: 'pull', id: 'e', force: false }
		]);
	});
});
