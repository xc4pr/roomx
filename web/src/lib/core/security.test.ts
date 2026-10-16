import { describe, expect, it } from 'vitest';
import { LIMITS, storedLimit } from '../security/limits.ts';
import { CatalogEntrySchema } from './catalog.ts';
import { sampleCatalog, sampleLookup, samplePlan, sampleProject } from './fixtures.ts';
import { sequentialIds } from './ids.ts';
import { migrateProject } from './migrations.ts';
import { PlanSchema, type Plan } from './plan.ts';
import { resolvePlan } from './planResolve.ts';
import { ItemSchema, ProjectSchema, type Item, type Project } from './schema.ts';

const DANGEROUS_LINKS = [
	'javascript:alert(document.domain)',
	'JAVASCRIPT:alert(1)',
	'data:text/html,<script>alert(1)</script>',
	'vbscript:msgbox(1)',
	'file:///etc/passwd'
];

function clone<T>(value: T): T {
	return structuredClone(value);
}

function planWithItem(patch: Record<string, unknown>): unknown {
	const plan: Plan = clone(samplePlan());
	Object.assign(plan.variants[0].rooms[0].items[0], patch);
	return plan;
}

function issuePaths(raw: unknown): string[] {
	const result = PlanSchema.safeParse(raw);
	if (result.success) return [];
	return result.error.issues.map((issue) => issue.path.join('.'));
}

function item(patch: Partial<Item> = {}): Item {
	return {
		id: 'i1',
		roomId: 'room-rect',
		name: 'Regal',
		category: 'shelf',
		dims: { w: 800, d: 300, h: 1800 },
		x: 1000,
		y: 1000,
		rotation: 0,
		elevation: 0,
		...patch
	};
}

function projectWith(patch: Partial<Project>): unknown {
	return { ...sampleProject(), ...patch };
}

describe('links in a plan', () => {
	it('accepts normal shop links', () => {
		expect(
			PlanSchema.safeParse(planWithItem({ url: 'https://www.ikea.com/ch/de/p/malm/' })).success
		).toBe(true);
	});

	it.each(DANGEROUS_LINKS)('rejects %s on an item', (url) => {
		expect(issuePaths(planWithItem({ url }))).toContain('variants.0.rooms.0.items.0.url');
	});

	it('rejects dangerous links in the shopping list', () => {
		const plan = clone(samplePlan());
		plan.variants[0].shoppingList![0].url = 'javascript:alert(1)';
		expect(issuePaths(plan)).toContain('variants.0.shoppingList.0.url');
	});

	it('treats an empty link as no link', () => {
		const parsed = PlanSchema.parse(planWithItem({ url: '  ' }));
		expect(parsed.variants[0].rooms[0].items[0].url).toBeUndefined();
	});

	it('rejects a link without scheme and over-long links', () => {
		expect(issuePaths(planWithItem({ url: 'ikea.ch/x' }))).toContain(
			'variants.0.rooms.0.items.0.url'
		);
		expect(
			issuePaths(planWithItem({ url: `https://example.org/${'a'.repeat(LIMITS.url)}` }))
		).toContain('variants.0.rooms.0.items.0.url');
	});
});

describe('links in stored projects and backups', () => {
	it('drops dangerous links but still loads the project', () => {
		for (const url of DANGEROUS_LINKS) {
			const project = projectWith({
				variants: [
					{
						id: 'v1',
						name: 'A',
						source: 'ai',
						items: [item({ url })],
						suggestions: [],
						shoppingList: [{ name: 'Regal', qty: 1, url }]
					}
				]
			});
			const parsed = ProjectSchema.parse(project);
			expect(parsed.variants[0].items[0].url).toBeUndefined();
			expect(parsed.variants[0].shoppingList?.[0].url).toBeUndefined();
		}
	});

	it('keeps good links and repairs a link typed without scheme', () => {
		const project = projectWith({
			variants: [
				{
					id: 'v1',
					name: 'A',
					source: 'user',
					items: [
						item({ url: 'https://www.ikea.com/ch/de/' }),
						item({ id: 'i2', url: 'ikea.ch/x' })
					],
					suggestions: []
				}
			]
		});
		const parsed = ProjectSchema.parse(project);
		expect(parsed.variants[0].items.map((entry) => entry.url)).toEqual([
			'https://www.ikea.com/ch/de/',
			'https://ikea.ch/x'
		]);
	});

	it('goes through migrateProject like a backup does', () => {
		const raw = JSON.parse(
			JSON.stringify(
				projectWith({
					variants: [
						{
							id: 'v1',
							name: 'A',
							source: 'user',
							items: [item({ url: 'javascript:alert(1)' })],
							suggestions: []
						}
					]
				})
			)
		);
		expect(migrateProject(raw).variants[0].items[0].url).toBeUndefined();
	});

	it('drops colours that could carry extra CSS', () => {
		const parsed = ItemSchema.parse(
			item({ color: 'red; background-image: url(https://evil.example/x)' })
		);
		expect(parsed.color).toBeUndefined();
		expect(ItemSchema.parse(item({ color: '#aabbcc' })).color).toBe('#aabbcc');
	});
});

describe('catalog links', () => {
	it('allows only http and https', () => {
		const entry = sampleCatalog[0];
		expect(
			CatalogEntrySchema.safeParse({ ...entry, url: 'https://www.ikea.com/ch/de/' }).success
		).toBe(true);
		for (const url of DANGEROUS_LINKS) {
			expect(CatalogEntrySchema.safeParse({ ...entry, url }).success).toBe(false);
		}
	});
});

describe('limits in a plan', () => {
	it('names the list and the maximum when an item list is too long', () => {
		const plan = clone(samplePlan());
		const first = plan.variants[0].rooms[0].items[3];
		plan.variants[0].rooms[0].items = Array.from(
			{ length: LIMITS.planItemsPerRoom + 1 },
			() => first
		);
		const result = PlanSchema.safeParse(plan);
		expect(result.success).toBe(false);
		if (result.success) return;
		const issue = result.error.issues.find((entry) => entry.code === 'too_big');
		expect(issue?.path).toEqual(['variants', 0, 'rooms', 0, 'items']);
		expect(issue).toMatchObject({ maximum: LIMITS.planItemsPerRoom, origin: 'array' });
	});

	it('limits variants, rooms and electrical entries', () => {
		const plan = clone(samplePlan());
		plan.variants = Array.from({ length: LIMITS.planVariants + 1 }, () => plan.variants[0]);
		expect(issuePaths(plan)).toContain('variants');
		const rooms = clone(samplePlan());
		rooms.variants[0].rooms = Array.from(
			{ length: LIMITS.planRooms + 1 },
			() => rooms.variants[0].rooms[0]
		);
		expect(issuePaths(rooms)).toContain('variants.0.rooms');
		const electrical = clone(samplePlan());
		const room = electrical.variants[0].rooms[0];
		room.electrical = Array.from(
			{ length: LIMITS.planElectricalPerRoom + 1 },
			() => room.electrical[0]
		);
		expect(issuePaths(electrical)).toContain('variants.0.rooms.0.electrical');
	});

	it('limits the length of names, notes and ids', () => {
		expect(issuePaths(planWithItem({ name: 'x'.repeat(LIMITS.name + 1) }))).toContain(
			'variants.0.rooms.0.items.0.name'
		);
		expect(issuePaths(planWithItem({ note: 'x'.repeat(LIMITS.text + 1) }))).toContain(
			'variants.0.rooms.0.items.0.note'
		);
		expect(issuePaths(planWithItem({ id: 'x'.repeat(LIMITS.id + 1) }))).toContain(
			'variants.0.rooms.0.items.0.id'
		);
		const notes = clone(samplePlan());
		notes.variants[0].rooms[0].notes = 'x'.repeat(LIMITS.text + 1);
		expect(issuePaths(notes)).toContain('variants.0.rooms.0.notes');
	});

	it('still accepts values right at the limits', () => {
		expect(
			PlanSchema.safeParse(
				planWithItem({ name: 'x'.repeat(LIMITS.name), note: 'x'.repeat(LIMITS.text) })
			).success
		).toBe(true);
	});
});

describe('limits in a project', () => {
	it('accepts a project with the sample content and with values at the limits', () => {
		expect(ProjectSchema.safeParse(sampleProject()).success).toBe(true);
		const full = sampleProject();
		full.name = 'x'.repeat(LIMITS.name);
		full.rooms[0].notes = 'x'.repeat(LIMITS.text);
		expect(ProjectSchema.safeParse(full).success).toBe(true);
	});

	it('rejects absurd amounts instead of loading them', () => {
		const rooms = sampleProject();
		rooms.rooms = Array.from({ length: storedLimit('rooms') + 1 }, () => rooms.rooms[0]);
		expect(ProjectSchema.safeParse(rooms).success).toBe(false);
		const name = sampleProject();
		name.rooms[0].name = 'x'.repeat(LIMITS.name + 1);
		expect(ProjectSchema.safeParse(name).success).toBe(false);
		const items = sampleProject();
		items.variants = [
			{
				id: 'v',
				name: 'A',
				source: 'user',
				items: Array.from({ length: storedLimit('itemsPerVariant') + 1 }, () => item()),
				suggestions: []
			}
		];
		expect(ProjectSchema.safeParse(items).success).toBe(false);
		const photos = sampleProject();
		const photo = {
			id: 'p',
			hash: 'a'.repeat(64),
			perspective: { kind: 'free' as const, caption: { de: 'x', en: 'x' } },
			w: 10,
			h: 10,
			takenAt: '2026-01-01T00:00:00.000Z'
		};
		photos.rooms[0].photos = Array.from({ length: storedLimit('photosPerRoom') + 1 }, () => photo);
		expect(ProjectSchema.safeParse(photos).success).toBe(false);
		const captions = sampleProject();
		captions.rooms[0].photos = [
			{
				...photo,
				perspective: {
					...photo.perspective,
					caption: { de: 'x'.repeat(LIMITS.caption + 1), en: 'x' }
				}
			}
		];
		expect(ProjectSchema.safeParse(captions).success).toBe(false);
	});

	it('loads a project with more variants than editing allows, unchanged', () => {
		const project = sampleProject();
		const variant = { id: 'v', name: 'A', source: 'user' as const, items: [], suggestions: [] };
		project.variants = Array.from({ length: LIMITS.variants + 1 }, (_, index) => ({
			...variant,
			id: `v${index}`
		}));
		const loaded = migrateProject(JSON.parse(JSON.stringify(project)));
		expect(loaded.variants).toHaveLength(LIMITS.variants + 1);
		project.variants = Array.from({ length: storedLimit('variants') + 1 }, () => variant);
		expect(() => migrateProject(JSON.parse(JSON.stringify(project)))).toThrow();
	});

	it('loads data saved before the limits existed', () => {
		const old = JSON.parse(
			JSON.stringify({
				...sampleProject(),
				brief: { persons: { adults: 1, children: 0 }, wishes: 'x'.repeat(1000) },
				variants: [
					{
						id: 'v-old',
						name: 'Alt',
						source: 'ai',
						items: [
							item({ id: 'a', url: 'www.ikea.com/ch', color: 'weiss', note: 'x'.repeat(500) }),
							item({ id: 'b', url: 'https://example.org/p?q=1', color: '#112233' })
						],
						suggestions: [],
						shoppingList: [{ name: 'Regal', qty: 2, url: 'https://example.org/' }],
						roomNotes: { 'room-rect': 'Hinweis' }
					}
				]
			})
		);
		const loaded = migrateProject(old);
		expect(loaded.variants[0].items).toHaveLength(2);
		expect(loaded.variants[0].items[0]).toMatchObject({
			url: 'https://www.ikea.com/ch',
			color: 'weiss'
		});
		expect(loaded.variants[0].items[1]).toMatchObject({ url: 'https://example.org/p?q=1' });
		expect(loaded.variants[0].roomNotes).toEqual({ 'room-rect': 'Hinweis' });
		expect(loaded.brief?.wishes).toHaveLength(1000);
	});
});

describe('unknown catalogue ids', () => {
	function resolveItems(items: unknown[]) {
		const plan = clone(samplePlan());
		plan.variants[0].rooms[0].items = items as Plan['variants'][0]['rooms'][0]['items'];
		plan.variants[0].rooms[0].electrical = [];
		return resolvePlan(PlanSchema.parse(plan), sampleProject(), sampleLookup, {
			newId: sequentialIds()
		});
	}

	it('imports the item as a custom article when name, category and dims are given', () => {
		const resolved = resolveItems([
			{
				catalogId: 'unbekannt-regal-80',
				name: 'Regal Eiche',
				category: 'shelf',
				dims: { w: 800, d: 300, h: 1800 },
				priceChf: 120,
				anchor: { wall: 1, offset: 500 }
			}
		]);
		expect(resolved.variants[0].items).toHaveLength(1);
		const created = resolved.variants[0].items[0];
		expect(created).toMatchObject({ name: 'Regal Eiche', category: 'shelf', priceChf: 120 });
		expect(created.catalogId).toBeUndefined();
		expect(resolved.issues).toEqual([
			expect.objectContaining({
				severity: 'info',
				code: 'unknownCatalogIdKept',
				detail: 'unbekannt-regal-80'
			})
		]);
	});

	it('reports exactly what is missing for an unknown id', () => {
		const resolved = resolveItems([
			{
				catalogId: 'unbekannt-a',
				dims: { w: 800, d: 300, h: 1800 },
				anchor: { wall: 1, offset: 500 }
			},
			{ catalogId: 'unbekannt-b', anchor: { wall: 1, offset: 500 } }
		]);
		expect(resolved.variants[0].items).toEqual([]);
		expect(resolved.issues).toEqual([
			expect.objectContaining({
				severity: 'error',
				code: 'unknownCatalogId',
				detail: 'unbekannt-a',
				missing: ['name', 'category']
			}),
			expect.objectContaining({
				severity: 'error',
				code: 'unknownCatalogId',
				detail: 'unbekannt-b',
				missing: ['name', 'category', 'dims']
			})
		]);
	});

	it('names the missing field for an item without catalogue id', () => {
		const resolved = resolveItems([
			{ name: 'Etwas', category: 'shelf', anchor: { wall: 1, offset: 0 } }
		]);
		expect(resolved.issues).toEqual([
			expect.objectContaining({ code: 'missingDescription', field: 'dims', missing: ['dims'] })
		]);
	});
});
