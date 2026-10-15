import type { CatalogLookup } from '#lib/core/catalog.ts';
import type { Item, ShoppingEntry } from '#lib/core/schema.ts';
import { neutralizeFormula } from '#lib/security/csv.ts';
import { safeExternalUrl } from '#lib/security/url.ts';
import { isEstimate, isUnverified, itemPrice } from './budget.ts';

export interface ShoppingRow {
	key: string;
	catalogId?: string;
	name: string;
	brand?: string;
	qty: number;
	unitPrice?: number;
	total: number;
	estimated: boolean;
	unverified: boolean;
	url?: string;
	itemIds: string[];
	colors: string[];
}

export function groupShopping(
	items: readonly Item[],
	lookup: CatalogLookup,
	nameOf: (item: Item) => string
): ShoppingRow[] {
	const rows = new Map<string, ShoppingRow>();
	for (const item of items) {
		const price = itemPrice(item, lookup);
		const name = nameOf(item);
		const key = `${item.catalogId ?? `custom:${name}:${item.dims.w}x${item.dims.d}x${item.dims.h}`}|${price ?? ''}`;
		let row = rows.get(key);
		if (!row) {
			const entry = item.catalogId ? lookup(item.catalogId) : undefined;
			const url = safeExternalUrl(item.url) ?? safeExternalUrl(entry?.url);
			row = {
				key,
				...(item.catalogId ? { catalogId: item.catalogId } : {}),
				name,
				...(entry ? { brand: entry.brand } : {}),
				qty: 0,
				...(price !== undefined ? { unitPrice: price } : {}),
				total: 0,
				estimated: false,
				unverified: false,
				...(url ? { url } : {}),
				itemIds: [],
				colors: []
			};
			rows.set(key, row);
		}
		row.qty += 1;
		row.total = Math.round((row.total + (price ?? 0)) * 100) / 100;
		row.itemIds.push(item.id);
		if (isEstimate(item, lookup)) row.estimated = true;
		if (isUnverified(item, lookup)) row.unverified = true;
		if (item.color && !row.colors.includes(item.color)) row.colors.push(item.color);
	}
	return [...rows.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export function planRows(entries: readonly ShoppingEntry[], lookup: CatalogLookup): ShoppingRow[] {
	return entries.map((entry, index) => {
		const catalog = entry.catalogId ? lookup(entry.catalogId) : undefined;
		const price = entry.priceChf ?? catalog?.priceChf;
		const url = safeExternalUrl(entry.url) ?? safeExternalUrl(catalog?.url);
		return {
			key: `plan:${index}`,
			...(entry.catalogId ? { catalogId: entry.catalogId } : {}),
			name: entry.name,
			...(catalog ? { brand: catalog.brand } : {}),
			qty: entry.qty,
			...(price !== undefined ? { unitPrice: price } : {}),
			total: Math.round((price ?? 0) * entry.qty * 100) / 100,
			estimated: entry.priceChf === undefined ? (catalog ? !catalog.verified : false) : false,
			unverified: catalog ? !catalog.verified : false,
			...(url ? { url } : {}),
			itemIds: [],
			colors: []
		};
	});
}

export interface CsvLabels {
	name: string;
	brand: string;
	qty: string;
	unitPrice: string;
	total: string;
	estimate: string;
	unverified: string;
	link: string;
	sum: string;
	plan: string;
	yes: string;
}

function cell(value: string | number): string {
	const text = neutralizeFormula(String(value));
	return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function money(value: number | undefined): string {
	return value === undefined ? '' : value.toFixed(2);
}

export function shoppingCsv(
	rows: readonly ShoppingRow[],
	plan: readonly ShoppingRow[],
	labels: CsvLabels
): string {
	const header = [
		labels.name,
		labels.brand,
		labels.qty,
		labels.unitPrice,
		labels.total,
		labels.estimate,
		labels.unverified,
		labels.link
	];
	const line = (row: ShoppingRow, name = row.name) =>
		[
			name,
			row.brand ?? '',
			row.qty,
			money(row.unitPrice),
			money(row.total),
			row.estimated ? labels.yes : '',
			row.unverified ? labels.yes : '',
			row.url ?? ''
		]
			.map(cell)
			.join(';');
	const lines = [header.map(cell).join(';'), ...rows.map((row) => line(row))];
	const sum = rows.reduce((acc, row) => acc + row.total, 0);
	lines.push(
		[labels.sum, '', '', '', money(Math.round(sum * 100) / 100), '', '', ''].map(cell).join(';')
	);
	if (plan.length > 0) {
		lines.push('');
		lines.push([labels.plan, '', '', '', '', '', '', ''].map(cell).join(';'));
		for (const row of plan) lines.push(line(row));
	}
	return `﻿${lines.join('\r\n')}\r\n`;
}
