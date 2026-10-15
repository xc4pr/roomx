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
import { emptyProject, loadProject, saveProject } from './persistence.ts';

const HISTORY_LIMIT = 100;
const SAVE_DELAY = 300;
const ROOM_GAP = 500;

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
	#undoStack = $state.raw<Project[]>([]);
	#redoStack = $state.raw<Project[]>([]);
	#openKey: string | null = null;
	#saveTimer: ReturnType<typeof setTimeout> | null = null;
	#saving: Promise<void> = Promise.resolve();

	canUndo = $derived(this.#undoStack.length > 0);
	canRedo = $derived(this.#redoStack.length > 0);
	activeVariant = $derived(
		this.project?.variants.find((variant) => variant.id === this.project?.activeVariantId) ?? null
	);

	async open(id: string): Promise<boolean> {
		await this.flush();
		const project = await loadProject(id);
		this.project = project ?? null;
		this.#undoStack = [];
		this.#redoStack = [];
		this.#openKey = null;
		return project !== undefined;
	}

	async close(): Promise<void> {
		await this.flush();
		this.project = null;
		this.#undoStack = [];
		this.#redoStack = [];
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
		if (!project) return;
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
		const previous = this.#undoStack.at(-1);
		const current = this.snapshot();
		if (!previous || !current) return;
		this.#undoStack = this.#undoStack.slice(0, -1);
		this.#redoStack = [...this.#redoStack, current];
		this.#restore(previous);
	}

	redo(): void {
		const next = this.#redoStack.at(-1);
		const current = this.snapshot();
		if (!next || !current) return;
		this.#redoStack = this.#redoStack.slice(0, -1);
		this.#undoStack = [...this.#undoStack, current];
		this.#restore(next);
	}

	// Saves run one after another, so a later state never gets overwritten by an earlier one.
	async flush(): Promise<void> {
		if (this.#saveTimer !== null) {
			clearTimeout(this.#saveTimer);
			this.#saveTimer = null;
			const project = this.snapshot();
			if (project) {
				this.#saving = this.#saving.then(() => saveProject(project)).catch(() => undefined);
			}
		}
		await this.#saving;
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

	removePhoto(roomId: string, photoId: string): void {
		this.mutate((project) => {
			const room = project.rooms.find((candidate) => candidate.id === roomId);
			if (room) room.photos = room.photos.filter((photo) => photo.id !== photoId);
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

if (typeof window !== 'undefined') {
	const saveNow = () => void store.flush();
	window.addEventListener('pagehide', saveNow);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') saveNow();
	});
}

export async function createProject(name: string): Promise<string> {
	const project = emptyProject(newId(), name);
	await saveProject(project);
	return project.id;
}
