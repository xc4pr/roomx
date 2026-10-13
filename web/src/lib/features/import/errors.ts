import type { ZodError } from 'zod';
import type { CatalogLookup } from '#lib/core/catalog.ts';
import type { Plan } from '#lib/core/plan.ts';
import { itemRef, type PlanIssue } from '#lib/core/planResolve.ts';
import type { Project } from '#lib/core/schema.ts';
import type { Language } from '#lib/core/units.ts';
import { elementKindNames } from '#lib/i18n/common.ts';
import { translator, type Translate } from '#lib/features/export/text.ts';
import { messages } from './i18n.ts';

export type ImportKey = keyof (typeof messages)['de'];

export interface DescribeContext {
	project: Pick<Project, 'rooms'>;
	lookup: CatalogLookup;
	language: Language;
}

type Segment = string | number;

function valueAt(root: unknown, path: readonly Segment[]): unknown {
	let current = root;
	for (const segment of path) {
		if (typeof current !== 'object' || current === null) return undefined;
		current = (current as Record<Segment, unknown>)[segment];
	}
	return current;
}

function record(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function text(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

export function roomLabel(
	context: DescribeContext,
	roomId: string | undefined,
	fallback: string
): string {
	const room = context.project.rooms.find((candidate) => candidate.id === roomId);
	return room?.name || roomId || fallback;
}

export function itemLabel(
	context: DescribeContext,
	raw: unknown,
	index: number,
	tr: Translate<ImportKey>
): string {
	const item = record(raw);
	const catalogId = text(item?.catalogId);
	return (
		text(item?.name) ??
		(catalogId ? context.lookup(catalogId)?.name[context.language] : undefined) ??
		text(item?.id) ??
		catalogId ??
		tr('pathItem', { n: index + 1 })
	);
}

function fieldPath(path: readonly Segment[]): string {
	return path.reduce<string>(
		(out, segment) =>
			typeof segment === 'number' ? `${out}[${segment + 1}]` : out ? `${out}.${segment}` : segment,
		''
	);
}

export function describePath(
	path: readonly Segment[],
	raw: unknown,
	context: DescribeContext,
	tr: Translate<ImportKey> = translator(messages, context.language)
): string {
	const labels: string[] = [];
	let index = 0;
	if (path[0] === 'variants' && typeof path[1] === 'number') {
		labels.push(tr('pathVariant', { n: path[1] + 1 }));
		index = 2;
		if (path[index] === 'rooms' && typeof path[index + 1] === 'number') {
			const roomIndex = path[index + 1] as number;
			const planRoom = valueAt(raw, path.slice(0, index + 2));
			labels.push(
				roomLabel(context, text(record(planRoom)?.roomId), tr('pathRoom', { n: roomIndex + 1 }))
			);
			index += 2;
			if (path[index] === 'items' && typeof path[index + 1] === 'number') {
				labels.push(
					itemLabel(context, valueAt(raw, path.slice(0, index + 2)), path[index + 1] as number, tr)
				);
				index += 2;
			} else if (path[index] === 'electrical' && typeof path[index + 1] === 'number') {
				const entry = record(valueAt(raw, path.slice(0, index + 2)));
				const kind = text(entry?.kind);
				const kindName =
					kind && kind in elementKindNames[context.language]
						? elementKindNames[context.language][kind as keyof (typeof elementKindNames)['de']]
						: (kind ?? '');
				labels.push(
					tr('pathElectrical', { kind: kindName, n: (path[index + 1] as number) + 1 }).trim()
				);
				index += 2;
			}
		} else if (path[index] === 'shoppingList' && typeof path[index + 1] === 'number') {
			labels.push(tr('pathShopping', { n: (path[index + 1] as number) + 1 }));
			index += 2;
		}
	} else if (path[0] === 'brief') {
		labels.push(tr('pathBrief'));
		index = 1;
	}
	const rest = fieldPath(path.slice(index));
	if (rest) labels.push(rest);
	if (labels.length === 0) labels.push(tr('pathPlan'));
	return labels.join(' › ');
}

function typeName(value: unknown, tr: Translate<ImportKey>): string {
	if (value === null) return tr('type_null');
	if (value === undefined) return tr('type_undefined');
	if (Array.isArray(value)) return tr('type_array');
	switch (typeof value) {
		case 'string':
			return tr('type_string');
		case 'number':
			return tr('type_number');
		case 'boolean':
			return tr('type_boolean');
		default:
			return tr('type_object');
	}
}

function expectedName(expected: unknown, tr: Translate<ImportKey>): string {
	switch (expected) {
		case 'string':
			return tr('type_string');
		case 'number':
			return tr('type_number');
		case 'int':
			return tr('type_int');
		case 'boolean':
			return tr('type_boolean');
		case 'array':
			return tr('type_array');
		case 'object':
			return tr('type_object');
		default:
			return String(expected);
	}
}

function shown(value: unknown): string {
	if (typeof value === 'string')
		return `"${value.length > 40 ? `${value.slice(0, 40)}...` : value}"`;
	if (value === undefined) return '-';
	const json = JSON.stringify(value);
	return json.length > 40 ? `${json.slice(0, 40)}...` : json;
}

interface IssueLike {
	code: string;
	path: PropertyKey[];
	message: string;
	[key: string]: unknown;
}

export function describeIssueMessage(
	issue: IssueLike,
	raw: unknown,
	tr: Translate<ImportKey>
): string {
	const path = issue.path.filter((segment): segment is Segment => typeof segment !== 'symbol');
	const received = valueAt(raw, path);
	const origin = issue.origin;
	switch (issue.code) {
		case 'invalid_type':
			if (received === undefined || received === null) return tr('issueRequired');
			if (issue.expected === 'int') return tr('issueInt');
			return tr('issueType', {
				expected: expectedName(issue.expected, tr),
				received: typeName(received, tr)
			});
		case 'invalid_value': {
			const values = Array.isArray(issue.values) ? issue.values : [];
			if (path.length === 1 && path[0] === 'format') return tr('issueFormatField');
			if (path.length === 1 && path[0] === 'schemaVersion') {
				return tr('issueVersionField', { received: shown(received), expected: String(values[0]) });
			}
			const list = values.slice(0, 8).map((value) => String(value));
			return tr('issueOneOf', {
				values: values.length > 8 ? `${list.join(', ')}, ...` : list.join(', '),
				received: shown(received)
			});
		}
		case 'too_small': {
			const min = String(issue.minimum);
			if (origin === 'array' || origin === 'set') return tr('issueMinItems', { min });
			if (origin === 'string') return tr('issueMinChars', { min });
			return tr(issue.inclusive === false ? 'issueMinExclusive' : 'issueMin', { min });
		}
		case 'too_big': {
			const max = String(issue.maximum);
			if (origin === 'array' || origin === 'set') return tr('issueMaxItems', { max });
			if (origin === 'string') return tr('issueMaxChars', { max });
			return tr(issue.inclusive === false ? 'issueMaxExclusive' : 'issueMax', { max });
		}
		case 'invalid_format':
			return tr('issueFormat');
		default:
			return tr('issueGeneric', { message: issue.message });
	}
}

export function describeZodError(
	error: ZodError,
	raw: unknown,
	context: DescribeContext
): string[] {
	const tr = translator(messages, context.language);
	const lines = error.issues.map((issue) => {
		const where = describePath(
			issue.path.filter((segment): segment is Segment => typeof segment !== 'symbol'),
			raw,
			context,
			tr
		);
		return `${where}: ${describeIssueMessage(issue as IssueLike, raw, tr)}`;
	});
	return [...new Set(lines)];
}

const ISSUE_KEYS = {
	wrongProject: 'planWrongProject',
	unknownRoom: 'planUnknownRoom',
	unknownCatalogId: 'planUnknownCatalogId',
	missingDescription: 'planMissingDescription',
	missingPosition: 'planMissingPosition',
	unknownWall: 'planUnknownWall',
	unknownCarrier: 'planUnknownCarrier',
	lockedKept: 'planLockedKept',
	electricalIncomplete: 'planElectricalIncomplete'
} as const satisfies Record<PlanIssue['code'], ImportKey>;

export interface ReadableIssue {
	severity: PlanIssue['severity'];
	variantIndex: number;
	where: string;
	message: string;
}

function issueItemLabel(
	issue: PlanIssue,
	context: DescribeContext,
	tr: Translate<ImportKey>,
	plan: Plan | undefined
): string {
	const ref = issue.itemRef ?? '';
	const planRoom = plan?.variants[issue.variantIndex]?.rooms.find(
		(candidate) => candidate.roomId === issue.roomId
	);
	const index = planRoom?.items.findIndex((candidate, i) => itemRef(candidate, i) === ref) ?? -1;
	if (planRoom && index >= 0) return itemLabel(context, planRoom.items[index], index, tr);
	const electrical = /^(\w+) #(\d+)$/.exec(ref);
	if (electrical && electrical[1] in elementKindNames[context.language]) {
		const kind = electrical[1] as keyof (typeof elementKindNames)['de'];
		return tr('pathElectrical', {
			kind: elementKindNames[context.language][kind],
			n: electrical[2]
		});
	}
	return context.lookup(ref)?.name[context.language] ?? ref;
}

export function describePlanIssue(
	issue: PlanIssue,
	context: DescribeContext,
	plan?: Plan
): ReadableIssue {
	const tr = translator(messages, context.language);
	const parts = [tr('pathVariant', { n: issue.variantIndex + 1 })];
	if (issue.roomId) parts.push(roomLabel(context, issue.roomId, issue.roomId));
	if (issue.itemRef) {
		const label = issueItemLabel(issue, context, tr, plan);
		parts.push(issue.field ? `${label} (${issue.field})` : label);
	} else if (issue.field && issue.code !== 'unknownRoom') {
		parts.push(issue.field);
	}
	return {
		severity: issue.severity,
		variantIndex: issue.variantIndex,
		where: parts.join(' › '),
		message: tr(ISSUE_KEYS[issue.code], { id: issue.roomId ?? '' })
	};
}
