import { withMirroredOpenings } from '#lib/core/adjacency.ts';
import { stairZonesForRoom } from '#lib/core/floors.ts';
import { checkRoomItems, type ItemIssue } from '#lib/core/checks.ts';
import type { CatalogLookup } from '#lib/core/catalog.ts';
import type { Plan } from '#lib/core/plan.ts';
import type { ResolvedPlan } from '#lib/core/planResolve.ts';
import {
	isOpenAir,
	type Item,
	type ItemCategory,
	type Project,
	type Room
} from '#lib/core/schema.ts';
import { formatLength, type Language, type LengthUnit } from '#lib/core/units.ts';
import { translator, type Translate } from '#lib/features/export/text.ts';
import { elementKindNames } from '#lib/i18n/common.ts';
import { describePlanIssue, floorNameOf, type ImportKey, type ReadableIssue } from './errors.ts';
import { messages } from './i18n.ts';

const FURNITURE: readonly ItemCategory[] = [
	'bed',
	'sofa',
	'armchair',
	'chair',
	'officeChair',
	'table',
	'desk',
	'wardrobe',
	'shelf',
	'dresser',
	'sideboard',
	'tvUnit',
	'nightstand'
];

export type ItemGroup = 'furniture' | 'decor' | 'devices';

export function itemGroup(category: ItemCategory): ItemGroup {
	if (FURNITURE.includes(category)) return 'furniture';
	return category === 'electronics' ? 'devices' : 'decor';
}

export interface PreviewConflict {
	code: ItemIssue['code'];
	severity: 'error' | 'warning';
	text: string;
}

export interface PreviewRoom {
	roomId: string;
	name: string;
	floorName?: string;
	furniture: number;
	decor: number;
	devices: number;
	sockets: number;
	electrical: number;
	errors: PreviewConflict[];
	warnings: PreviewConflict[];
	summary: string;
}

export interface PreviewVariant {
	index: number;
	name: string;
	rooms: PreviewRoom[];
	totalChf: number;
	unpriced: number;
	itemCount: number;
	suggestionCount: number;
	issues: ReadableIssue[];
	skipped: number;
}

export interface PreviewOptions {
	project: Project;
	lookup: CatalogLookup;
	language: Language;
	unit: LengthUnit;
}

const CONFLICT_KEYS = {
	outsideRoom: 'conflictOutsideRoom',
	tooTall: 'conflictTooTall',
	underSlope: 'conflictUnderSlope',
	collision: 'conflictCollision',
	elementCollision: 'conflictElementCollision',
	doorBlocked: 'conflictDoorBlocked',
	windowBlocked: 'conflictWindowBlocked',
	radiatorBlocked: 'conflictRadiatorBlocked',
	fireZone: 'conflictFireZone',
	airflowBlocked: 'conflictAirflowBlocked',
	onStair: 'conflictOnStair',
	inStairwell: 'conflictInStairwell',
	socketFar: 'conflictSocketFar'
} as const satisfies Record<ItemIssue['code'], ImportKey>;

export function roomSummary(
	counts: Pick<PreviewRoom, 'furniture' | 'decor' | 'devices' | 'sockets' | 'electrical'>,
	tr: Translate<ImportKey>
): string {
	const part = (n: number, base: 'furniture' | 'decor' | 'devices' | 'sockets' | 'electrical') =>
		n > 0 ? [tr(n === 1 ? `${base}_one` : `${base}_other`, { n })] : [];
	const parts = [
		...part(counts.furniture, 'furniture'),
		...part(counts.decor, 'decor'),
		...part(counts.devices, 'devices'),
		...part(counts.sockets, 'sockets'),
		...part(counts.electrical, 'electrical')
	];
	return parts.length > 0 ? parts.join(', ') : tr('roomNoItems');
}

function conflictText(
	issue: ItemIssue,
	room: Room,
	items: ReadonlyMap<string, Item>,
	options: PreviewOptions,
	tr: Translate<ImportKey>
): string {
	const name = (index: number) => items.get(issue.itemIds[index])?.name ?? tr('unknownItem');
	if (issue.code === 'socketFar' && issue.distance === undefined) {
		return tr('conflictSocketNone', { a: name(0) });
	}
	const element = issue.elementId
		? room.elements.find((candidate) => candidate.id === issue.elementId)
		: undefined;
	const key =
		issue.code === 'tooTall' && isOpenAir(room)
			? 'conflictTooTallCover'
			: CONFLICT_KEYS[issue.code];
	return tr(key, {
		a: name(0),
		b: name(1),
		element: element ? elementKindNames[options.language][element.kind] : '',
		distance:
			issue.distance !== undefined
				? formatLength(issue.distance, options.unit, options.language)
				: ''
	});
}

export function buildPreview(
	plan: Plan,
	resolved: ResolvedPlan,
	options: PreviewOptions
): PreviewVariant[] {
	const tr = translator(messages, options.language);
	const context = { project: options.project, lookup: options.lookup, language: options.language };
	const connected = withMirroredOpenings(options.project.rooms);
	return resolved.variants.map((variant, index) => {
		const planRoomIds = plan.variants[index]?.rooms.map((room) => room.roomId) ?? [];
		const roomIds = [...new Set(planRoomIds)].filter((id) =>
			options.project.rooms.some((room) => room.id === id)
		);
		const items = new Map(variant.items.map((item) => [item.id, item]));
		const rooms = roomIds.map((roomId): PreviewRoom => {
			const room = connected.find((candidate) => candidate.id === roomId)!;
			const roomItems = variant.items.filter((item) => item.roomId === roomId);
			const suggestions = variant.suggestions
				.filter((suggestion) => suggestion.roomId === roomId)
				.map((suggestion) => suggestion.element);
			const counts = { furniture: 0, decor: 0, devices: 0 };
			for (const item of roomItems) counts[itemGroup(item.category)]++;
			const sockets = suggestions.filter((element) => element.kind === 'socket').length;
			const electrical = suggestions.length - sockets;
			const conflicts = checkRoomItems(
				room,
				variant.items,
				suggestions,
				stairZonesForRoom(options.project, room)
			).map((issue): PreviewConflict => ({
				code: issue.code,
				severity: issue.severity,
				text: conflictText(issue, room, items, options, tr)
			}));
			const base = { ...counts, sockets, electrical };
			return {
				roomId,
				name: room.name,
				...(floorNameOf(options.project, room)
					? { floorName: floorNameOf(options.project, room) }
					: {}),
				...base,
				errors: conflicts.filter((conflict) => conflict.severity === 'error'),
				warnings: conflicts.filter((conflict) => conflict.severity === 'warning'),
				summary: roomSummary(base, tr)
			};
		});
		const issues = resolved.issues
			.filter((issue) => issue.variantIndex === index)
			.map((issue) => describePlanIssue(issue, context, plan));
		return {
			index,
			name: variant.name,
			rooms,
			totalChf: variant.items.reduce((sum, item) => sum + (item.priceChf ?? 0), 0),
			unpriced: variant.items.filter((item) => item.priceChf === undefined).length,
			itemCount: variant.items.length,
			suggestionCount: variant.suggestions.length,
			issues,
			skipped: issues.filter((issue) => issue.severity === 'error').length
		};
	});
}
