import { describe, expect, it } from 'vitest';
import { LIMITS, storedLimit } from '#lib/security/limits.ts';
import { migrateProject } from './migrations.ts';
import { SCHEMA_VERSION } from './schema.ts';

function base(): Record<string, unknown> {
	return {
		id: 'p',
		name: 'Haus',
		schemaVersion: SCHEMA_VERSION,
		rev: 0,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		rooms: [],
		variants: []
	};
}

function room(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id,
		name: 'Raum',
		type: 'bedroom',
		polygon: [
			{ x: 0, y: 0 },
			{ x: 4000, y: 0 },
			{ x: 4000, y: 3000 },
			{ x: 0, y: 3000 }
		],
		height: 2500,
		boardPos: { x: 0, y: 0, rot: 0 },
		elements: [],
		photos: [],
		...extra
	};
}

describe('repair of over-long strings on load', () => {
	it('limits are generous', () => {
		expect(LIMITS.text).toBe(50000);
		expect(LIMITS.caption).toBe(5000);
	});

	it('cuts a too long project name', () => {
		const project = migrateProject({ ...base(), name: 'x'.repeat(LIMITS.name + 50) });
		expect(project.name).toHaveLength(LIMITS.name);
	});

	it('cuts a too long room note', () => {
		const document = { ...base(), rooms: [room('r', { notes: 'n'.repeat(LIMITS.text + 10) })] };
		expect(migrateProject(document).rooms[0].notes).toHaveLength(LIMITS.text);
	});

	it('does not modify the input', () => {
		const document = { ...base(), name: 'x'.repeat(LIMITS.name + 1) };
		migrateProject(document);
		expect(document.name).toHaveLength(LIMITS.name + 1);
	});

	it('never cuts a too long list', () => {
		const rooms = Array.from({ length: storedLimit('rooms') + 1 }, (_, index) => room(`r${index}`));
		expect(() => migrateProject({ ...base(), rooms })).toThrow();
	});
});
