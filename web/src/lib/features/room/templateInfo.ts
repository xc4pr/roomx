import {
	ROOM_TEMPLATES,
	TEMPLATE_IDS,
	type TemplateId,
	type TemplateParams
} from '#lib/core/templates.ts';
import type { Point } from '#lib/core/schema.ts';
import type { Vec } from '#lib/core/geometry.ts';

export type { TemplateId, TemplateParams };
export { TEMPLATE_IDS };

export const TEMPLATE_KEYS: Record<TemplateId, readonly string[]> = {
	l: ['a', 'b', 'c', 'd'],
	u: ['a', 'b', 'c', 'd', 'e'],
	t: ['a', 'b', 'c', 'd'],
	chamfer: ['a', 'b', 'c', 'd'],
	bay: ['a', 'b', 'c', 'd', 'e'],
	notch: ['a', 'b', 'c', 'd', 'e']
};

export interface Dimension {
	key: string;
	from: Vec;
	to: Vec;
}

export function dimensionsOf(id: TemplateId, p: TemplateParams): Dimension[] {
	const dim = (key: string, from: Vec, to: Vec): Dimension => ({ key, from, to });
	switch (id) {
		case 'l':
			return [
				dim('a', { x: 0, y: 0 }, { x: p.a, y: 0 }),
				dim('b', { x: 0, y: 0 }, { x: 0, y: p.b }),
				dim('c', { x: 0, y: p.b }, { x: p.c, y: p.b }),
				dim('d', { x: p.a, y: 0 }, { x: p.a, y: p.d })
			];
		case 'u':
			return [
				dim('a', { x: 0, y: 0 }, { x: p.a, y: 0 }),
				dim('b', { x: p.a, y: 0 }, { x: p.a, y: p.b }),
				dim('c', { x: 0, y: p.b }, { x: p.c, y: p.b }),
				dim('d', { x: p.a - p.d, y: p.b }, { x: p.a, y: p.b }),
				dim('e', { x: p.a - p.d, y: p.b - p.e }, { x: p.a - p.d, y: p.b })
			];
		case 't': {
			const right = p.c + Math.round((p.a - p.c) / 2);
			return [
				dim('a', { x: right - p.a, y: p.b }, { x: right, y: p.b }),
				dim('b', { x: right, y: 0 }, { x: right, y: p.b }),
				dim('c', { x: 0, y: 0 }, { x: p.c, y: 0 }),
				dim('d', { x: p.c, y: 0 }, { x: p.c, y: p.d })
			];
		}
		case 'chamfer':
			return [
				dim('a', { x: 0, y: 0 }, { x: p.a, y: 0 }),
				dim('b', { x: 0, y: 0 }, { x: 0, y: p.b }),
				dim('c', { x: p.a - p.c, y: p.b }, { x: p.a, y: p.b }),
				dim('d', { x: p.a, y: p.b - p.d }, { x: p.a, y: p.b })
			];
		case 'bay':
			return [
				dim('a', { x: 0, y: 0 }, { x: p.a, y: 0 }),
				dim('b', { x: p.a, y: 0 }, { x: p.a, y: p.b }),
				dim('c', { x: p.e, y: p.b + p.d }, { x: p.e + p.c, y: p.b + p.d }),
				dim('d', { x: p.e + p.c, y: p.b }, { x: p.e + p.c, y: p.b + p.d }),
				dim('e', { x: 0, y: p.b }, { x: p.e, y: p.b })
			];
		case 'notch':
			return [
				dim('a', { x: 0, y: 0 }, { x: p.a, y: 0 }),
				dim('b', { x: p.a, y: 0 }, { x: p.a, y: p.b }),
				dim('c', { x: p.e, y: p.b - p.d }, { x: p.e + p.c, y: p.b - p.d }),
				dim('d', { x: p.e + p.c, y: p.b - p.d }, { x: p.e + p.c, y: p.b }),
				dim('e', { x: 0, y: p.b }, { x: p.e, y: p.b })
			];
	}
}

export interface TemplateIssue {
	kind: 'positive' | 'less' | 'sumLess';
	left: string[];
	right: string;
}

export function templateIssue(id: TemplateId, p: TemplateParams): TemplateIssue | undefined {
	const keys = TEMPLATE_KEYS[id];
	if (keys.some((key) => !(p[key] > 0))) {
		return { kind: 'positive', left: keys.filter((key) => !(p[key] > 0)), right: '' };
	}
	const less = (a: string, b: string): TemplateIssue | undefined =>
		p[a] < p[b] ? undefined : { kind: 'less', left: [a], right: b };
	const sum = (a: string, b: string, c: string): TemplateIssue | undefined =>
		p[a] + p[b] < p[c] ? undefined : { kind: 'sumLess', left: [a, b], right: c };
	switch (id) {
		case 'l':
		case 't':
		case 'chamfer':
			return less('c', 'a') ?? less('d', 'b');
		case 'u':
			return sum('c', 'd', 'a') ?? less('e', 'b');
		case 'bay':
			return sum('e', 'c', 'a');
		case 'notch':
			return sum('e', 'c', 'a') ?? less('d', 'b');
	}
}

export function templatePolygon(id: TemplateId, params: TemplateParams): Point[] | undefined {
	const template = ROOM_TEMPLATES[id];
	return template.isValid(params) ? template.build(params) : undefined;
}

function samePolygon(a: readonly Vec[], b: readonly Vec[]): boolean {
	return (
		a.length === b.length &&
		a.every((p, i) => Math.abs(p.x - b[i].x) <= 1 && Math.abs(p.y - b[i].y) <= 1)
	);
}

function invert(id: TemplateId, q: readonly Point[]): TemplateParams | undefined {
	switch (id) {
		case 'l':
			return { a: q[1].x, b: q[5].y, c: q[3].x, d: q[2].y };
		case 'u':
			return { a: q[1].x, b: q[2].y, c: q[6].x, d: q[2].x - q[3].x, e: q[3].y - q[4].y };
		case 't': {
			const a = q[4].x - q[5].x;
			return { a, b: q[4].y, c: q[1].x, d: q[2].y };
		}
		case 'chamfer':
			return { a: q[1].x, b: q[4].y, c: q[1].x - q[3].x, d: q[3].y - q[2].y };
		case 'bay':
			return { a: q[1].x, b: q[2].y, c: q[3].x - q[6].x, d: q[4].y - q[3].y, e: q[6].x };
		case 'notch':
			return { a: q[1].x, b: q[2].y, c: q[3].x - q[6].x, d: q[3].y - q[4].y, e: q[6].x };
	}
}

const POINT_COUNT: Record<TemplateId, number> = {
	l: 6,
	u: 8,
	t: 8,
	chamfer: 5,
	bay: 8,
	notch: 8
};

export function inferTemplate(
	polygon: readonly Point[]
): { id: TemplateId; params: TemplateParams } | undefined {
	const matches: { id: TemplateId; params: TemplateParams }[] = [];
	for (const id of TEMPLATE_IDS) {
		if (polygon.length !== POINT_COUNT[id]) continue;
		const params = invert(id, polygon);
		if (!params) continue;
		const template = ROOM_TEMPLATES[id];
		if (template.isValid(params) && samePolygon(template.build(params), polygon)) {
			matches.push({ id, params });
		}
	}
	if (matches.length < 2) return matches[0];
	const notch = matches.find((match) => match.id === 'notch');
	if (notch && notch.params.d < notch.params.b * 0.25) return notch;
	return matches.find((match) => match.id !== 'notch') ?? matches[0];
}

export function isRectangle(polygon: readonly Point[]): boolean {
	if (polygon.length !== 4) return false;
	const [a, b, c, d] = polygon;
	return (
		a.x === 0 &&
		a.y === 0 &&
		b.y === 0 &&
		c.x === b.x &&
		d.x === 0 &&
		d.y === c.y &&
		b.x > 0 &&
		c.y > 0
	);
}
