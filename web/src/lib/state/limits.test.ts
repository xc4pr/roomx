import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sampleProject } from '#lib/core/fixtures.ts';
import type {
	Brief,
	Item,
	Photo,
	Project,
	RoomElement,
	Suggestion,
	Variant
} from '#lib/core/schema.ts';
import { LIMITS, type CountLimit } from '#lib/security/limits.ts';
import { toasts } from '#lib/ui/toast.svelte.ts';
import { db } from './db.ts';
import { loadProject, saveProject } from './persistence.ts';
import { createProject, ProjectStore } from './project.svelte.ts';

const stores: ProjectStore[] = [];

const desk: Omit<Item, 'id'> = {
	roomId: 'room-rect',
	name: 'Desk',
	category: 'desk',
	dims: { w: 1600, d: 800, h: 740 },
	x: 1000,
	y: 400,
	rotation: 0,
	elevation: 0
};

function many<T>(count: number, make: (index: number) => T): T[] {
	return Array.from({ length: count }, (_, index) => make(index));
}

function photo(index: number): Photo {
	return {
		id: `photo-${index}`,
		hash: index.toString(16).padStart(64, '0'),
		perspective: { kind: 'free', caption: { de: 'x', en: 'x' } },
		w: 10,
		h: 10,
		takenAt: '2026-01-01T00:00:00.000Z'
	};
}

function element(index: number): RoomElement {
	return {
		id: `el-${index}`,
		kind: 'socket',
		status: 'planned',
		wall: 1,
		offset: 100,
		width: 160,
		height: 80,
		elevation: 260,
		gang: 1,
		usb: false
	};
}

function variant(id: string, patch: Partial<Variant> = {}): Variant {
	return { id, name: id, source: 'user', items: [], suggestions: [], ...patch };
}

function suggestion(index: number): Suggestion {
	return { roomId: 'room-rect', element: element(10_000 + index) };
}

// Opens a store on a fixture project; `fill` prepares the state that sits at the limit.
async function openAtLimit(fill: (project: Project) => void = () => {}) {
	const store = new ProjectStore();
	stores.push(store);
	const id = await createProject('Wohnung');
	await store.open(id);
	const project = sampleProject();
	project.id = id;
	fill(project);
	store.replace(project);
	return store;
}

// Runs `attempt` and checks that nothing changed: project, undo stack and toast.
async function expectBlocked(store: ProjectStore, name: CountLimit, attempt: () => unknown) {
	const original = store.project!.name;
	store.rename('Vorher');
	store.sealHistory();
	toasts.dismiss(`limit-${name}`);
	const before = JSON.stringify(store.snapshot());
	const result = attempt();
	expect(result === false || result === undefined).toBe(true);
	expect(JSON.stringify(store.snapshot())).toBe(before);
	expect(toasts.items.some((toast) => toast.id === `limit-${name}`)).toBe(true);
	store.undo();
	expect(store.project!.name).toBe(original);
	expect(store.canUndo).toBe(false);
}

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
	for (const toast of [...toasts.items]) toasts.dismiss(toast.id);
});

afterEach(() => {
	for (const store of stores.splice(0)) store.abandon();
});

describe('count limits in the project store', () => {
	it('rooms: addRoom and duplicateRoom', async () => {
		const store = await openAtLimit((project) => {
			project.rooms = many(LIMITS.rooms, (i) => ({ ...project.rooms[0], id: `r${i}` }));
		});
		await expectBlocked(store, 'rooms', () => store.addRoom('Neu'));
		await expectBlocked(store, 'rooms', () => store.duplicateRoom('r0'));
	});

	it('polygonPoints: setPolygon', async () => {
		const store = await openAtLimit();
		const polygon = many(LIMITS.polygonPoints + 1, (i) => ({ x: i * 10, y: i % 2 ? 0 : 10 }));
		await expectBlocked(store, 'polygonPoints', () => store.setPolygon('room-rect', polygon));
	});

	it('elementsPerRoom: addElement and acceptSuggestion', async () => {
		const store = await openAtLimit((project) => {
			project.rooms[0].elements = many(LIMITS.elementsPerRoom, element);
			project.variants = [variant('v', { suggestions: [suggestion(0)] })];
		});
		await expectBlocked(store, 'elementsPerRoom', () =>
			store.addElement('room-rect', element(5000))
		);
		await expectBlocked(store, 'elementsPerRoom', () =>
			store.acceptSuggestion('v', suggestion(0).element.id)
		);
	});

	it('photosPerRoom: addPhoto, addReceivedPhoto and restorePhoto', async () => {
		const store = await openAtLimit((project) => {
			project.rooms[0].photos = many(LIMITS.photosPerRoom, photo);
		});
		await expectBlocked(store, 'photosPerRoom', () => store.addPhoto('room-rect', photo(9000)));
		await expectBlocked(store, 'photosPerRoom', () =>
			store.addReceivedPhoto('room-rect', photo(9001))
		);
		await expectBlocked(store, 'photosPerRoom', () =>
			store.restorePhoto('room-rect', photo(9002), 0)
		);
	});

	it('variants: addVariant and importVariants', async () => {
		const store = await openAtLimit((project) => {
			project.variants = many(LIMITS.variants, (i) => variant(`v${i}`));
		});
		await expectBlocked(store, 'variants', () => store.addVariant('Neu', 'v0'));
		await expectBlocked(store, 'variants', () => store.importVariants([variant('imp')]));
	});

	it('itemsPerVariant: addItem and importVariants', async () => {
		const store = await openAtLimit((project) => {
			const items = many(LIMITS.itemsPerVariant, (i) => ({ ...desk, id: `i${i}` }));
			project.variants = [variant('v', { items })];
			project.activeVariantId = 'v';
		});
		await expectBlocked(store, 'itemsPerVariant', () => store.addItem(desk));
		const items = many(LIMITS.itemsPerVariant + 1, (i) => ({ ...desk, id: `n${i}` }));
		await expectBlocked(store, 'itemsPerVariant', () =>
			store.importVariants([variant('imp', { items })])
		);
	});

	it('suggestionsPerVariant: importVariants', async () => {
		const store = await openAtLimit();
		const suggestions = many(LIMITS.suggestionsPerVariant + 1, suggestion);
		await expectBlocked(store, 'suggestionsPerVariant', () =>
			store.importVariants([variant('imp', { suggestions })])
		);
	});

	it('shoppingEntries: importVariants', async () => {
		const store = await openAtLimit();
		const shoppingList = many(LIMITS.shoppingEntries + 1, (i) => ({ name: `s${i}`, qty: 1 }));
		await expectBlocked(store, 'shoppingEntries', () =>
			store.importVariants([variant('imp', { shoppingList })])
		);
	});

	it('briefList: setBrief and importVariants with a brief', async () => {
		const store = await openAtLimit();
		const brief = (bedSizes: string[]): Brief => ({
			persons: { adults: 1, children: 0 },
			bedSizes,
			workstations: []
		});
		const tooMany = many(LIMITS.briefList + 1, () => '90x200');
		await expectBlocked(store, 'briefList', () => store.setBrief(brief(tooMany)));
		await expectBlocked(store, 'briefList', () =>
			store.importVariants([variant('imp')], brief(tooMany))
		);
	});

	it('briefKeep: setBrief', async () => {
		const store = await openAtLimit();
		const keep = many(LIMITS.briefKeep + 1, (i) => ({ name: `k${i}` }));
		await expectBlocked(store, 'briefKeep', () =>
			store.setBrief({ persons: { adults: 1, children: 0 }, bedSizes: [], workstations: [], keep })
		);
	});

	it('still allows the last free slot', async () => {
		const store = await openAtLimit((project) => {
			project.variants = many(LIMITS.variants - 1, (i) => variant(`v${i}`));
		});
		expect(store.addVariant('Letzte')).toBeTypeOf('string');
		expect(store.project?.variants).toHaveLength(LIMITS.variants);
	});

	it('blocks a continued gesture and returns to the state before it', async () => {
		const store = await openAtLimit((project) => {
			project.rooms[0].elements = many(LIMITS.elementsPerRoom - 1, element);
		});
		const grow = (extra: number) =>
			store.mutate(
				(project) => {
					project.rooms[0].elements.push(...many(extra, (i) => element(7000 + i)));
				},
				{ coalesce: 'grow' }
			);
		expect(grow(1)).toBe(true);
		expect(grow(1)).toBe(false);
		expect(store.project?.rooms[0].elements).toHaveLength(LIMITS.elementsPerRoom - 1);
		expect(store.canUndo).toBe(false);
	});
});

describe('a project saved above the limits', () => {
	it('opens completely, can shrink and cannot grow further', async () => {
		const id = await createProject('Alt');
		const project = sampleProject();
		project.id = id;
		project.variants = many(LIMITS.variants + 5, (i) => variant(`v${i}`));
		project.activeVariantId = 'v0';
		await saveProject(project);
		const store = new ProjectStore();
		stores.push(store);
		expect(await store.open(id)).toBe(true);
		expect(store.project?.variants).toHaveLength(LIMITS.variants + 5);

		store.removeVariant('v1');
		expect(store.project?.variants).toHaveLength(LIMITS.variants + 4);
		expect(store.addVariant('Neu')).toBeUndefined();
		expect(toasts.items.some((toast) => toast.id === 'limit-variants')).toBe(true);
		expect(store.project?.variants).toHaveLength(LIMITS.variants + 4);

		await store.flush();
		expect((await loadProject(id))?.variants).toHaveLength(LIMITS.variants + 4);
	});
});
