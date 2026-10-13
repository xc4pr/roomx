import { describe, expect, it } from 'vitest';
import { sampleLookup } from '#lib/core/fixtures.ts';
import type { Item } from '#lib/core/schema.ts';
import { groupShopping, planRows, shoppingCsv, type CsvLabels } from './shopping.ts';

function item(id: string, partial: Partial<Item> = {}): Item {
	return {
		id,
		roomId: 'r',
		name: id,
		category: 'table',
		dims: { w: 100, d: 100, h: 100 },
		x: 0,
		y: 0,
		rotation: 0,
		elevation: 0,
		...partial
	};
}

const labels: CsvLabels = {
	name: 'Name',
	brand: 'Marke',
	qty: 'Menge',
	unitPrice: 'Einzelpreis',
	total: 'Summe',
	estimate: 'Richtpreis',
	link: 'Link',
	sum: 'Total',
	plan: 'Plan',
	yes: 'ja'
};

describe('groupShopping', () => {
	const items = [
		item('a', { catalogId: 'generic-desk-160x80', priceChf: 299, color: '#111111' }),
		item('b', { catalogId: 'generic-desk-160x80', priceChf: 299, color: '#222222' }),
		item('c', { name: 'Sofa; "alt"', priceChf: 0 }),
		item('d', { name: 'Sofa; "alt"', priceChf: 0 })
	];
	const rows = groupShopping(items, sampleLookup, (i) => i.name);

	it('groups equal articles and collects colours', () => {
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			catalogId: 'generic-desk-160x80',
			qty: 2,
			total: 598,
			estimated: true
		});
		expect(rows[0].colors).toEqual(['#111111', '#222222']);
		expect(rows[1]).toMatchObject({ qty: 2, total: 0, estimated: false });
	});

	it('keeps different prices apart', () => {
		const split = groupShopping(
			[
				item('a', { catalogId: 'generic-desk-160x80', priceChf: 1 }),
				item('b', { catalogId: 'generic-desk-160x80', priceChf: 2 })
			],
			sampleLookup,
			(i) => i.name
		);
		expect(split).toHaveLength(2);
	});
});

describe('shoppingCsv', () => {
	const rows = groupShopping(
		[
			item('c', { name: 'Sofa; "alt"', priceChf: 12.5 }),
			item('d', { name: 'Sofa; "alt"', priceChf: 12.5 })
		],
		sampleLookup,
		(i) => i.name
	);
	const csv = shoppingCsv(
		rows,
		planRows([{ name: 'Lampe', qty: 3, priceChf: 10 }], sampleLookup),
		labels
	);

	it('starts with a BOM and uses semicolons and CRLF', () => {
		expect(csv.startsWith('﻿Name;Marke;Menge;Einzelpreis;Summe;Richtpreis;Link\r\n')).toBe(true);
		expect(csv.endsWith('\r\n')).toBe(true);
	});

	it('quotes special characters and writes totals', () => {
		expect(csv).toContain('"Sofa; ""alt""";;2;12.50;25.00;;');
		expect(csv).toContain('Total;;;;25.00;;');
		expect(csv).toContain('Lampe;;3;10.00;30.00;;');
	});
});
