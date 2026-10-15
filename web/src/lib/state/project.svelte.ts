import { createRoom } from '#lib/core/defaults.ts';
import { boundingBox, normalizeDegrees, rotate, roomToBoard } from '#lib/core/geometry.ts';
import { newId } from '#lib/core/ids.ts';
import {
	isWallElement,
	type BoardPos,
	type Brief,
	type Item,
	type Photo,
	type Point,
	type Project,
	type Room,
	type RoomElement,
	type RoomType,
	type Variant
} from '#lib/core/schema.ts';
import { scheduleCleanup, setKeepProvider } from './cleanup.ts';
import { emptyProject, loadProject, photoHashesOf, saveProject } from './persistence.ts';
import { markSaved, markUnsaved } from './storageHealth.svelte.ts';
import { createBrowserGuard, type TabGuard, type TabGuardOptions } from './tabs.ts';

const HISTORY_LIMIT = 100;
const SAVE_DELAY = 300;
const ROOM_GAP = 500;
const RETRY_DELAY = 5000;

export type GuardHooks = Pick<
	TabGuardOptions,
	'projectId' | 'onMode' | 'onRemoteSave' | 'beforeYield'
>;
export type GuardFactory = (hooks: GuardHooks) => TabGuard | null;

export interface MutateOptions {
	// Consecutive mutations with the same key form one undo step until sealHistory() is called.
	coalesce?: string;
}

export type RoomPatch = Partial<
	Pick<Room, 'name' | 'type' | 'height' | 'notes' | 'floorColor' | 'wallColor' | 'separate'>
>;
export type ItemPatch = Partial<Omit<Item, 'id'>>;

export class ProjectStore {
	project = $state<Project | null>(null);
	readOnly = $state(false);
	#undoStack = $state.raw<Project[]>([]);
	#redoStack = $state.raw<Project[]>([]);
	#openKey: string | null = null;
	#saveTimer: ReturnType<typeof setTimeout> | null = null;
	#retryTimer: ReturnType<typeof setTimeout> | null = null;
	#saving: Promise<void> = Promise.resolve();
	#pending = new Map<string, Project>();
	#guard: TabGuard | null = null;
	#token: symbol | null = null;
	#createGuard: GuardFactory;

	canUndo = $derived(this.#undoStack.length > 0);
	canRedo = $derived(this.#redoStack.length > 0);
	activeVariant = $derived(
		this.project?.variants.find((variant) => variant.id === this.project?.activeVariantId) ?? null
	);

	constructor(options: { createGuard?: GuardFactory } = {}) {
		this.#createGuard = options.createGuard ?? createBrowserGuard;
	}

	async open(id: string): Promise<boolean> {
		await this.flush();
		this.#dropGuard();
		const token = Symbol(id);
		this.#token = token;
		const guard = this.#createGuard({
			projectId: id,
			onMode: (mode, reason) => {
				if (this.#token !== token) return;
				this.readOnly = mode === 'readonly';
				if (reason === 'lost') this.#discardPending();
				if (reason === 'lost' || reason === 'taken') void this.#reloadFromDisk(id);
			},
			onRemoteSave: () => {
				if (this.#token === token) void this.#reloadFromDisk(id);
			},
			beforeYield: () => this.flush()
		});
		this.#guard = guard;
		if (guard) await guard.acquire();
		else this.readOnly = false;
		const project = await loadProject(id);
		if (this.#token !== token) return project !== undefined;
		this.project = project ?? null;
		this.#undoStack = [];
		this.#redoStack = [];
		this.#openKey = null;
		return project !== undefined;
	}

	async close(): Promise<void> {
		await this.flush();
		this.#dropGuard();
		this.project = null;
		this.#undoStack = [];
		this.#redoStack = [];
	}

	// Gives up the edit lock when no project screen is shown, so other tabs can edit it.
	async releaseLock(): Promise<void> {
		await this.flush();
		this.#dropGuard();
	}

	// Drops the open project without saving, for when the local database is about to be erased.
	abandon(): void {
		this.#discardPending();
		if (this.#retryTimer !== null) clearTimeout(this.#retryTimer);
		this.#retryTimer = null;
		for (const id of this.#pending.keys()) markSaved(id);
		this.#pending.clear();
		this.#dropGuard();
		this.project = null;
		this.#undoStack = [];
		this.#redoStack = [];
	}

	async takeOver(): Promise<void> {
		const guard = this.#guard;
		const id = this.project?.id;
		if (!guard || !id) return;
		await guard.takeOver();
		this.readOnly = false;
		await this.#reloadFromDisk(id, true);
	}

	hasUnsaved(): boolean {
		return this.#pending.size > 0;
	}

	referencedPhotoHashes(): Set<string> {
		const hashes = new Set<string>();
		const add = (project: Project | null) => {
			if (project) for (const hash of photoHashesOf(project)) hashes.add(hash);
		};
		add(this.project);
		for (const project of this.#undoStack) add(project);
		for (const project of this.#redoStack) add(project);
		for (const project of this.#pending.values()) add(project);
		return hashes;
	}

	// Replaces the open document without history, e.g. after sync pulled a newer server state.
	replace(project: Project): void {
		this.project = project;
		this.#undoStack = [];
		this.#redoStack = [];
		this.#openKey = null;
	}

	snapshot(): Project | null {
		return this.project ? ($state.snapshot(this.project) as Project) : null;
	}

	mutate(recipe: (project: Project) => void, options: MutateOptions = {}): void {
		const project = this.project;
		if (!project || this.readOnly) return;
		if (!options.coalesce || options.coalesce !== this.#openKey) {
			this.#undoStack = [...this.#undoStack, $state.snapshot(project) as Project].slice(
				-HISTORY_LIMIT
			);
		}
		this.#openKey = options.coalesce ?? null;
		this.#redoStack = [];
		recipe(project);
		this.#touch(options.coalesce ? SAVE_DELAY : 0);
	}

	sealHistory(): void {
		this.#openKey = null;
		if (this.#saveTimer !== null) this.#schedule(0);
	}

	undo(): void {
		if (this.readOnly) return;
		const previous = this.#undoStack.at(-1);
		const current = this.snapshot();
		if (!previous || !current) return;
		this.#undoStack = this.#undoStack.slice(0, -1);
		this.#redoStack = [...this.#redoStack, current];
		this.#restore(previous);
	}

	redo(): void {
		if (this.readOnly) return;
		const next = this.#redoStack.at(-1);
		const current = this.snapshot();
		if (!next || !current) return;
		this.#redoStack = this.#redoStack.slice(0, -1);
		this.#undoStack = [...this.#undoStack, current];
		this.#restore(next);
	}

	// Saves run one after another, so a later state never gets overwritten by an earlier one.
	// A failed save keeps its snapshot and is retried; the failure is reported by saveProject.
	async flush(): Promise<void> {
		if (this.#saveTimer !== null) {
			clearTimeout(this.#saveTimer);
			this.#saveTimer = null;
			const project = this.snapshot();
			if (project && !this.readOnly) this.#pending.set(project.id, project);
		}
		for (const project of [...this.#pending.values()]) {
			this.#pending.delete(project.id);
			this.#saving = this.#saving.then(() => this.#write(project));
		}
		await this.#saving;
		if (this.#pending.size === 0 && this.#retryTimer !== null) {
			clearTimeout(this.#retryTimer);
			this.#retryTimer = null;
		}
	}

	async #write(project: Project): Promise<void> {
		try {
			await saveProject(project);
			markSaved(project.id);
		} catch {
			if (!this.#pending.has(project.id)) this.#pending.set(project.id, project);
			markUnsaved(this.#pending.get(project.id)!);
			this.#scheduleRetry();
		}
	}

	#scheduleRetry(): void {
		if (this.#retryTimer !== null) return;
		this.#retryTimer = setTimeout(() => {
			this.#retryTimer = null;
			void this.flush();
		}, RETRY_DELAY);
	}

	#discardPending(): void {
		if (this.#saveTimer !== null) clearTimeout(this.#saveTimer);
		this.#saveTimer = null;
	}

	#dropGuard(): void {
		this.#token = null;
		this.#guard?.release();
		this.#guard = null;
		this.readOnly = false;
	}

	async #reloadFromDisk(id: string, force = false): Promise<void> {
		if (!force && !this.readOnly) return;
		const fresh = await loadProject(id);
		if (!fresh || this.project?.id !== id) return;
		this.project = fresh;
		this.#undoStack = [];
		this.#redoStack = [];
		this.#openKey = null;
	}

	#restore(project: Project): void {
		this.project = project;
		this.#openKey = null;
		this.#touch(0);
	}

	// Single changes are saved right away; only continuous gestures (coalesced) are batched.
	#touch(delay: number): void {
		if (!this.project) return;
		this.project.updatedAt = new Date().toISOString();
		this.#schedule(delay);
	}

	#schedule(delay: number): void {
		if (this.#saveTimer !== null) clearTimeout(this.#saveTimer);
		this.#saveTimer = setTimeout(() => void this.flush(), delay);
	}

	room(roomId: string): Room | undefined {
		return this.project?.rooms.find((room) => room.id === roomId);
	}

	item(itemId: string): Item | undefined {
		return this.activeVariant?.items.find((item) => item.id === itemId);
	}

	roomItems(roomId: string): Item[] {
		return this.activeVariant?.items.filter((item) => item.roomId === roomId) ?? [];
	}

	rename(name: string): void {
		this.mutate((project) => (project.name = name), { coalesce: 'rename-project' });
	}

	setBrief(brief: Brief | undefined): void {
		this.mutate((project) => {
			if (brief) project.brief = brief;
			else delete project.brief;
		});
	}

	addRoom(name: string, type: RoomType = 'other'): string {
		const id = newId();
		this.mutate((project) => {
			const corners = project.rooms.flatMap((room) =>
				room.polygon.map((corner) => roomToBoard(room, corner))
			);
			const x = corners.length > 0 ? Math.round(boundingBox(corners).maxX) + ROOM_GAP : 0;
			const y = corners.length > 0 ? Math.round(boundingBox(corners).minY) : 0;
			project.rooms.push(createRoom(id, name, type, { x, y, rot: 0 }));
		});
		return id;
	}

	updateRoom(roomId: string, patch: RoomPatch, options?: MutateOptions): void {
		this.mutate((project) => {
			const room = project.rooms.find((candidate) => candidate.id === roomId);
			if (room) Object.assign(room, patch);
		}, options);
	}

	setPolygon(roomId: string, polygon: Point[], options?: MutateOptions): void {
		this.mutate((project) => {
			const room = project.rooms.find((candidate) => candidate.id === roomId);
			if (!room) return;
			room.polygon = polygon;
			room.elements = room.elements.filter(
				(element) => !isWallElement(element) || element.wall <= polygon.length
			);
			if (room.slopes) room.slopes = room.slopes.filter((slope) => slope.wall <= polygon.length);
		}, options);
	}

	setSlope(
		roomId: string,
		wallNumber: number,
		slope: { kneeHeight: number; angle: number } | null,
		options?: MutateOptions
	): void {
		this.mutate((project) => {
			const room = project.rooms.find((candidate) => candidate.id === roomId);
			if (!room) return;
			const others = (room.slopes ?? []).filter((candidate) => candidate.wall !== wallNumber);
			const next = slope ? [...others, { wall: wallNumber, ...slope }] : others;
			if (next.length > 0) room.slopes = next.sort((a, b) => a.wall - b.wall);
			else delete room.slopes;
		}, options);
	}

	moveRoom(roomId: string, boardPos: BoardPos, options?: MutateOptions): void {
		this.mutate((project) => {
			const room = project.rooms.find((candidate) => candidate.id === roomId);
			if (room) room.boardPos = boardPos;
		}, options);
	}

	duplicateRoom(roomId: string): string | undefined {
		const source = this.room(roomId);
		if (!source) return undefined;
		const id = newId();
		const copy = $state.snapshot(source) as Room;
		this.mutate((project) => {
			const box = boundingBox(copy.polygon.map((corner) => roomToBoard(copy, corner)));
			project.rooms.push({
				...copy,
				id,
				boardPos: { ...copy.boardPos, x: Math.round(box.maxX) + ROOM_GAP },
				elements: copy.elements.map((element) => ({ ...element, id: newId() })),
				photos: []
			});
		});
		return id;
	}

	removeRoom(roomId: string): void {
		this.mutate((project) => {
			project.rooms = project.rooms.filter((room) => room.id !== roomId);
			for (const variant of project.variants) {
				variant.items = variant.items.filter((item) => item.roomId !== roomId);
				variant.suggestions = variant.suggestions.filter(
					(suggestion) => suggestion.roomId !== roomId
				);
				if (variant.roomNotes) delete variant.roomNotes[roomId];
			}
		});
		scheduleCleanup();
	}

	addElement(roomId: string, element: RoomElement): void {
		this.mutate((project) => {
			project.rooms.find((room) => room.id === roomId)?.elements.push(element);
		});
	}

	updateElement<E extends RoomElement>(
		roomId: string,
		elementId: string,
		patch: Partial<Omit<E, 'id' | 'kind'>>,
		options?: MutateOptions
	): void {
		this.mutate((project) => {
			const element = project.rooms
				.find((room) => room.id === roomId)
				?.elements.find((candidate) => candidate.id === elementId);
			if (element) Object.assign(element, patch);
		}, options);
	}

	removeElement(roomId: string, elementId: string): void {
		this.mutate((project) => {
			const room = project.rooms.find((candidate) => candidate.id === roomId);
			if (room) room.elements = room.elements.filter((element) => element.id !== elementId);
		});
	}

	addPhoto(roomId: string, photo: Photo): void {
		this.mutate((project) => {
			project.rooms.find((room) => room.id === roomId)?.photos.push(photo);
		});
	}

	updatePhoto(roomId: string, photoId: string, patch: Partial<Omit<Photo, 'id' | 'hash'>>): void {
		this.mutate(
			(project) => {
				const photo = project.rooms
					.find((room) => room.id === roomId)
					?.photos.find((candidate) => candidate.id === photoId);
				if (photo) Object.assign(photo, patch);
			},
			{ coalesce: `photo-${photoId}` }
		);
	}

	removePhoto(roomId: string, photoId: string): { photo: Photo; index: number } | undefined {
		const room = this.room(roomId);
		const index = room?.photos.findIndex((photo) => photo.id === photoId) ?? -1;
		if (!room || index < 0 || this.readOnly) return undefined;
		const photo = $state.snapshot(room.photos[index]) as Photo;
		this.mutate((project) => {
			const target = project.rooms.find((candidate) => candidate.id === roomId);
			if (target) target.photos = target.photos.filter((candidate) => candidate.id !== photoId);
		});
		scheduleCleanup();
		return { photo, index };
	}

	restorePhoto(roomId: string, photo: Photo, index: number): boolean {
		const room = this.room(roomId);
		if (!room || this.readOnly || room.photos.some((candidate) => candidate.id === photo.id)) {
			return false;
		}
		this.mutate((project) => {
			const target = project.rooms.find((candidate) => candidate.id === roomId);
			target?.photos.splice(Math.min(index, target.photos.length), 0, photo);
		});
		return true;
	}

	#ensureVariant(project: Project): Variant {
		let variant = project.variants.find((candidate) => candidate.id === project.activeVariantId);
		if (!variant) {
			variant = project.variants[0];
			if (!variant) {
				variant = { id: newId(), name: 'A', source: 'user', items: [], suggestions: [] };
				project.variants.push(variant);
			}
			project.activeVariantId = variant.id;
		}
		return variant;
	}

	addVariant(name: string, copyFromId?: string): string {
		const id = newId();
		this.mutate((project) => {
			const source = project.variants.find((variant) => variant.id === copyFromId);
			const copy = source ? ($state.snapshot(source) as Variant) : undefined;
			const idMap = new Map((copy?.items ?? []).map((item) => [item.id, newId()]));
			project.variants.push({
				id,
				name,
				source: 'user',
				items: (copy?.items ?? []).map((item) => ({
					...item,
					id: idMap.get(item.id)!,
					...(item.onItemId ? { onItemId: idMap.get(item.onItemId) ?? item.onItemId } : {})
				})),
				suggestions: (copy?.suggestions ?? []).map((suggestion) => ({
					...suggestion,
					element: { ...suggestion.element, id: newId() }
				})),
				...(copy?.roomNotes ? { roomNotes: copy.roomNotes } : {})
			});
			project.activeVariantId = id;
		});
		return id;
	}

	renameVariant(variantId: string, name: string): void {
		this.mutate(
			(project) => {
				const variant = project.variants.find((candidate) => candidate.id === variantId);
				if (variant) variant.name = name;
			},
			{ coalesce: `rename-variant-${variantId}` }
		);
	}

	removeVariant(variantId: string): void {
		this.mutate((project) => {
			project.variants = project.variants.filter((variant) => variant.id !== variantId);
			if (project.activeVariantId === variantId) {
				project.activeVariantId = project.variants[0]?.id;
			}
		});
	}

	setActiveVariant(variantId: string): void {
		this.mutate((project) => {
			if (project.variants.some((variant) => variant.id === variantId)) {
				project.activeVariantId = variantId;
			}
		});
	}

	addItem(item: Omit<Item, 'id'>): string {
		const id = newId();
		this.mutate((project) => {
			this.#ensureVariant(project).items.push({ ...item, id });
		});
		return id;
	}

	updateItem(itemId: string, patch: ItemPatch, options?: MutateOptions): void {
		this.mutate((project) => {
			const item = this.#ensureVariant(project).items.find((candidate) => candidate.id === itemId);
			if (item) Object.assign(item, patch);
		}, options);
	}

	// Moves and rotates an item together with everything standing on it.
	transformItem(
		itemId: string,
		target: { x?: number; y?: number; rotation?: number; elevation?: number },
		options?: MutateOptions
	): void {
		this.mutate((project) => {
			const items = this.#ensureVariant(project).items;
			const item = items.find((candidate) => candidate.id === itemId);
			if (!item) return;
			const from = { x: item.x, y: item.y, rotation: item.rotation, elevation: item.elevation };
			const to = {
				x: Math.round(target.x ?? item.x),
				y: Math.round(target.y ?? item.y),
				rotation: normalizeDegrees(target.rotation ?? item.rotation),
				elevation: Math.round(target.elevation ?? item.elevation)
			};
			Object.assign(item, to);
			const carry = (carrierId: string) => {
				for (const child of items.filter((candidate) => candidate.onItemId === carrierId)) {
					const local = rotate(
						{ x: child.x - from.x, y: child.y - from.y },
						to.rotation - from.rotation
					);
					child.x = Math.round(to.x + local.x);
					child.y = Math.round(to.y + local.y);
					child.rotation = normalizeDegrees(child.rotation + to.rotation - from.rotation);
					child.elevation += to.elevation - from.elevation;
					carry(child.id);
				}
			};
			carry(item.id);
		}, options);
	}

	removeItem(itemId: string): void {
		this.mutate((project) => {
			const variant = this.#ensureVariant(project);
			const removed = variant.items.find((item) => item.id === itemId);
			if (!removed) return;
			variant.items = variant.items.filter((item) => item.id !== itemId);
			for (const child of variant.items.filter((item) => item.onItemId === itemId)) {
				delete child.onItemId;
				child.elevation = removed.elevation;
			}
		});
	}

	importVariants(variants: Variant[], brief?: Brief): void {
		if (variants.length === 0) return;
		this.mutate((project) => {
			project.variants.push(...variants);
			project.activeVariantId = variants[0].id;
			if (brief) project.brief = brief;
		});
	}

	acceptSuggestion(variantId: string, elementId: string): void {
		this.mutate((project) => {
			const variant = project.variants.find((candidate) => candidate.id === variantId);
			const suggestion = variant?.suggestions.find(
				(candidate) => candidate.element.id === elementId
			);
			const room = project.rooms.find((candidate) => candidate.id === suggestion?.roomId);
			if (!variant || !suggestion || !room) return;
			room.elements.push({ ...suggestion.element, status: 'planned' });
			variant.suggestions = variant.suggestions.filter(
				(candidate) => candidate.element.id !== elementId
			);
		});
	}

	rejectSuggestion(variantId: string, elementId: string): void {
		this.mutate((project) => {
			const variant = project.variants.find((candidate) => candidate.id === variantId);
			if (!variant) return;
			variant.suggestions = variant.suggestions.filter(
				(candidate) => candidate.element.id !== elementId
			);
		});
	}
}

export const store = new ProjectStore();

setKeepProvider(async () => {
	await store.flush();
	return store.referencedPhotoHashes();
});

if (typeof window !== 'undefined') {
	const saveNow = () => void store.flush();
	window.addEventListener('pagehide', saveNow);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') saveNow();
	});
	window.addEventListener('beforeunload', (event) => {
		if (!store.hasUnsaved()) return;
		event.preventDefault();
		event.returnValue = '';
	});
}

export async function createProject(name: string): Promise<string> {
	const project = emptyProject(newId(), name);
	await saveProject(project);
	return project.id;
}
