import { createRoom } from '#lib/core/defaults.ts';
import { boundingBox, normalizeDegrees, rotate, roomToBoard } from '#lib/core/geometry.ts';
import { newId } from '#lib/core/ids.ts';
import { grownLimit, overflowOf } from '#lib/core/limits.ts';
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
import { LIMITS } from '#lib/security/limits.ts';
import { scheduleCleanup, setKeepProvider } from './cleanup.ts';
import { announceLimit } from './limits.ts';
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

interface Snapshot {
	seq: number;
	project: Project;
}

export class ProjectStore {
	project = $state<Project | null>(null);
	readOnly = $state(false);
	#undoStack = $state.raw<Project[]>([]);
	#redoStack = $state.raw<Project[]>([]);
	#openKey: string | null = null;
	#saveTimer: ReturnType<typeof setTimeout> | null = null;
	#retryTimer: ReturnType<typeof setTimeout> | null = null;
	#saving: Promise<void> = Promise.resolve();
	#pending = new Map<string, Snapshot>();
	#latest = new Map<string, number>();
	#written = new Map<string, number>();
	#seq = 0;
	#writing = 0;
	#changes = 0;
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
		this.#latest.clear();
		this.#written.clear();
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

	// True while a change waits for its save timer, for a write to start, or is being written.
	hasUnsaved(): boolean {
		return this.#pending.size > 0 || this.#writing > 0 || this.#saveTimer !== null;
	}

	// Counts local changes (not replace()); lets callers tell whether the project moved on.
	changeCount(): number {
		return this.#changes;
	}

	referencedPhotoHashes(): Set<string> {
		const hashes = new Set<string>();
		const add = (project: Project | null) => {
			if (project) for (const hash of photoHashesOf(project)) hashes.add(hash);
		};
		add(this.project);
		for (const project of this.#undoStack) add(project);
		for (const project of this.#redoStack) add(project);
		for (const entry of this.#pending.values()) add(entry.project);
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

	// Returns false when nothing was applied: no project, read-only, or a count limit would grow.
	mutate(recipe: (project: Project) => void, options: MutateOptions = {}): boolean {
		const project = this.project;
		if (!project || this.readOnly) return false;
		const before = overflowOf(project);
		const fresh = !options.coalesce || options.coalesce !== this.#openKey;
		const undo = this.#undoStack;
		const redo = this.#redoStack;
		if (fresh) {
			this.#undoStack = [...undo, $state.snapshot(project) as Project].slice(-HISTORY_LIMIT);
		}
		this.#openKey = options.coalesce ?? null;
		this.#redoStack = [];
		recipe(project);
		const hit = grownLimit(before, overflowOf(project));
		if (hit) {
			// Back to the state before this change; in a continued gesture (not fresh) that is the
			// state before the whole gesture, whose snapshot is the top of the undo stack.
			const previous = this.#undoStack.at(-1);
			this.#openKey = null;
			if (fresh) {
				this.#undoStack = undo;
				this.#redoStack = redo;
			} else {
				this.#undoStack = this.#undoStack.slice(0, -1);
			}
			// Without a snapshot (not reachable in practice) the project cannot be rolled back.
			if (previous) this.project = previous;
			if (!fresh) this.#touch(0);
			announceLimit(hit);
			return false;
		}
		this.#touch(options.coalesce ? SAVE_DELAY : 0);
		return true;
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

	// Saves run one after another. Every snapshot has a rising number per project and the newest
	// always wins: a failed older snapshot is dropped, a finished write retires older pending ones.
	async flush(): Promise<void> {
		if (this.#saveTimer !== null) {
			clearTimeout(this.#saveTimer);
			this.#saveTimer = null;
			const project = this.snapshot();
			if (project && !this.readOnly) this.#enqueue(project);
		}
		for (const entry of [...this.#pending.values()]) {
			this.#pending.delete(entry.project.id);
			this.#writing++;
			this.#saving = this.#saving.then(async () => {
				try {
					await this.#write(entry);
				} finally {
					this.#writing--;
				}
			});
		}
		await this.#saving;
		if (this.#pending.size === 0 && this.#retryTimer !== null) {
			clearTimeout(this.#retryTimer);
			this.#retryTimer = null;
		}
	}

	#enqueue(project: Project): void {
		const seq = ++this.#seq;
		this.#latest.set(project.id, seq);
		this.#pending.set(project.id, { seq, project });
	}

	async #write(entry: Snapshot): Promise<void> {
		const { seq, project } = entry;
		const id = project.id;
		if ((this.#written.get(id) ?? 0) >= seq) return;
		try {
			await saveProject(project);
		} catch {
			if (this.#latest.get(id) !== seq || (this.#written.get(id) ?? 0) >= seq) return;
			if (!this.#pending.has(id)) this.#pending.set(id, entry);
			markUnsaved(this.#pending.get(id)!.project);
			this.#scheduleRetry();
			return;
		}
		if (this.#latest.has(id)) this.#written.set(id, Math.max(this.#written.get(id) ?? 0, seq));
		const queued = this.#pending.get(id);
		if (queued && queued.seq <= seq) this.#pending.delete(id);
		if (this.#latest.get(id) === seq && !this.#pending.has(id)) markSaved(id);
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
		this.#changes++;
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

	addRoom(name: string, type: RoomType = 'other'): string | undefined {
		const id = newId();
		const applied = this.mutate((project) => {
			const corners = project.rooms.flatMap((room) =>
				room.polygon.map((corner) => roomToBoard(room, corner))
			);
			const x = corners.length > 0 ? Math.round(boundingBox(corners).maxX) + ROOM_GAP : 0;
			const y = corners.length > 0 ? Math.round(boundingBox(corners).minY) : 0;
			project.rooms.push(createRoom(id, name, type, { x, y, rot: 0 }));
		});
		return applied ? id : undefined;
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
		const applied = this.mutate((project) => {
			const box = boundingBox(copy.polygon.map((corner) => roomToBoard(copy, corner)));
			project.rooms.push({
				...copy,
				id,
				boardPos: { ...copy.boardPos, x: Math.round(box.maxX) + ROOM_GAP },
				elements: copy.elements.map((element) => ({ ...element, id: newId() })),
				photos: []
			});
		});
		return applied ? id : undefined;
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

	addPhoto(roomId: string, photo: Photo): boolean {
		return this.mutate((project) => {
			project.rooms.find((room) => room.id === roomId)?.photos.push(photo);
		});
	}

	// A photo from another device (photo mirror) joins the open project and every undo and redo
	// state that has its room, without an undo step of its own: the sender deletes its copy once
	// the photo is saved, so undo must never drop it, and the user's redo stays.
	addReceivedPhoto(roomId: string, photo: Photo): boolean {
		const room = this.room(roomId);
		if (!room || this.readOnly) return false;
		if (room.photos.length >= LIMITS.photosPerRoom) {
			announceLimit('photosPerRoom');
			return false;
		}
		room.photos.push(photo);
		for (const state of [...this.#undoStack, ...this.#redoStack]) {
			const target = state.rooms.find((candidate) => candidate.id === roomId);
			if (target && !target.photos.some((candidate) => candidate.id === photo.id)) {
				target.photos.push(structuredClone(photo));
			}
		}
		this.#touch(0);
		return true;
	}

	// Takes back a received photo that could not be saved, again outside the history.
	dropReceivedPhoto(roomId: string, photoId: string): void {
		if (!this.project) return;
		for (const state of [this.project, ...this.#undoStack, ...this.#redoStack]) {
			const target = state.rooms.find((candidate) => candidate.id === roomId);
			if (target) target.photos = target.photos.filter((candidate) => candidate.id !== photoId);
		}
		this.#touch(0);
		scheduleCleanup();
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
		if (room.photos.length >= LIMITS.photosPerRoom) {
			announceLimit('photosPerRoom');
			return false;
		}
		return this.mutate((project) => {
			const target = project.rooms.find((candidate) => candidate.id === roomId);
			target?.photos.splice(Math.min(index, target.photos.length), 0, photo);
		});
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

	addVariant(name: string, copyFromId?: string): string | undefined {
		const id = newId();
		const applied = this.mutate((project) => {
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
		return applied ? id : undefined;
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

	addItem(item: Omit<Item, 'id'>): string | undefined {
		const id = newId();
		const applied = this.mutate((project) => {
			this.#ensureVariant(project).items.push({ ...item, id });
		});
		return applied ? id : undefined;
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

	importVariants(variants: Variant[], brief?: Brief): boolean {
		if (variants.length === 0) return false;
		return this.mutate((project) => {
			project.variants.push(...variants);
			project.activeVariantId = variants[0].id;
			if (brief) project.brief = brief;
		});
	}

	acceptSuggestion(variantId: string, elementId: string): boolean {
		return this.mutate((project) => {
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
