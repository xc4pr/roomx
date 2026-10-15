import { describe, expect, it } from 'vitest';
import { sampleLookup, samplePlan, sampleProject, rectangleRoom } from './fixtures.ts';
import { PlanSchema, type Plan } from './plan.ts';
import { resolvePlan } from './planResolve.ts';
import type { Project, Variant } from './schema.ts';
import { sequentialIds } from './ids.ts';
import { LIMITS } from '#lib/security/limits.ts';

function manyRoomsProject(rooms: number): Project {
	const project = sampleProject();
	project.rooms = Array.from({ length: rooms }, (_, i) => rectangleRoom(`room-${i}`));
	return project;
}

function bigPlan(roomIds: string[], perRoom: number): Plan {
	return PlanSchema.parse({
		format: 'roomx-plan',
		schemaVersion: 1,
		projectId: 'project-1',
		variants: [
			{
				name: 'Gross',
				rooms: roomIds.map((roomId) => ({
					roomId,
					items: Array.from({ length: perRoom }, (_, i) => ({
						name: `Ding ${i}`,
						category: 'decor',
						dims: { w: 100, d: 100, h: 100 },
						x: 500 + (i % 20) * 10,
						y: 500
					})),
					electrical: []
				}))
			}
		]
	});
}

describe('resolvePlan limits', () => {
	it('rejects a variant whose rooms add up to more than itemsPerVariant', () => {
		const ids = Array.from({ length: 17 }, (_, i) => `room-${i}`);
		const resolved = resolvePlan(bigPlan(ids, 300), manyRoomsProject(17), sampleLookup, {
			newId: sequentialIds('n')
		});
		expect(resolved.variants[0].items).toHaveLength(0);
		expect(resolved.variants[0].suggestions).toHaveLength(0);
		const issue = resolved.issues.find((entry) => entry.code === 'tooManyItems');
		expect(issue?.severity).toBe('error');
		expect(issue?.detail).toBe('5100');
	});

	it('accepts a variant exactly at the limit', () => {
		const ids = Array.from({ length: 10 }, (_, i) => `room-${i}`);
		const resolved = resolvePlan(bigPlan(ids, 300), manyRoomsProject(10), sampleLookup, {
			newId: sequentialIds('n')
		});
		expect(resolved.variants[0].items).toHaveLength(3000);
		expect(resolved.issues.filter((entry) => entry.code === 'tooManyItems')).toEqual([]);
	});

	it('counts kept locked items towards the limit', () => {
		const project = manyRoomsProject(17);
		const locked = bigPlan(['room-0'], 300).variants[0].rooms[0].items.map((_, i) => ({
			id: `locked-${i}`,
			roomId: 'room-0',
			name: 'x',
			category: 'decor' as const,
			dims: { w: 1, d: 1, h: 1 },
			x: 0,
			y: 0,
			rotation: 0,
			elevation: 0,
			locked: true
		}));
		const variant: Variant = {
			id: 'v0',
			name: 'A',
			source: 'user',
			items: [...locked, ...locked.map((item) => ({ ...item, id: `${item.id}b` }))],
			suggestions: []
		};
		project.variants = [variant];
		project.activeVariantId = 'v0';
		const ids = Array.from({ length: 16 }, (_, i) => `room-${i + 1}`);
		const resolved = resolvePlan(bigPlan(ids, 300), project, sampleLookup, {
			newId: sequentialIds('n')
		});
		expect(resolved.issues.some((entry) => entry.code === 'tooManyItems')).toBe(true);
	});

	it('reports a repeated roomId once per extra block and skips it', () => {
		const plan = bigPlan(['room-0', 'room-0'], 5);
		const resolved = resolvePlan(plan, manyRoomsProject(1), sampleLookup, {
			newId: sequentialIds('n')
		});
		const duplicates = resolved.issues.filter((entry) => entry.code === 'duplicateRoom');
		expect(duplicates).toHaveLength(1);
		expect(duplicates[0]).toMatchObject({ severity: 'error', roomId: 'room-0', variantIndex: 0 });
		expect(resolved.variants[0].items).toHaveLength(5);
	});

	it('imports nothing when the project would exceed the variant limit', () => {
		const project = sampleProject();
		project.variants = Array.from({ length: LIMITS.variants }, (_, i) => ({
			id: `v${i}`,
			name: `V${i}`,
			source: 'user' as const,
			items: [],
			suggestions: []
		}));
		const resolved = resolvePlan(PlanSchema.parse(samplePlan()), project, sampleLookup, {
			newId: sequentialIds('n')
		});
		const issue = resolved.issues.find((entry) => entry.code === 'tooManyVariants');
		expect(issue?.severity).toBe('error');
		expect(resolved.variants.every((variant) => variant.items.length === 0)).toBe(true);
	});

	it('allows the import when exactly at the variant limit', () => {
		const project = sampleProject();
		project.variants = Array.from({ length: LIMITS.variants - 1 }, (_, i) => ({
			id: `v${i}`,
			name: `V${i}`,
			source: 'user' as const,
			items: [],
			suggestions: []
		}));
		const plan = PlanSchema.parse(samplePlan());
		plan.variants = plan.variants.slice(0, 1);
		const resolved = resolvePlan(plan, project, sampleLookup, { newId: sequentialIds('n') });
		expect(resolved.issues.some((entry) => entry.code === 'tooManyVariants')).toBe(false);
		expect(resolved.variants[0].items.length).toBeGreaterThan(0);
	});
});
