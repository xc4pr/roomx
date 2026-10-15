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
	unverified: 'Masse ungeprüft',
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
			estimated: true,
			unverified: true
		});
		expect(rows[0].colors).toEqual(['#111111', '#222222']);
		expect(rows[1]).toMatchObject({ qty: 2, total: 0, estimated: false, unverified: false });
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

describe('links in rows', () => {
	it('drops links that are not http or https', () => {
		const rows = groupShopping(
			[
				item('a', { name: 'A', url: 'javascript:alert(1)' }),
				item('b', { name: 'B', url: 'https://www.ikea.com/ch/de/p/1' })
			],
			sampleLookup,
			(i) => i.name
		);
		expect(rows.find((row) => row.name === 'A')?.url).toBeUndefined();
		expect(rows.find((row) => row.name === 'B')?.url).toBe('https://www.ikea.com/ch/de/p/1');
		const plan = planRows([{ name: 'C', qty: 1, url: 'data:text/html,x' }], sampleLookup);
		expect(plan[0]?.url).toBeUndefined();
	});
});

describe('planRows', () => {
	it('marks catalogue entries whose dimensions are unverified', () => {
		const rows = planRows(
			[
				{ name: 'Tisch', qty: 1, catalogId: 'generic-desk-160x80' },
				{ name: 'Lampe', qty: 1 }
			],
			sampleLookup
		);
		expect(rows[0]).toMatchObject({ unverified: true, estimated: true });
		expect(rows[1]).toMatchObject({ unverified: false, estimated: false });
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
		expect(
			csv.startsWith('﻿Name;Marke;Menge;Einzelpreis;Summe;Richtpreis;Masse ungeprüft;Link\r\n')
		).toBe(true);
		expect(csv.endsWith('\r\n')).toBe(true);
	});

	it('flags unverified articles in their own column', () => {
		const flagged = shoppingCsv(
			groupShopping(
				[item('a', { catalogId: 'generic-desk-160x80', priceChf: 299 })],
				sampleLookup,
				(i) => i.name
			),
			[],
			labels
		);
		expect(flagged).toContain(';299.00;299.00;ja;ja;');
	});

	it('neutralises fields that a spreadsheet would run as a formula', () => {
		const evil = shoppingCsv(
			groupShopping(
				[
					item('a', { name: '=HYPERLINK("http://x.test","y")', priceChf: 1 }),
					item('b', { name: '@SUM(1+1)', priceChf: 2 }),
					item('c', { name: '+cmd', priceChf: 3 }),
					item('d', { name: '-1+1', priceChf: 4 })
				],
				sampleLookup,
				(i) => i.name
			),
			planRows([{ name: '=1+1', qty: 1, priceChf: 5 }], sampleLookup),
			labels
		);
		expect(evil).toContain('"\'=HYPERLINK(""http://x.test"",""y"")"');
		expect(evil).toContain("'@SUM(1+1)");
		expect(evil).toContain("'+cmd");
		expect(evil).toContain("'-1+1");
		expect(evil).toContain("'=1+1");
		expect(evil).not.toMatch(/(^|;|\n)"?[=+@-]/);
	});

	it('quotes special characters and writes totals', () => {
		expect(csv).toContain('"Sofa; ""alt""";;2;12.50;25.00;;;');
		expect(csv).toContain('Total;;;;25.00;;;');
		expect(csv).toContain('Lampe;;3;10.00;30.00;;;');
	});
});
