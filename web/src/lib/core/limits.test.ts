import { describe, expect, it } from 'vitest';
import { COUNT_LIMITS, LIMITS } from '../security/limits.ts';
import { grownLimit, overflowOf } from './limits.ts';
import { sampleProject } from './fixtures.ts';
import type { Project } from './schema.ts';

function filled<T>(count: number, make: (index: number) => T): T[] {
	return Array.from({ length: count }, (_, index) => make(index));
}

function emptyBriefProject(): Project {
	const project = sampleProject();
	project.brief = { persons: { adults: 1, children: 0 }, bedSizes: [], workstations: [] };
	return project;
}

describe('overflowOf', () => {
	it('is zero for a project within all limits', () => {
		for (const name of COUNT_LIMITS) expect(overflowOf(sampleProject())[name]).toBe(0);
	});

	it('counts the excess per limit and sums over containers', () => {
		const project = sampleProject();
		const room = project.rooms[0];
		room.photos = filled(LIMITS.photosPerRoom + 2, (i) => ({ ...room.photos[0], id: `p${i}` }));
		project.rooms.push({ ...structuredClone(room), id: 'r2' });
		expect(overflowOf(project).photosPerRoom).toBe(4);
		expect(overflowOf(project).rooms).toBe(0);
	});

	it('counts slopes under polygonPoints and brief lists under their limits', () => {
		const project = emptyBriefProject();
		const slope = { wall: 1, kneeHeight: 0, angle: 30 };
		project.rooms[0].slopes = filled(LIMITS.polygonPoints + 1, () => slope);
		const brief = project.brief!;
		brief.bedSizes = filled(LIMITS.briefList + 3, () => '90x200');
		brief.workstations = [{ monitors: 1, devices: filled(LIMITS.briefList + 1, () => 'x') }];
		brief.keep = filled(LIMITS.briefKeep + 2, () => ({ name: 'k' }));
		const over = overflowOf(project);
		expect(over.polygonPoints).toBe(1);
		expect(over.briefList).toBe(4);
		expect(over.briefKeep).toBe(2);
	});

	it('counts variants, items, suggestions and shopping entries', () => {
		const project = sampleProject();
		project.variants = filled(LIMITS.variants + 1, (i) => ({
			id: `v${i}`,
			name: 'A',
			source: 'user' as const,
			items: [],
			suggestions: []
		}));
		expect(overflowOf(project).variants).toBe(1);
	});
});

describe('grownLimit', () => {
	it('names the first limit whose overflow grew', () => {
		const before = overflowOf(sampleProject());
		expect(grownLimit(before, before)).toBeNull();
		expect(grownLimit(before, { ...before, variants: 1, briefKeep: 1 })).toBe('variants');
	});

	it('allows a project that is already too large to stay or shrink', () => {
		const before = { ...overflowOf(sampleProject()), variants: 5 };
		expect(grownLimit(before, { ...before, variants: 5 })).toBeNull();
		expect(grownLimit(before, { ...before, variants: 4 })).toBeNull();
		expect(grownLimit(before, { ...before, variants: 6 })).toBe('variants');
	});
});
