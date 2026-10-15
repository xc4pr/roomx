import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProject, listUnreadableProjects, loadActiveProjects } from './persistence.ts';
import { db } from './db.ts';
import type { Project } from '#lib/core/schema.ts';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

async function seed(): Promise<void> {
	await db.projects.put(emptyProject('good', 'Gut'));
	await db.projects.put({ ...emptyProject('bad', 'Kaputt'), rev: 'oops' } as unknown as Project);
}

describe('unreadable projects', () => {
	it('do not stop the active projects from loading', async () => {
		await seed();
		expect((await loadActiveProjects()).map((project) => project.id)).toEqual(['good']);
	});

	it('are listed with name, raw document and error', async () => {
		await seed();
		const list = await listUnreadableProjects();
		expect(list).toHaveLength(1);
		expect(list[0].id).toBe('bad');
		expect(list[0].name).toBe('Kaputt');
		expect((list[0].raw as { id: string }).id).toBe('bad');
		expect(list[0].error).not.toBe('');
	});

	it('use the id when the document has no name, and skip trashed and deleted ones', async () => {
		await db.projects.put({ id: 'nameless', rev: 'x' } as unknown as Project);
		await db.projects.put({ ...emptyProject('gone', 'Weg'), rev: 'x', deleted: true } as never);
		await db.projects.put({ ...emptyProject('bin', 'Tonne'), rev: 'x' } as never);
		await db.trash.put({ projectId: 'bin', trashedAt: '2026-01-01T00:00:00.000Z' });
		expect((await listUnreadableProjects()).map((entry) => [entry.id, entry.name])).toEqual([
			['nameless', 'nameless']
		]);
	});
});
