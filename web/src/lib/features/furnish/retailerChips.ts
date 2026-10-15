export interface RetailerChip {
	label: string;
	selected: boolean;
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export function retailerChips(
	catalogRetailers: readonly string[],
	saved: readonly string[] | undefined
): RetailerChip[] {
	const stored = saved ?? [];
	const chips = catalogRetailers.map((label) => ({
		label,
		selected: stored.some((value) => same(value, label))
	}));
	const extra: RetailerChip[] = [];
	for (const value of stored) {
		if (catalogRetailers.some((label) => same(label, value))) continue;
		if (extra.some((chip) => same(chip.label, value))) continue;
		extra.push({ label: value, selected: true });
	}
	return [...chips, ...extra];
}

export function toggleRetailer(saved: readonly string[] | undefined, label: string): string[] {
	const stored = saved ?? [];
	return stored.some((value) => same(value, label))
		? stored.filter((value) => !same(value, label))
		: [...stored, label];
}
