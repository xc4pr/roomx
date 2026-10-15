import { describe, expect, it } from 'vitest';
import { sequentialIds } from '#lib/core/ids.ts';
import { ProjectSchema } from '#lib/core/schema.ts';
import { buildSampleProject } from './sample.ts';

const names = { project: 'Beispiel', room: 'Wohnzimmer' };

describe('buildSampleProject', () => {
	const project = buildSampleProject({
		language: 'de',
		names,
		now: '2026-01-01T00:00:00.000Z',
		ids: sequentialIds('s')
	});

	it('is a valid project', () => {
		expect(ProjectSchema.safeParse(project).success).toBe(true);
	});

	it('has one room with a door, a window and a socket', () => {
		expect(project.name).toBe('Beispiel');
		expect(project.rooms).toHaveLength(1);
		expect(project.rooms[0].name).toBe('Wohnzimmer');
		expect(project.rooms[0].elements.map((element) => element.kind).sort()).toEqual([
			'door',
			'socket',
			'window'
		]);
	});

	it('has two pieces of furniture in the active variant', () => {
		const variant = project.variants.find((candidate) => candidate.id === project.activeVariantId);
		expect(variant?.items).toHaveLength(2);
		for (const item of variant?.items ?? []) expect(item.roomId).toBe(project.rooms[0].id);
	});

	it('names the furniture in the requested language', () => {
		const english = buildSampleProject({ language: 'en', names, ids: sequentialIds('e') });
		const german = project.variants[0].items.map((item) => item.name);
		expect(english.variants[0].items.map((item) => item.name)).not.toEqual(german);
	});

	it('gives every piece its own id', () => {
		const ids = [
			project.id,
			project.rooms[0].id,
			...project.rooms[0].elements.map((element) => element.id),
			project.variants[0].id,
			...project.variants[0].items.map((item) => item.id)
		];
		expect(new Set(ids).size).toBe(ids.length);
	});
});
