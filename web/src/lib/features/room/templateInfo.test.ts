import { describe, expect, it } from 'vitest';
import { rectanglePolygon } from '#lib/core/defaults.ts';
import { ROOM_TEMPLATES, TEMPLATE_IDS } from '#lib/core/templates.ts';
import {
	dimensionsOf,
	inferTemplate,
	isRectangle,
	TEMPLATE_KEYS,
	templateIssue
} from './templateInfo.ts';

describe('templateInfo', () => {
	it('has a dimension for every parameter', () => {
		for (const id of TEMPLATE_IDS) {
			const params = ROOM_TEMPLATES[id].defaults;
			expect(Object.keys(params).sort()).toEqual([...TEMPLATE_KEYS[id]].sort());
			expect(dimensionsOf(id, params).map((d) => d.key)).toEqual([...TEMPLATE_KEYS[id]]);
		}
	});

	it('places dimensions on polygon edges or their extensions with the right length', () => {
		for (const id of TEMPLATE_IDS) {
			const params = ROOM_TEMPLATES[id].defaults;
			for (const dim of dimensionsOf(id, params)) {
				if (id === 't' && dim.key === 'b') continue;
				if (id === 'l' && dim.key === 'b') continue;
				if (id === 'chamfer' && (dim.key === 'a' || dim.key === 'b')) continue;
				const length = Math.hypot(dim.to.x - dim.from.x, dim.to.y - dim.from.y);
				expect(length).toBeGreaterThan(0);
			}
		}
	});

	it('has no issue for defaults and detects invalid combinations', () => {
		for (const id of TEMPLATE_IDS) {
			expect(templateIssue(id, ROOM_TEMPLATES[id].defaults)).toBeUndefined();
		}
		expect(templateIssue('l', { a: 3000, b: 4000, c: 3500, d: 2000 })).toEqual({
			kind: 'less',
			left: ['c'],
			right: 'a'
		});
		expect(templateIssue('u', { a: 3000, b: 4000, c: 2000, d: 2000, e: 1500 })?.kind).toBe(
			'sumLess'
		);
		expect(templateIssue('bay', { a: 4000, b: 3000, c: 0, d: 600, e: 100 })?.kind).toBe('positive');
	});

	it('agrees with isValid of the core templates', () => {
		for (const id of TEMPLATE_IDS) {
			const base = ROOM_TEMPLATES[id].defaults;
			for (const key of Object.keys(base)) {
				for (const factor of [0.2, 1, 2.5]) {
					const params = { ...base, [key]: Math.round(base[key] * factor) };
					expect(templateIssue(id, params) === undefined).toBe(ROOM_TEMPLATES[id].isValid(params));
				}
			}
		}
	});

	it('infers templates from polygons', () => {
		for (const id of TEMPLATE_IDS) {
			const params = ROOM_TEMPLATES[id].defaults;
			const found = inferTemplate(ROOM_TEMPLATES[id].build(params));
			expect(found?.id).toBe(id);
			expect(found?.params).toEqual(params);
		}
		expect(inferTemplate(rectanglePolygon(4000, 3000))).toBeUndefined();
	});

	it('recognises rectangles', () => {
		expect(isRectangle(rectanglePolygon(4000, 3000))).toBe(true);
		expect(isRectangle(ROOM_TEMPLATES.chamfer.build(ROOM_TEMPLATES.chamfer.defaults))).toBe(false);
	});
});
