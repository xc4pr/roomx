import { AnchorError, resolveAnchor, resolveOnTop } from './anchor.ts';
import type { CatalogEntry, CatalogLookup } from './catalog.ts';
import { createElement, socketWidth } from './defaults.ts';
import { footprint, lowestCeiling, normalizeDegrees } from './geometry.ts';
import { newId as randomId, type IdFactory } from './ids.ts';
import type { Plan, PlanElectrical, PlanItem, PlanRoom } from './plan.ts';
import { isWallElement } from './schema.ts';
import type { Brief, Dims, Item, Mount, Project, Room, Suggestion, Variant } from './schema.ts';
import type { Language } from './units.ts';
import { LIMITS } from '#lib/security/limits.ts';

export const WALL_MOUNT_CENTER = 1500;

export type PlanIssueCode =
	| 'wrongProject'
	| 'unknownRoom'
	| 'unknownCatalogId'
	| 'unknownCatalogIdKept'
	| 'missingDescription'
	| 'missingPosition'
	| 'unknownWall'
	| 'unknownCarrier'
	| 'lockedKept'
	| 'electricalIncomplete'
	| 'duplicateRoom'
	| 'tooManyItems'
	| 'tooManySuggestions'
	| 'tooManyVariants';

export interface PlanIssue {
	severity: 'error' | 'warning' | 'info';
	code: PlanIssueCode;
	variantIndex: number;
	roomId?: string;
	itemRef?: string;
	field?: string;
	detail?: string;
	missing?: string[];
}

export interface ResolvedPlan {
	variants: Variant[];
	brief?: Brief;
	issues: PlanIssue[];
}

export interface ResolveOptions {
	newId?: IdFactory;
	language?: Language;
}

interface Described {
	name: string;
	category: Item['category'];
	model?: Item['model'];
	mount?: Mount;
	dims: Dims;
	power?: number;
	color?: string;
	priceChf?: number;
	url?: string;
}

function missingDescription(planItem: PlanItem): string[] {
	const missing: string[] = [];
	if (!planItem.name) missing.push('name');
	if (!planItem.category) missing.push('category');
	if (!planItem.dims) missing.push('dims');
	return missing;
}

function describe(
	planItem: PlanItem,
	entry: CatalogEntry | undefined,
	language: Language
): Described | undefined {
	if (entry) {
		return {
			name: planItem.name ?? entry.name[language],
			category: entry.category,
			model: entry.model,
			mount: entry.mount,
			dims: planItem.dims ?? entry.dims,
			power: entry.power,
			color: planItem.color ?? entry.colors[0],
			priceChf: planItem.priceChf ?? entry.priceChf,
			url: planItem.url ?? entry.url
		};
	}
	const { name, category, dims } = planItem;
	if (!name || !category || !dims) return undefined;
	return {
		name,
		category,
		model: planItem.model,
		dims,
		color: planItem.color,
		priceChf: planItem.priceChf,
		url: planItem.url
	};
}

// A ceiling-mounted item hangs from the lowest ceiling point above its footprint, so it never cuts into a slope.
function hangingHeight(
	room: Room,
	placement: { x: number; y: number; rotation: number },
	dims: Dims
): number {
	return Math.floor(lowestCeiling(room, footprint({ ...placement, dims })));
}

export function itemRef(planItem: PlanItem, index: number): string {
	return planItem.id ?? planItem.catalogId ?? planItem.name ?? `#${index + 1}`;
}

function resolveRoomItems(
	planRoom: PlanRoom,
	room: Room,
	lockedIds: ReadonlySet<string>,
	lookup: CatalogLookup,
	newId: IdFactory,
	language: Language,
	report: (issue: Omit<PlanIssue, 'variantIndex' | 'roomId'>) => void
): Item[] {
	const resolved: Item[] = [];
	const byPlanId = new Map<string, Item>();
	let pending = planRoom.items.map((planItem, index) => ({ planItem, index }));

	const tryResolve = (planItem: PlanItem, index: number): 'done' | 'wait' => {
		const ref = itemRef(planItem, index);
		if (planItem.id && lockedIds.has(planItem.id)) {
			report({ severity: 'info', code: 'lockedKept', itemRef: ref });
			return 'done';
		}
		const entry = planItem.catalogId ? lookup(planItem.catalogId) : undefined;
		const ownArticle = planItem.catalogId !== undefined && !entry;
		const missing = entry ? [] : missingDescription(planItem);
		if (missing.length > 0) {
			report(
				ownArticle
					? {
							severity: 'error',
							code: 'unknownCatalogId',
							itemRef: ref,
							field: 'catalogId',
							detail: planItem.catalogId,
							missing
						}
					: {
							severity: 'error',
							code: 'missingDescription',
							itemRef: ref,
							field: missing[0],
							missing
						}
			);
			return 'done';
		}
		const described = describe(planItem, entry, language);
		if (!described) return 'done';
		let carrier: Item | undefined;
		if (planItem.on) {
			carrier = byPlanId.get(planItem.on);
			if (!carrier) return 'wait';
		}
		let placement: { x: number; y: number; rotation: number };
		if (planItem.anchor) {
			try {
				placement = resolveAnchor(room.polygon, described.dims, planItem.anchor);
			} catch (error) {
				if (!(error instanceof AnchorError)) throw error;
				report({ severity: 'error', code: 'unknownWall', itemRef: ref, field: 'anchor.wall' });
				return 'done';
			}
		} else if (planItem.x !== undefined && planItem.y !== undefined) {
			placement = {
				x: planItem.x,
				y: planItem.y,
				rotation: normalizeDegrees(planItem.rotation ?? carrier?.rotation ?? 0)
			};
		} else if (carrier) {
			placement = resolveOnTop(carrier, described.dims);
			if (planItem.rotation !== undefined) placement.rotation = normalizeDegrees(planItem.rotation);
		} else {
			report({ severity: 'error', code: 'missingPosition', itemRef: ref, field: 'anchor' });
			return 'done';
		}
		const elevation = carrier
			? carrier.elevation + carrier.dims.h
			: (planItem.elevation ??
				(described.mount === 'ceiling'
					? Math.max(0, hangingHeight(room, placement, described.dims) - described.dims.h)
					: described.mount === 'wall'
						? Math.max(0, Math.round(WALL_MOUNT_CENTER - described.dims.h / 2))
						: 0));
		const item: Item = {
			id: newId(),
			roomId: room.id,
			...(entry ? { catalogId: entry.id } : {}),
			name: described.name,
			category: described.category,
			...(described.model ? { model: described.model } : {}),
			...(described.mount ? { mount: carrier ? 'on-top' : described.mount } : {}),
			dims: described.dims,
			...placement,
			elevation,
			...(carrier ? { onItemId: carrier.id } : {}),
			...(described.color ? { color: described.color } : {}),
			...(described.power ? { power: described.power } : {}),
			...(described.priceChf !== undefined ? { priceChf: described.priceChf } : {}),
			...(described.url ? { url: described.url } : {}),
			...(planItem.note ? { note: planItem.note } : {}),
			...(planItem.locked ? { locked: true } : {})
		};
		resolved.push(item);
		if (planItem.id) byPlanId.set(planItem.id, item);
		if (ownArticle) {
			report({
				severity: 'info',
				code: 'unknownCatalogIdKept',
				itemRef: ref,
				field: 'catalogId',
				detail: planItem.catalogId
			});
		}
		return 'done';
	};

	while (pending.length > 0) {
		const waiting = pending.filter(({ planItem, index }) => tryResolve(planItem, index) === 'wait');
		if (waiting.length === pending.length) {
			for (const { planItem, index } of waiting) {
				report({
					severity: 'error',
					code: 'unknownCarrier',
					itemRef: itemRef(planItem, index),
					field: 'on'
				});
			}
			break;
		}
		pending = waiting;
	}
	return resolved;
}

function resolveElectrical(
	electrical: PlanElectrical,
	room: Room,
	newId: IdFactory
): Suggestion | 'incomplete' | 'unknownWall' {
	if (electrical.kind === 'ceilingLamp') {
		if (electrical.x === undefined || electrical.y === undefined) return 'incomplete';
		return {
			roomId: room.id,
			element: {
				id: newId(),
				kind: 'ceilingLamp',
				status: 'suggested',
				x: electrical.x,
				y: electrical.y,
				...(electrical.reason ? { reason: electrical.reason } : {})
			}
		};
	}
	if (electrical.wall === undefined || electrical.offset === undefined) return 'incomplete';
	if (electrical.wall > room.polygon.length) return 'unknownWall';
	const element = createElement(electrical.kind, room, electrical.wall, 0, newId);
	if (!isWallElement(element)) return 'incomplete';
	element.status = 'suggested';
	element.offset = electrical.offset;
	if (electrical.elevation !== undefined) element.elevation = electrical.elevation;
	if (element.kind === 'socket') {
		element.gang = electrical.gang ?? 1;
		element.usb = electrical.usb ?? false;
		element.width = socketWidth(element.gang);
	}
	if (element.kind === 'dataPort' && electrical.portType) element.portType = electrical.portType;
	if (electrical.reason) element.reason = electrical.reason;
	return { roomId: room.id, element };
}

export function resolvePlan(
	plan: Plan,
	project: Project,
	lookup: CatalogLookup,
	options: ResolveOptions = {}
): ResolvedPlan {
	const newId = options.newId ?? randomId;
	const language = options.language ?? 'de';
	const issues: PlanIssue[] = [];
	if (plan.projectId !== project.id) {
		issues.push({ severity: 'warning', code: 'wrongProject', variantIndex: 0, field: 'projectId' });
	}
	const active = project.variants.find((variant) => variant.id === project.activeVariantId);
	const locked = (active?.items ?? []).filter((item) => item.locked);
	const lockedIds = new Set(locked.map((item) => item.id));

	const overVariantLimit = project.variants.length + plan.variants.length > LIMITS.variants;
	if (overVariantLimit) {
		issues.push({
			severity: 'error',
			code: 'tooManyVariants',
			variantIndex: 0,
			detail: String(project.variants.length)
		});
	}

	const variants = plan.variants.map((planVariant, variantIndex): Variant => {
		const items: Item[] = structuredClone(locked);
		const suggestions: Suggestion[] = [];
		const roomNotes: Record<string, string> = {};
		const seenRooms = new Set<string>();
		for (const planRoom of planVariant.rooms) {
			if (seenRooms.has(planRoom.roomId)) {
				issues.push({
					severity: 'error',
					code: 'duplicateRoom',
					variantIndex,
					roomId: planRoom.roomId,
					field: 'roomId'
				});
				continue;
			}
			seenRooms.add(planRoom.roomId);
			const room = project.rooms.find((candidate) => candidate.id === planRoom.roomId);
			if (!room) {
				issues.push({
					severity: 'error',
					code: 'unknownRoom',
					variantIndex,
					roomId: planRoom.roomId,
					field: 'roomId'
				});
				continue;
			}
			const report = (issue: Omit<PlanIssue, 'variantIndex' | 'roomId'>) =>
				issues.push({ ...issue, variantIndex, roomId: room.id });
			items.push(...resolveRoomItems(planRoom, room, lockedIds, lookup, newId, language, report));
			planRoom.electrical.forEach((electrical, index) => {
				const result = resolveElectrical(electrical, room, newId);
				if (result === 'incomplete' || result === 'unknownWall') {
					report({
						severity: 'error',
						code: result === 'incomplete' ? 'electricalIncomplete' : 'unknownWall',
						itemRef: `${electrical.kind} #${index + 1}`,
						field: result === 'incomplete' ? 'offset' : 'wall'
					});
				} else {
					suggestions.push(result);
				}
			});
			if (planRoom.notes) roomNotes[room.id] = planRoom.notes;
		}
		const tooManyItems = items.length > LIMITS.itemsPerVariant;
		const tooManySuggestions = suggestions.length > LIMITS.suggestionsPerVariant;
		if (tooManyItems) {
			issues.push({
				severity: 'error',
				code: 'tooManyItems',
				variantIndex,
				detail: String(items.length)
			});
		}
		if (tooManySuggestions) {
			issues.push({
				severity: 'error',
				code: 'tooManySuggestions',
				variantIndex,
				detail: String(suggestions.length)
			});
		}
		const rejected = tooManyItems || tooManySuggestions || overVariantLimit;
		return {
			id: newId(),
			name: planVariant.name,
			source: 'ai',
			items: rejected ? [] : items,
			suggestions: rejected ? [] : suggestions,
			...(Object.keys(roomNotes).length > 0 ? { roomNotes } : {}),
			...(planVariant.shoppingList ? { shoppingList: planVariant.shoppingList } : {})
		};
	});
	return { variants, ...(plan.brief ? { brief: plan.brief } : {}), issues };
}
